// src/cli/subcommands/index.ts
import type { Command } from '@commander-js/extra-typings'
import { define as defineMcp } from './mcp.js'
import { define as defineAuth } from './auth.js'
import { define as definePlugin } from './plugin.js'
import { define as defineAgents } from './agents.js'
import { define as defineDoctor } from './doctor.js'
import { define as defineUpdate } from './update.js'
import { define as defineServer } from './server.js'
import { define as defineAutoMode } from './auto-mode.js'
import { define as defineAutonomy } from './autonomy.js'
import { define as defineTask } from './task.js'

/**
 * 静态 import 列表（F1：放弃运行时 globSync）。
 * 新增 subcommand 时：1) 创建 <name>.ts；2) 在此 import + 加入 DEFINERS。
 *
 * 顺序按 main.tsx 原 subcommand 注册顺序，避免 Commander 解析差异。
 */
const DEFINERS = [
  defineMcp,
  defineServer,
  defineAuth,
  definePlugin,
  defineAgents,
  defineAutoMode,
  defineAutonomy,
  defineDoctor,
  defineUpdate,
  defineTask,
]

/**
 * 注册所有 subcommand 到 program。
 */
export function registerAllSubcommands(program: Command): void {
  for (const define of DEFINERS) {
    define(program)
  }
}

export {
  defineMcp,
  defineAuth,
  definePlugin,
  defineAgents,
  defineDoctor,
  defineUpdate,
  defineServer,
  defineAutoMode,
  defineAutonomy,
  defineTask,
}
