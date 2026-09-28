# L1更新差分の抽出

## 背景

aws/aws-cdk の L1 更新PR（`feat: update L1 CloudFormation resource definitions`）の本文には、`@aws-cdk/aws-service-spec` の差分がツリー形式で載る。本文は GitHub の上限 65,536 文字で切れるため、変更が多い週は後半が失われる。例として PR #38864 では、新規サービス 2 件がどちらも本文から消え、追加プロパティは 26 件中 14 件しか残っていなかった。

このため、PR本文をLLMに読ませる方式をやめ、新旧のスペックDBをコードで比較する方式に切り替えた。

## 処理の流れ

`mastra/mastra-app/server.ts` がエージェントを実行する前に、`saveL1Summary()`（`mastra/src/mastra/lib/l1-updates.ts`）を呼ぶ。

1. 対象期間に `packages/aws-cdk-lib/package.json` を変更したコミットを GitHub から取得する
2. 各コミットの patch から `@aws-cdk/aws-service-spec` の新旧の版を読み取る。版が変わっていなければ L1 更新PRではない
3. npm レジストリから新旧の tgz を取得し、`dist.integrity` で検証してから `tar` コマンドで `db.json.gz` を取り出す
4. `@aws-cdk/service-spec-importers` の `DbDiff` で差分を計算し、項目を抽出する（`mastra/src/mastra/lib/l1-spec-diff.ts`）
5. 説明文を、日本語の短い説明（30〜50文字程度）に LLM で書き換える。モデルはメインのエージェントと同じ（`bedrock-providers.ts` の `model`）。失敗した項目は英語の原文のまま残す
6. S3 に保存する
   - `reports/l1-updates/l1-YYYY-MM-DD.json`: 画面表示用のサマリー
   - `reports/l1-diffs/pr-N.txt`: `diff-db` コマンドと同じ形式の全差分テキスト
7. 件数の要約をプロンプトに添えて、エージェントに日次レポートを書かせる

## 抽出する項目

| 項目 | JSON のキー |
|---|---|
| 新規サービス | `newServices` |
| 既存サービスへの新規リソース | `newResources` |
| リソースへのプロパティ追加 | `propertyChanges` |
| 既存の型の中へのプロパティ追加 | `typePropertyChanges` |
| 破壊的変更 | `breakingChanges` |

破壊的変更として扱うもの:

- 削除: サービス、リソース、プロパティ、属性、型の中のプロパティ
- `primaryIdentifier` の変更
- 型の変更: 旧版で受け付けていた型が新版で受け付けられなくなったもの（判定方法は `l1-spec-diff.ts` の `acceptedTypes`）
- 任意から必須への変更
- 置き換えの発生: 変更するとリソースが置き換わる（または置き換わる場合がある）ようになったもの。置き換えが起きなくなった方向は対象外

## 失敗したとき

- L1 更新PRの検出に失敗したときは、サマリーJSONの `error` に内容を残す
- 差分の取得・保存に失敗したときは、そのPRの `error` に内容を残す
- どちらの場合も画面に表示する。日次レポートはいつもどおり作る

## 手動で再実行するとき

AgentCore Runtime に次の JSON を渡す。`startDate` と `endDate` は ISO 8601 形式か `YYYY-MM-DD` で指定する。`YYYY-MM-DD` の終了日はその日を含む。どちらも省略すると、直前24時間（毎時0分で区切る）が対象になる。サマリーのファイル名の日付は、日次レポートに合わせて `endDate` の日付（省略時は実行時の UTC の日付）になる。

エージェントは `prompt` の文面から期間を読み、L1 の抽出は `startDate` / `endDate` を使う。片方だけ指定すると日次レポートと L1 で期間がずれるので、両方を同じ期間にする。

```json
{ "prompt": "2026-09-17のaws/aws-cdkリポジトリのPRを分析してレポートを作成し、S3に保存してください", "startDate": "2026-09-17", "endDate": "2026-09-17" }
```

## 依存ライブラリの版

`@aws-cdk/service-spec-importers` と `@aws-cdk/service-spec-types` は版を固定している。新しいスペックDBが読めなくなったら、画面にエラーが出るので手動で版を上げる。

`l1-spec-diff.ts` は `DbDiff` と `DiffFormatter` を、パッケージのルートではなく `lib/db-diff.js` と `lib/diff-fmt.js` から直接読んでいる。ルートから読むと、使わないデータ取り込み機能が依存する `glob` まで読み込まれ、`mastra build` が失敗するため。版を上げたら `pnpm test` と `pnpm build` を実行し、この 2 つのパスが残っているか確かめる。
