import {
  BedrockAgentCoreClient,
  InvokeAgentRuntimeCommand,
} from "@aws-sdk/client-bedrock-agentcore";

const client = new BedrockAgentCoreClient({});

export const handler = async () => {
  const agentRuntimeArn = process.env.AGENT_RUNTIME_ARN;

  if (!agentRuntimeArn) {
    throw new Error("AGENT_RUNTIME_ARN environment variable is not set");
  }

  const prompt =
    process.env.AGENT_PROMPT ||
    "過去24時間のaws/aws-cdkリポジトリのPRを分析してレポートを作成し、S3に保存してください";

  // ペイロードをJSON形式で作成しUint8Arrayにエンコード
  const payloadJson = JSON.stringify({ prompt });
  const payload = new TextEncoder().encode(payloadJson);

  const command = new InvokeAgentRuntimeCommand({
    agentRuntimeArn,
    payload,
    contentType: "application/json",
    accept: "application/json",
    runtimeSessionId: `daily-report-${new Date().toISOString()}`,
  });

  const response = await client.send(command);

  console.log("Agent invocation completed:", {
    $metadata: response.$metadata,
  });

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Agent invocation completed",
      requestId: response.$metadata?.requestId,
    }),
  };
};
