import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Construct } from "constructs";
import * as path from "node:path";

/**
 * ReportFrontend コンストラクトのプロパティ
 */
export interface ReportFrontendProps {
  /**
   * レポートが保存されているS3バケット
   */
  reportBucket: s3.IBucket;

  /**
   * Lambda関数のメモリサイズ
   * @default 512
   */
  memorySize?: number;

  /**
   * Lambda関数のタイムアウト
   * @default Duration.seconds(30)
   */
  timeout?: cdk.Duration;
}

/**
 * ReportFrontend - CDKレポートを表示するNextJSフロントエンド
 *
 * CloudFront + Lambda (Docker + Lambda Web Adapter) でNextJSアプリをデプロイ
 * OAC (Origin Access Control) を使用してLambdaを呼び出し
 */
export class ReportFrontend extends Construct {
  /**
   * NextJSアプリを実行するLambda関数
   */
  public readonly lambda: lambda.DockerImageFunction;

  /**
   * Lambda Function URL
   */
  public readonly functionUrl: lambda.FunctionUrl;

  /**
   * CloudFront Distribution
   */
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: ReportFrontendProps) {
    super(scope, id);

    // Docker Lambda Function (ARM64/Graviton)
    this.lambda = new lambda.DockerImageFunction(this, "Function", {
      code: lambda.DockerImageCode.fromImageAsset(
        path.join(__dirname, "../../../../webapp")
      ),
      architecture: lambda.Architecture.ARM_64,
      memorySize: props.memorySize ?? 512,
      timeout: props.timeout ?? cdk.Duration.seconds(30),
      environment: {
        REPORT_BUCKET_NAME: props.reportBucket.bucketName,
      },
    });

    // S3読み取り権限を付与
    props.reportBucket.grantRead(this.lambda);

    // Lambda Function URL (IAM認証、streaming対応)
    this.functionUrl = this.lambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM,
    });

    // CloudFront Distribution with L2 OAC
    this.distribution = new cloudfront.Distribution(this, "Distribution", {
      defaultBehavior: {
        origin: origins.FunctionUrlOrigin.withOriginAccessControl(
          this.functionUrl
        ),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
      },
    });
  }
}
