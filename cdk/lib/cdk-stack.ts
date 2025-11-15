import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";
import * as path from 'node:path';

export class CdkSummaryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ローカルのDockerイメージをビルド
    const agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(
      path.join(__dirname, "../../mastra"),
      {
        file: "mastra-app/Dockerfile",
      }
    );

    // AgentCore Runtime (L2 Construct)
    const runtime = new agentcore.Runtime(this, "MastraWeatherAgentRuntime", {
      runtimeName: "MastraWeatherAgentRuntime",
      agentRuntimeArtifact: agentRuntimeArtifact,
      description: "Simple Mastra Weather Agent with weather tool",
    });

    // 出力
    new cdk.CfnOutput(this, "RuntimeArn", {
      value: runtime.agentRuntimeArn,
    });
  }
}
