import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as agentcore from "@aws-cdk/aws-bedrock-agentcore-alpha";
import * as iam from "aws-cdk-lib/aws-iam";

/**
 * Bedrock モデルポリシー設定
 */
export interface BedrockModelPolicy {
  /**
   * 許可するアクション
   * @default ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"]
   */
  actions?: string[];

  /**
   * 対象リソース
   * @default ["*"]
   */
  resources?: string[];
}

/**
 * Mastra Agent Runtime コンストラクトのプロパティ
 */
export interface MastraAgentRuntimeProps {
  /**
   * Runtime の名前（必須）
   */
  runtimeName: string;

  /**
   * Docker ビルドコンテキストのパス（必須）
   * 例: path.join(__dirname, "../../mastra")
   */
  dockerContext: string;

  /**
   * Dockerfile の相対パス（必須）
   * 例: "mastra-app/Dockerfile"
   */
  dockerfilePath: string;

  /**
   * Runtime の説明（オプション）
   */
  description?: string;

  /**
   * Bedrock モデルポリシーのカスタマイズ（オプション）
   */
  bedrockModelPolicies?: BedrockModelPolicy[];

  /**
   * 追加の IAM ポリシーステートメント（オプション）
   */
  additionalPolicies?: iam.PolicyStatement[];

  /**
   * CloudFormation 出力をエクスポートするかどうか（オプション）
   * @default true
   */
  exportOutputs?: boolean;

  /**
   * AWS Marketplace アクセスを有効化するかどうか（オプション）
   * @default false
   */
  enableMarketplaceAccess?: boolean;

  /**
   * Runtime 環境変数
   *
   * @default - no environment variables
   */
  runtimeEnvironmentVariables?: { [key: string]: string };
}

/**
 * Mastra Agent Runtime デプロイ用の L3 コンストラクト
 *
 * このコンストラクトは、Bedrock AgentCore 上で動作する Mastra エージェントを
 * デプロイするためのロジックをカプセル化します。
 *
 * @example
 * ```typescript
 * new MastraAgentRuntime(this, 'WeatherAgent', {
 *   runtimeName: 'MastraWeatherAgentRuntime',
 *   dockerContext: path.join(__dirname, '../../mastra'),
 *   dockerfilePath: 'mastra-app/Dockerfile',
 *   description: 'Weather information agent',
 * });
 * ```
 */
export class MastraAgentRuntime extends Construct {
  /**
   * AgentCore Runtime インスタンス
   */
  public readonly runtime: agentcore.Runtime;

  /**
   * Agent Runtime の ARN
   */
  public readonly agentRuntimeArn: string;

  constructor(scope: Construct, id: string, props: MastraAgentRuntimeProps) {
    super(scope, id);

    // パラメータ検証
    this.validateProps(props);

    // Docker イメージのビルド
    const agentRuntimeArtifact = agentcore.AgentRuntimeArtifact.fromAsset(
      props.dockerContext,
      {
        file: props.dockerfilePath,
      }
    );

    // Runtime の作成
    this.runtime = new agentcore.Runtime(this, "Runtime", {
      runtimeName: props.runtimeName,
      agentRuntimeArtifact: agentRuntimeArtifact,
      description: props.description,
      environmentVariables: props.runtimeEnvironmentVariables,
    });

    // ARN を取得
    this.agentRuntimeArn = this.runtime.agentRuntimeArn;

    // IAM ポリシーの追加
    this.addPolicies(props);

    // CloudFormation 出力の作成
    if (props.exportOutputs !== false) {
      this.createOutputs();
    }
  }

  /**
   * プロパティの検証
   */
  private validateProps(props: MastraAgentRuntimeProps): void {
    if (!props.runtimeName || props.runtimeName.trim() === "") {
      throw new Error("runtimeName は必須です");
    }

    if (!props.dockerContext || props.dockerContext.trim() === "") {
      throw new Error("dockerContext は必須です");
    }

    if (!props.dockerfilePath || props.dockerfilePath.trim() === "") {
      throw new Error("dockerfilePath は必須です");
    }
  }

  /**
   * デフォルトの Bedrock ポリシーを作成
   */
  private createDefaultBedrockPolicy(): iam.PolicyStatement {
    return new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
      ],
      resources: ["*"],
    });
  }

  /**
   * Marketplace ポリシーを作成
   */
  private createMarketplacePolicy(): iam.PolicyStatement {
    return new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "aws-marketplace:ViewSubscriptions",
        "aws-marketplace:Subscribe",
        "aws-marketplace:Unsubscribe",
      ],
      resources: ["*"],
    });
  }

  /**
   * カスタム Bedrock ポリシーを作成
   */
  private createCustomBedrockPolicy(
    policy: BedrockModelPolicy
  ): iam.PolicyStatement {
    return new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: policy.actions || [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
      ],
      resources: policy.resources || ["*"],
    });
  }

  /**
   * IAM ポリシーを Runtime に追加
   */
  private addPolicies(props: MastraAgentRuntimeProps): void {
    // Bedrock ポリシーの追加
    if (props.bedrockModelPolicies && props.bedrockModelPolicies.length > 0) {
      // カスタムポリシーがある場合はそれを使用
      props.bedrockModelPolicies.forEach((policy) => {
        this.runtime.addToRolePolicy(this.createCustomBedrockPolicy(policy));
      });
    } else {
      // デフォルトのBedrockポリシーを追加
      this.runtime.addToRolePolicy(this.createDefaultBedrockPolicy());
    }

    // Marketplace ポリシーの追加（オプション）
    if (props.enableMarketplaceAccess) {
      this.runtime.addToRolePolicy(this.createMarketplacePolicy());
    }

    // 追加のカスタムポリシーを適用
    if (props.additionalPolicies) {
      props.additionalPolicies.forEach((policy) => {
        this.runtime.addToRolePolicy(policy);
      });
    }
  }

  /**
   * CloudFormation 出力を作成
   */
  private createOutputs(): void {
    new cdk.CfnOutput(this, "RuntimeArn", {
      value: this.agentRuntimeArn,
      description: `ARN of the agent runtime`,
    });
  }
}
