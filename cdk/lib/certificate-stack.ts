import * as cdk from "aws-cdk-lib/core";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import { Construct } from "constructs";

export interface CertificateStackProps extends cdk.StackProps {
  /**
   * 証明書を発行するドメイン名（例: cdk-daily-summary.appnao.com）
   */
  domainName: string;

  /**
   * DNS 検証に使う Route 53 パブリックホストゾーン名（例: appnao.com）
   */
  hostedZoneName: string;
}

/**
 * CloudFront 用の ACM 証明書スタック
 *
 * CloudFront に紐づける証明書は us-east-1 に置く必要があるため、
 * 本体スタック（us-west-2）とは別スタックにしている
 */
export class CertificateStack extends cdk.Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const hostedZone = route53.HostedZone.fromLookup(this, "HostedZone", {
      domainName: props.hostedZoneName,
    });

    this.certificate = new acm.Certificate(this, "Certificate", {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });
  }
}
