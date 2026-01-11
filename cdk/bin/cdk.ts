#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CdkSummaryStack } from '../lib/cdk-stack';

const app = new cdk.App();
new CdkSummaryStack(app, 'CdkSummaryStack', {
  env: { region: 'us-west-2' },
});
