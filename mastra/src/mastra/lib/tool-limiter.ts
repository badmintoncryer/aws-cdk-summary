/**
 * ツール使用回数制限を管理するクラス
 * エージェントの無限ループを防ぐために、ツール呼び出し回数を制限します
 */

export class ToolCallLimiter {
  private callCount: number = 0;
  private readonly maxCalls: number;
  private readonly sessionId: string;

  constructor(maxCalls?: number, sessionId?: string) {
    this.maxCalls = maxCalls ?? parseInt(process.env.MAX_TOOL_CALLS || "50", 10);
    this.sessionId = sessionId ?? `session-${Date.now()}`;
    console.log(`[ToolCallLimiter] Initialized for ${this.sessionId} with max calls: ${this.maxCalls}`);
  }

  /**
   * ツール呼び出しをカウントし、制限をチェックします
   * @param toolId ツールの識別子
   * @throws Error 制限を超えた場合
   */
  checkLimit(toolId: string): void {
    this.callCount++;
    console.log(`[ToolCallLimiter] Tool called: ${toolId} (${this.callCount}/${this.maxCalls})`);

    if (this.callCount > this.maxCalls) {
      const errorMessage = `ツール使用回数が制限（${this.maxCalls}回）を超えました。無限ループの可能性があるため処理を中断します。`;
      console.error(`[ToolCallLimiter] ${errorMessage}`);
      throw new Error(errorMessage);
    }
  }

  /**
   * 現在の呼び出し回数を取得
   */
  getCallCount(): number {
    return this.callCount;
  }

  /**
   * カウンターをリセット
   */
  reset(): void {
    console.log(`[ToolCallLimiter] Resetting counter from ${this.callCount} to 0`);
    this.callCount = 0;
  }
}

/**
 * ツールをラップして使用回数制限を追加します
 * @param tool 元のツール
 * @param limiter ToolCallLimiterインスタンス
 * @returns 制限付きツール
 */
export function wrapToolWithLimiter<T extends { id: string; execute?: (...args: any[]) => any }>(
  tool: T,
  limiter: ToolCallLimiter
): T {
  const originalExecute = tool.execute;
  if (!originalExecute) {
    return tool;
  }

  return {
    ...tool,
    execute: async (...args: any[]) => {
      // 制限をチェック
      limiter.checkLimit(tool.id);

      // 元のツールを実行
      return await originalExecute(...args);
    },
  } as T;
}
