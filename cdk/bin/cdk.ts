#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkSummaryStack } from '../lib/cdk-stack';
import { CertificateStack } from '../lib/certificate-stack';

const app = new cdk.App();

const account = process.env.CDK_DEFAULT_ACCOUNT;
const domainName =
  app.node.tryGetContext('domainName') ?? 'cdk-daily-summary.appnao.com';
const hostedZoneName =
  app.node.tryGetContext('hostedZoneName') ?? 'appnao.com';

// CloudFront 用の証明書は us-east-1 に作る
const certificateStack = new CertificateStack(app, 'CdkSummaryCertificateStack', {
  env: { account, region: 'us-east-1' },
  crossRegionReferences: true,
  domainName,
  hostedZoneName,
});

const mainStack = new CdkSummaryStack(app, 'CdkSummaryStack', {
  env: { account, region: 'us-west-2' },
  crossRegionReferences: true,
  customDomain: {
    domainName,
    hostedZoneName,
    certificate: certificateStack.certificate,
  },
});
mainStack.addDependency(certificateStack);
