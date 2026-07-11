/**
 * src/QueryEngine.ts — C10.5 re-export shim.
 *
 * 生产 QueryEngine 类与 ask 函数已迁移到 src/query/engine/QueryEngine.ts，
 * submitMessage 生成器逻辑迁移到 src/query/engine/submit-message.ts。
 *
 * 本文件保留为 re-export 包装层以维持公共 import 路径（被
 * createSessionMethod.ts、print.ts、sessionTypes.ts 使用）。
 *
 * 原 1369 行实现已完整迁移到 query/engine/ 子模块：
 *   - QueryEngine 类 + ask 函数 → query/engine/QueryEngine.ts
 *   - submitMessage 生成器（37 个 yield） → query/engine/submit-message.ts
 *   - 消息状态/session 持久化/文件历史/skill 发现等 helper → 各 engine 子模块
 *   - system prompt 组装 → query/engine/system-prompt.ts
 *   - ProcessUserInputContext 构建 → query/engine/process-user-input.ts
 *   - 循环内消息处理 → query/engine/loop-message-handler.ts
 *   - post-loop 结果提取 → query/engine/loop-result.ts
 */

export { QueryEngine, ask } from './query/engine/QueryEngine.js'
export type { QueryEngineConfig } from './query/engine/QueryEngine.js'
