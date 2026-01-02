import * as cdk from "aws-cdk-lib/core";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "node:path";
import { MastraAgentRuntime } from "./constructs/mastra-agent-runtime";

export class CdkSummaryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // レポート保存用S3バケット（プライベート）
    const reportBucket = new s3.Bucket(this, "CdkReportBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // S3書き込み権限
    const s3WritePolicy = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["s3:PutObject"],
      resources: [`${reportBucket.bucketArn}/*`],
    });

    // Mastra CDK Summary Agent Runtime
    new MastraAgentRuntime(this, "CdkSummaryAgent", {
      runtimeName: "CdkSummaryAgentRuntime",
      dockerContext: path.join(__dirname, "../../mastra"),
      dockerfilePath: "mastra-app/Dockerfile",
      description: "CDK daily summary agent",
      enableMarketplaceAccess: true,
      additionalPolicies: [s3WritePolicy],
      runtimeEnvironmentVariables: {
        REPORT_BUCKET_NAME: reportBucket.bucketName,
      },
    });

    // バケット名を出力
    new cdk.CfnOutput(this, "ReportBucketName", {
      value: reportBucket.bucketName,
      description: "S3 bucket for CDK reports",
    });
  }
}
