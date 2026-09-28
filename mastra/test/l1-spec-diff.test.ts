import assert from "node:assert/strict";
import { test } from "node:test";
import { emptyDatabase, type SpecDatabaseDiff } from "@aws-cdk/service-spec-types";
import { extractChanges, parseSpecBump } from "../src/mastra/lib/l1-spec-diff";

test("parseSpecBump は aws-cdk-lib の package.json の patch から新旧の版を取り出す", () => {
  const patch = [
    '     "@aws-cdk/aws-custom-resource-sdk-adapter": "0.0.0",',
    '-    "@aws-cdk/aws-service-spec": "0.1.211",',
    '+    "@aws-cdk/aws-service-spec": "0.1.215",',
    '+    "./aws-healthagent": "./aws-healthagent/index.js",',
  ].join("\n");
  assert.deepEqual(parseSpecBump(patch), { oldVersion: "0.1.211", newVersion: "0.1.215" });
  assert.equal(parseSpecBump('+    "./aws-pi": "./aws-pi/index.js",'), undefined);
});

test("extractChanges は properties 直下の追加だけをプロパティ追加とし、破壊的変更を判定する", () => {
  const str = { type: "string" };
  const diff = {
    services: {
      added: { "aws-pi": { name: "aws-pi", cloudFormationNamespace: "AWS::PI" } },
      updated: {
        "aws-x": {
          resourceDiff: {
            added: { "AWS::X::New": { cloudFormationType: "AWS::X::New", documentation: "new resource" } },
            removed: { "AWS::X::Gone": { cloudFormationType: "AWS::X::Gone" } },
            updated: {
              "AWS::X::Thing": {
                properties: {
                  added: { NewProp: { type: str, documentation: "new prop" } },
                  removed: { OldProp: { type: str } },
                  updated: {
                    // 選択肢が増えただけ・必須が外れただけ・置き換えが起きなくなっただけは破壊的ではない
                    Mode: {
                      old: { type: { type: "string", allowedValues: ["A"] } },
                      new: { type: { type: "string", allowedValues: ["A", "B"] } },
                    },
                    Relaxed: { old: { type: str, required: true }, new: { type: str, defaultValue: '""' } },
                    NoLongerReplaces: { old: { type: str, causesReplacement: "yes" }, new: { type: str } },
                    Narrowed: {
                      old: {
                        type: { type: "array", element: { type: "json" } },
                        previousTypes: [{ type: "array", element: str }],
                      },
                      new: { type: { type: "array", element: str } },
                    },
                    Required: { old: { type: str }, new: { type: str, required: true } },
                    Replaces: { old: { type: str }, new: { type: str, causesReplacement: "yes" } },
                    MayReplace: { old: { type: str }, new: { type: str, causesReplacement: "maybe" } },
                  },
                },
                attributes: { added: { Id: { type: str } }, removed: { Arn: { type: str } } },
                primaryIdentifier: { old: ["Id"], new: ["ApiId", "Id"] },
                typeDefinitionDiff: {
                  added: { NewType: { name: "NewType", properties: { X: { type: str } } } },
                  updated: {
                    Config: {
                      properties: {
                        added: { Inner: { type: str, documentation: "inner prop" } },
                        removed: { Legacy: { type: str } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  } as unknown as SpecDatabaseDiff;

  const db = emptyDatabase();
  assert.deepEqual(extractChanges(diff, db, db), {
    newServices: ["AWS::PI"],
    newResources: [{ resource: "AWS::X::New", description: "new resource" }],
    propertyChanges: [{ resource: "AWS::X::Thing", property: "NewProp", description: "new prop" }],
    typePropertyChanges: [
      { resource: "AWS::X::Thing", type: "Config", property: "Inner", description: "inner prop" },
    ],
    breakingChanges: [
      "AWS::X::Gone リソースが削除されました",
      "AWS::X::Thing の OldProp プロパティが削除されました",
      "AWS::X::Thing の Narrowed プロパティの型が Array<json> | Array<string> から Array<string> に変わりました",
      "AWS::X::Thing の Required プロパティが必須になりました",
      "AWS::X::Thing の Replaces プロパティを変更すると、リソースが置き換わるようになりました",
      "AWS::X::Thing の MayReplace プロパティを変更すると、リソースが置き換わる場合があるようになりました",
      "AWS::X::Thing の Arn 属性が削除されました",
      "AWS::X::Thing の primaryIdentifier が [Id] から [ApiId, Id] に変わりました",
      "AWS::X::Thing の型 Config から Legacy プロパティが削除されました",
    ],
  });
});
