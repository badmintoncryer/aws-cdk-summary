import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";
import * as iam from "aws-cdk-lib/aws-iam";
import * as path from "node:path";

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
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "bedrock:InvokeModel",
          "bedrock:InvokeModelWithResponseStream",
        ],
        resources: ["*"],
      })
    );
    runtime.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          "aws-marketplace:ViewSubscriptions",
          "aws-marketplace:Subscribe",
        ],
        resources: ["*"],
      })
    )

    // 出力
    new cdk.CfnOutput(this, "RuntimeArn", {
      value: runtime.agentRuntimeArn,
    });
  }
}
