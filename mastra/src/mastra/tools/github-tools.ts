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
 * 過去24時間以内にマージされたPRを取得するツール
 */
export const fetchRecentMergedPRs = createTool({
  id: "fetch-recent-merged-prs",
  description:
    "指定したGitHubリポジトリで過去24時間以内にマージされたプルリクエストを取得します",
  inputSchema: z.object({
    owner: z
      .string()
      .describe("リポジトリのオーナー名（例: 'aws'）")
      .default("aws"),
    repo: z
      .string()
      .describe("リポジトリ名（例: 'aws-cdk'）")
      .default("aws-cdk"),
    hoursAgo: z
      .number()
      .describe("何時間前までのPRを取得するか")
      .default(24),
  }),
  execute: async ({ context }) => {
    const { owner, repo, hoursAgo } = context;

    try {
      // 24時間前のISO日時を計算
      const since = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
      const sinceISO = since.toISOString();

      // GitHub Search APIを使用してマージ済みPRを検索
      const searchQuery = `repo:${owner}/${repo} is:pr is:merged merged:>=${sinceISO}`;

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
        timeRange: `${hoursAgo}時間前から現在まで`,
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
