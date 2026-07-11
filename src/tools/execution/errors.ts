/**
 * Tool execution error types.
 *
 * C1 阶段提供基础错误类。具体使用由 execution/run-tool-use.ts 等文件决定。
 */
export class ToolExecutionError extends Error {
  constructor(
    message: string,
    public toolName: string,
    public cause?: unknown,
  ) {
    super(message)
    this.name = 'ToolExecutionError'
  }
}

export class ToolPermissionDeniedError extends ToolExecutionError {}
export class ToolNotFoundError extends ToolExecutionError {}
