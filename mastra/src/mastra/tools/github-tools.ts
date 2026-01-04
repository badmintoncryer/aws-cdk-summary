import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { Octokit } from "@octokit/rest";

/**
 * GitHub APIクライアントの初期化
 * GitHub APIトークンは環境変数GITHUB_TOKENから取得（オプション）
 * トークンがない場合は公開APIの制限内で動作
 */
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

/**
 * 指定期間内にマージされたPRを取得するツール
 */
export const fetchRecentMergedPRs = createTool({
  id: "fetch-recent-merged-prs",
  description:
    "指定したGitHubリポジトリで指定期間内にマージされたプルリクエストを取得します。日付を指定しない場合は過去24時間のPRを取得します。",
  inputSchema: z.object({
    owner: z
      .string()
      .describe("リポジトリのオーナー名（例: 'aws'）")
      .default("aws"),
    repo: z
      .string()
      .describe("リポジトリ名（例: 'aws-cdk'）")
      .default("aws-cdk"),
    startDate: z
      .string()
      .describe("取得開始日（YYYY-MM-DD形式、例: '2024-01-01'）。省略時は24時間前")
      .optional(),
    endDate: z
      .string()
      .describe("取得終了日（YYYY-MM-DD形式、例: '2024-01-31'）。省略時は現在日時")
      .optional(),
  }),
  execute: async ({ context }) => {
    const { owner, repo, startDate, endDate } = context;

    try {
      // 日付範囲の計算
      let fromDate: string;
      let toDate: string;

      if (startDate) {
        // YYYY-MM-DD形式をそのまま使用
        fromDate = startDate;
      } else {
        // デフォルト: 24時間前
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        fromDate = since.toISOString().split("T")[0];
      }

      if (endDate) {
        toDate = endDate;
      } else {
        // デフォルト: 現在日時
        toDate = new Date().toISOString().split("T")[0];
      }

      // GitHub Search APIを使用してマージ済みPRを検索
      // 期間指定: merged:YYYY-MM-DD..YYYY-MM-DD
      const searchQuery = `repo:${owner}/${repo} is:pr is:merged merged:${fromDate}..${toDate}`;

      const { data } = await octokit.rest.search.issuesAndPullRequests({
        q: searchQuery,
        sort: "updated",
        order: "desc",
        per_page: 100, // 最大100件まで取得
      });

      // PR情報を整形
      const prs = data.items.map((item) => ({
        number: item.number,
        title: item.title,
        url: item.html_url,
        author: item.user?.login || "unknown",
        createdAt: item.created_at,
        mergedAt: item.pull_request?.merged_at || item.closed_at,
        labels: item.labels.map((label) =>
          typeof label === "string" ? label : label.name
        ),
        body: item.body || "",
      }));

      return {
        success: true,
        count: prs.length,
        prs,
        searchQuery,
        period: {
          from: fromDate,
          to: toDate,
        },
      };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "不明なエラーが発生しました",
        prs: [],
      };
    }
  },
});

/**
 * 特定のPRの詳細情報を取得するツール
 */
export const fetchPRDetails = createTool({
  id: "fetch-pr-details",
  description: "指定したプルリクエストの詳細情報を取得します",
  inputSchema: z.object({
    owner: z.string().describe("リポジトリのオーナー名"),
    repo: z.string().describe("リポジトリ名"),
    pullNumber: z.number().describe("プルリクエスト番号"),
  }),
  execute: async ({ context }) => {
    const { owner, repo, pullNumber } = context;

    try {
      const { data: pr } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: pullNumber,
      });

      // 変更されたファイル情報を取得
      const { data: files } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pullNumber,
      });

      return {
        success: true,
        pr: {
          number: pr.number,
          title: pr.title,
          body: pr.body || "",
          state: pr.state,
          merged: pr.merged,
          createdAt: pr.created_at,
          mergedAt: pr.merged_at,
          author: pr.user?.login || "unknown",
          url: pr.html_url,
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files,
          files: files.map((file) => ({
            filename: file.filename,
            status: file.status,
            additions: file.additions,
            deletions: file.deletions,
            changes: file.changes,
          })),
        },
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
