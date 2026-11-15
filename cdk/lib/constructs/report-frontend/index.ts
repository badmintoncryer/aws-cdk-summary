import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
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

  /**
   * カスタムドメイン設定
   * 指定すると CloudFront に代替ドメインと証明書を設定し、
   * Route 53 に A / AAAA エイリアスレコードを作成する
   * @default - CloudFront のデフォルトドメインのみ
   */
  customDomain?: {
    domainName: string;
    hostedZoneName: string;
    /** us-east-1 の ACM 証明書 */
    certificate: acm.ICertificate;
  };
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
      ...(props.customDomain && {
        domainNames: [props.customDomain.domainName],
        certificate: props.customDomain.certificate,
      }),
    });

    if (props.customDomain) {
      const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
        domainName: props.customDomain.hostedZoneName,
      });
      const target = route53.RecordTarget.fromAlias(
        new targets.CloudFrontTarget(this.distribution)
      );
      new route53.ARecord(this, "AliasRecord", {
        zone: hostedZone,
        recordName: props.customDomain.domainName,
        target,
      });
      new route53.AaaaRecord(this, "AliasRecordIpv6", {
        zone: hostedZone,
        recordName: props.customDomain.domainName,
        target,
      });
    }
  }
}
