import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

const isLocal = process.env.IS_LOCAL === 'TRUE';

export const bedrock = createAmazonBedrock(
  isLocal
    ? {
        region: 'us-west-2',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        sessionToken: process.env.AWS_SESSION_TOKEN!,
      }
    : {
        region: 'us-west-2',
        credentialProvider: fromNodeProviderChain(),
      }
);
