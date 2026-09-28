import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import { bedrock, model } from "./bedrock-providers";
import { diffSpecVersions, parseSpecBump, type L1Changes } from "./l1-spec-diff";
import { octokit } from "../tools/github-tools";
import { putObject } from "../tools/s3-tools";

/** エージェントのプロンプトに L1 更新の要約を添えるときの見出し。エージェントの指示文もこれを参照する */
export const L1_SUMMARY_HEADING = "## L1更新（コードで抽出済み）";

const REPO = { owner: "aws", repo: "aws-cdk" };
const PACKAGE_JSON = "packages/aws-cdk-lib/package.json";

interface SpecBump {
  prNumber: number;
  title: string;
  url: string;
  mergedAt: string;
  oldVersion: string;
  newVersion: string;
}

type L1Update = SpecBump & Partial<L1Changes> & { fullDiffKey?: string; error?: string };

/**
 * 期間内にマージされた L1 更新 PR の差分を抽出し、サマリー JSON と全差分テキストを S3 に保存する。
 * 戻り値はエージェントのプロンプトに添える要約テキスト。L1 更新がなければ何も保存せず空文字を返す。
 */
export async function saveL1Summary(from: Date, to: Date, reportDate: string): Promise<string> {
  const generatedAt = new Date().toISOString();
  const save = (l1Updates: L1Update[], error?: string) =>
    putObject(
      `reports/l1-updates/l1-${reportDate}.json`,
      JSON.stringify({ generatedAt, reportDate, l1Updates, error }, null, 2),
      "application/json; charset=utf-8"
    );

  let bumps: SpecBump[];
  try {
    bumps = await findSpecBumps(from, to);
  } catch (error) {
    const message = errorMessage(error);
    await save([], `L1更新PRの検出に失敗しました: ${message}`);
    return `L1更新PRの検出に失敗しました: ${message}`;
  }
  if (bumps.length === 0) return "";

  const l1Updates: L1Update[] = [];
  for (const bump of bumps) {
    try {
      const { changes, fullText } = await diffSpecVersions(bump.oldVersion, bump.newVersion);
      const fullDiffKey = `reports/l1-diffs/pr-${bump.prNumber}.txt`;
      await putObject(fullDiffKey, fullText, "text/plain; charset=utf-8");
      l1Updates.push({ ...bump, ...changes, fullDiffKey });
    } catch (error) {
      l1Updates.push({ ...bump, error: `差分の取得・保存に失敗しました: ${errorMessage(error)}` });
    }
  }

  await writeJapaneseDescriptions(l1Updates);
  await save(l1Updates);
  return l1Updates.map(describe).join("\n");
}

/** packages/aws-cdk-lib/package.json でスペックの版を上げたコミットを探し、対応する PR を返す */
async function findSpecBumps(from: Date, to: Date): Promise<SpecBump[]> {
  const { data: commits } = await octokit.rest.repos.listCommits({
    ...REPO,
    path: PACKAGE_JSON,
    since: from.toISOString(),
    until: to.toISOString(),
    per_page: 100,
  });

  const bumps: SpecBump[] = [];
  for (const { sha } of commits) {
    const { data: commit } = await octokit.rest.repos.getCommit({ ...REPO, ref: sha });
    const versions = parseSpecBump(commit.files?.find((f) => f.filename === PACKAGE_JSON)?.patch ?? "");
    if (!versions) continue;

    const { data: prs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      ...REPO,
      commit_sha: sha,
    });
    const pr = prs.find((p) => p.merged_at);
    if (!pr) continue;
    bumps.push({
      prNumber: pr.number,
      title: pr.title,
      url: pr.html_url,
      mergedAt: pr.merged_at as string,
      ...versions,
    });
  }
  return bumps;
}

const descriptionWriter = new Agent({
  name: "l1-description-writer",
  instructions:
    "AWS CloudFormation のリソースやプロパティの英語の説明文を、L2 コンストラクトの開発者向けに日本語で簡潔に（30〜50文字程度）要約してください。入力の id はそのまま返してください。",
  model: bedrock(model),
});

const descriptionSchema = z.object({
  items: z.array(z.object({ id: z.number(), ja: z.string() })),
});

/** 英語の説明文を、日本語の短い説明（30〜50文字程度）に置き換える。失敗した項目は英語のまま残す */
async function writeJapaneseDescriptions(updates: L1Update[]) {
  const targets = updates
    .flatMap((u) => [...(u.newResources ?? []), ...(u.propertyChanges ?? []), ...(u.typePropertyChanges ?? [])])
    .filter((t) => t.description);

  // 1 回の出力が長すぎて途中で切れないよう、40 件ずつに分けて依頼する
  const chunkSize = 40;
  const starts = Array.from({ length: Math.ceil(targets.length / chunkSize) }, (_, i) => i * chunkSize);
  await Promise.all(
    starts.map(async (start) => {
      const chunk = targets.slice(start, start + chunkSize);
      try {
        const { object } = await descriptionWriter.generate(
          JSON.stringify(chunk.map((t, id) => ({ id, text: t.description }))),
          { structuredOutput: { schema: descriptionSchema } }
        );
        for (const { id, ja } of object?.items ?? []) {
          if (chunk[id] && ja) chunk[id].description = ja;
        }
      } catch (error) {
        console.error("L1説明文の日本語化に失敗しました（英語のまま保存します）:", error);
      }
    })
  );
}

function describe(u: L1Update) {
  const head = `#${u.prNumber} ${u.title}（aws-service-spec ${u.oldVersion} → ${u.newVersion}）`;
  if (u.error) return `${head}: ${u.error}`;
  const services = u.newServices?.length ? `（${u.newServices.join(", ")}）` : "";
  return (
    `${head}: 新規サービス ${u.newServices?.length ?? 0}件${services}、` +
    `新規リソース ${u.newResources?.length ?? 0}件、` +
    `プロパティ追加 ${u.propertyChanges?.length ?? 0}件、` +
    `型の中のプロパティ追加 ${u.typePropertyChanges?.length ?? 0}件、` +
    `破壊的変更 ${u.breakingChanges?.length ?? 0}件`
  );
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
