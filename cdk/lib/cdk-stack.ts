import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as path from "node:path";
import { MastraAgentRuntime } from "./constructs/mastra-agent-runtime";

export class CdkSummaryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Mastra CDK Summary Agent Runtime
    new MastraAgentRuntime(this, "CdkSummaryAgent", {
      runtimeName: "CdkSummaryAgentRuntime",
      dockerContext: path.join(__dirname, "../../mastra"),
      dockerfilePath: "mastra-app/Dockerfile",
      description: "CDK daily summary agent",
      enableMarketplaceAccess: true,
    });
  }
}
