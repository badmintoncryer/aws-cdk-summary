# AWS CDK Daily Summary

AWS CDK リポジトリのPull Requestを毎日分析し、サマリーレポートを自動生成するシステムです

## URL

https://d2t5fomzexey4a.cloudfront.net/

## アーキテクチャ

![Architecture](./images/cdk-summary.png)

## フロントエンド

![Frontend](./images/frontend.png)

## 機能

- **自動PR分析**: 毎日JST 9:00に過去24時間のPRを分析
- **AIサマリー生成**: Bedrock Agentがカテゴリ分類・要約を自動生成
- **レポート閲覧**: Next.jsベースのWebフロントエンドでレポートを表示
- **日付切り替え**: 過去のレポートを日付で選択して閲覧可能
- **無限ループ防止**: ツール使用回数制限により、エージェントの無限ループを防止

## プロジェクト構成

```
.
├── cdk/          # AWS CDKインフラストラクチャ
├── mastra/       # Mastra AIエージェント
└── webapp/       # Next.js フロントエンド
```

## 技術スタック

| コンポーネント | 技術 |
|---------------|-----|
| IaC | AWS CDK (TypeScript) |
| AIエージェント | Mastra + Amazon Bedrock |
| フロントエンド | Next.js 15 + React 19 + Tailwind CSS |
| スケジューラ | Amazon EventBridge Scheduler |
| ストレージ | Amazon S3 |
| CDN | Amazon CloudFront |

## セットアップ

### 前提条件

- Node.js 20+
- pnpm 9+
- AWS CLI (認証設定済み)
- AWS CDK CLI

### インストール

```bash
# 依存関係のインストール
cd cdk && pnpm install
cd ../mastra && pnpm install
cd ../webapp && pnpm install
```

### 自動デプロイ設定（GitHub Actions）

このプロジェクトは、mainブランチへのpush時に自動的にAWSへデプロイされます。

- `.github/workflows/deploy.yml`: mainブランチへのpush時に自動デプロイ
- 手動実行も可能（Actions > Deploy to AWS > Run workflow）
- OIDC連携により `arn:aws:iam::214794239830:role/GithubActionsDeployRole` を使用

### 手動デプロイ

```bash
cd cdk
pnpm cdk deploy
```

## ローカル開発

### フロントエンド

```bash
cd webapp
pnpm dev
```

### Mastraエージェント

```bash
cd mastra
pnpm dev
```

## 設定

### ツール使用回数制限

エージェントの無限ループを防ぐため、ツール使用回数に制限を設けています。

- **デフォルト値**: 50回
- **環境変数**: `MAX_TOOL_CALLS`
- **設定場所**: `cdk/lib/cdk-stack.ts` の `runtimeEnvironmentVariables`

制限に達すると、エージェントは以下のエラーメッセージを返して処理を中断します：
```
ツール使用回数が制限（50回）を超えました。無限ループの可能性があるため処理を中断します。
```

制限値を変更するには、CDKスタックの環境変数を更新してください：

```typescript
runtimeEnvironmentVariables: {
  REPORT_BUCKET_NAME: reportBucket.bucketName,
  MAX_TOOL_CALLS: "100", // お好みの値に変更
}
```

## 出力

デプロイ後、以下の情報が出力されます:

- `ReportBucketName`: レポート保存用S3バケット名
- `FrontendUrl`: フロントエンドのCloudFront URL

## ライセンス

MIT
