/**
 * 内置工具接入点（唯一对外入口）。
 *
 * C1 阶段：保持对 registry/assembler.ts 的同步 getTools / getAllBaseTools /
 * assembleToolPool API 的透传，避免破坏所有现有调用方（React 组件中
 * getTools() 同步调用 —— H5，留待 C2 处理）。
 *
 * 循环依赖处理（H3）：
 *   原 tools.ts 内已用 `require()` 懒加载打破 TeamCreateTool/SendMessage 的循环
 *   （见 assembler.ts 内 getTeamCreateTool/getSendMessageTool/getTeamDeleteTool）。
 *   C1 保留此机制不变；C2 计划将这三个 require() 替换为函数级动态 import，
 *   并把 loadBuiltinTools 改为 async（届时需调整 React 组件）。
 *
 * C2 之后：
 *   - 本文件将转为 async loadBuiltinTools() 形式
 *   - feature-gated 工具通过 registry/feature-gate.ts 的 loadFeatureGatedToolSync 加载
 */
import type { Tool } from '../core/types.js'
import {
  getTools,
  getAllBaseTools,
  assembleToolPool,
  getMergedTools,
  filterToolsByDenyRules,
  getToolsForDefaultPreset,
  parseToolPreset,
  TOOL_PRESETS,
  type ToolPreset,
} from '../registry/assembler.js'

export {
  getTools,
  getAllBaseTools,
  assembleToolPool,
  getMergedTools,
  filterToolsByDenyRules,
  getToolsForDefaultPreset,
  parseToolPreset,
  TOOL_PRESETS,
}
export type { Tool, ToolPreset }
