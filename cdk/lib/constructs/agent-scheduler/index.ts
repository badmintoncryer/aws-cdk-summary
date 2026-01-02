import * as cdk from "aws-cdk-lib/core";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import * as targets from "aws-cdk-lib/aws-scheduler-targets";
import { Construct } from "constructs";
import * as path from "node:path";
import type { IBedrockAgentRuntime } from "@aws-cdk/aws-bedrock-agentcore-alpha";

/**
 * AgentScheduler コンストラクトのプロパティ
 */
export interface AgentSchedulerProps {
  /**
   * スケジュール対象の AgentRuntime (L2 インターフェース)
   */
  agentRuntime: IBedrockAgentRuntime;

  /**
   * エージェントに送信するプロンプト
   */
  prompt: string;

  /**
   * スケジュール式
   * @example scheduler.ScheduleExpression.cron({ minute: "0", hour: "9", timeZone: cdk.TimeZone.ASIA_TOKYO })
   */
  schedule: scheduler.ScheduleExpression;

  /**
   * Lambda 関数のタイムアウト
   * @default Duration.minutes(15)
   */
  timeout?: cdk.Duration;
}

/**
 * AgentScheduler - AgentCore Runtime を定期実行するための L3 コンストラクト
 *
 * EventBridge Scheduler + Lambda を使用して、指定したスケジュールで
 * AgentCore Runtime を呼び出します。
 *
 * @example
 * ```typescript
 * new AgentScheduler(this, "DailyScheduler", {
 *   agentRuntime,
 *   prompt: "レポートを作成してください",
 *   schedule: scheduler.ScheduleExpression.cron({
 *     minute: "0",
 *     hour: "9",
 *     timeZone: cdk.TimeZone.ASIA_TOKYO,
 *   }),
 * });
 * ```
 */
export class AgentScheduler extends Construct {
  /**
   * AgentCore を呼び出す Lambda 関数
   */
  public readonly invokerLambda: lambdaNodejs.NodejsFunction;

  /**
   * EventBridge Schedule
   */
  public readonly schedule: scheduler.Schedule;

  constructor(scope: Construct, id: string, props: AgentSchedulerProps) {
    super(scope, id);

    // Lambda 関数の作成
    this.invokerLambda = new lambdaNodejs.NodejsFunction(this, "Invoker", {
      entry: path.join(__dirname, "handlers/invoke-agent.ts"),
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: props.timeout ?? cdk.Duration.minutes(15),
      environment: {
        AGENT_RUNTIME_ARN: props.agentRuntime.agentRuntimeArn,
        AGENT_PROMPT: props.prompt,
      },
    });

    // Lambda に AgentCore 呼び出し権限を付与
    props.agentRuntime.grantInvokeRuntime(this.invokerLambda);

    // Workaround: L2のgrantInvoke()がruntime-endpoint/*を含まないため手動で追加
    this.invokerLambda.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["bedrock-agentcore:InvokeAgentRuntime"],
        resources: [`${props.agentRuntime.agentRuntimeArn}/*`],
      })
    );

    // EventBridge Schedule の作成
    this.schedule = new scheduler.Schedule(this, "Schedule", {
      schedule: props.schedule,
      target: new targets.LambdaInvoke(this.invokerLambda),
    });
  }
}
