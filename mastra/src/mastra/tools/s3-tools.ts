import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

/**
 * S3クライアントの初期化
 * AgentCore環境では自動的に認証情報が取得される
 */
const s3Client = new S3Client({
  region: process.env.AWS_REGION || "us-west-2",
});

/**
 * CDKレポートのJSONスキーマ
 */
const cdkReportSchema = z.object({
  generatedAt: z.string().describe("レポート生成日時（ISO 8601形式）"),
  period: z.object({
    from: z.string().describe("対象期間の開始日時"),
    to: z.string().describe("対象期間の終了日時"),
  }),
  summary: z.object({
    totalPRs: z.number().describe("PRの総数"),
    categories: z.record(z.string(), z.number()).describe("カテゴリごとのPR数"),
  }),
  pullRequests: z.array(
    z.object({
      number: z.number().describe("PR番号"),
      title: z.string().describe("PRタイトル"),
      url: z.string().describe("PRのURL"),
      author: z.string().describe("作成者"),
      createdAt: z.string().describe("PR発行日時（ISO 8601形式）"),
      mergedAt: z.string().describe("マージ日時"),
      labels: z.array(z.string()).describe("ラベル一覧"),
      category: z.string().describe("カテゴリ（feat, fix, docs, chore等）"),
      summary: z.string().describe("エージェントによる要約"),
      keyPoints: z.array(z.string()).describe("重要ポイント"),
      files: z.object({
        added: z.number().describe("追加ファイル数"),
        modified: z.number().describe("変更ファイル数"),
        removed: z.number().describe("削除ファイル数"),
      }),
    })
  ),
});

/**
 * 構造化JSONレポートをS3に保存するツール
 */
export const saveReportToS3 = createTool({
  id: "save-report-to-s3",
  description:
    "生成した構造化JSONレポートをS3バケットに保存します。レポートの分析結果を永続化する際に使用してください。",
  inputSchema: z.object({
    report: cdkReportSchema.describe("保存するレポートデータ"),
    filename: z
      .string()
      .describe("ファイル名（.json拡張子なしでも可、自動付与される）。省略時はレポート対象期間の終了日を使用")
      .optional(),
    prefix: z
      .string()
      .describe("S3キーのプレフィックス（フォルダパス）")
      .default("reports"),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    objectKey: z.string().optional(),
    bucketName: z.string().optional(),
    s3Uri: z.string().optional(),
    error: z.string().optional(),
  }),
  execute: async ({ context }) => {
    const { report, filename, prefix } = context;

    try {
      const bucketName = process.env.REPORT_BUCKET_NAME;
      if (!bucketName) {
        throw new Error(
          "REPORT_BUCKET_NAME environment variable is not set"
        );
      }

      // ファイル名の決定（省略時はレポート対象期間の終了日を使用）
      const baseFilename = filename || `cdk-report-${report.period.to.split("T")[0]}`;

      // ファイル名の正規化（.json拡張子の確保）
      const normalizedFilename = baseFilename.endsWith(".json")
        ? baseFilename
        : `${baseFilename}.json`;

      // タイムスタンプ付きのオブジェクトキーを生成
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const objectKey = `${prefix}/${timestamp}-${normalizedFilename}`;

      // JSONに変換
      const jsonContent = JSON.stringify(report, null, 2);

      // S3にアップロード
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: objectKey,
        Body: jsonContent,
        ContentType: "application/json; charset=utf-8",
        Metadata: {
          "generated-by": "cdk-report-agent",
          "generated-at": new Date().toISOString(),
          "report-period-from": report.period.from,
          "report-period-to": report.period.to,
        },
      });

      await s3Client.send(command);

      return {
        success: true,
        objectKey,
        bucketName,
        s3Uri: `s3://${bucketName}/${objectKey}`,
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "不明なエラーが発生しました",
      };
    }
  },
});
