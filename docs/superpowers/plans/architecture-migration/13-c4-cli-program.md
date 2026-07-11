# C4: cli/program/ —— Commander 装配 + 全局 option 链

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 `src/cli/program/`，把 `main.tsx` 行 1066-1434（Commander 创建 + preAction hook）和行 4464-4613（全局 option 链）迁入。完成后 `main.tsx` 减少 ~520 行。

**Architecture:** `program/index.ts` 负责 `createProgram()` + preAction hook + parseAsync 调度；`program/options.ts` 负责 150 行全局 option 注册链；`program/types.ts` 定义 `ProgramOptions` 类型。

**Tech Stack:** TypeScript + Commander.js。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/cli/program/index.ts` | 新建：createProgram + preAction hook |
| `src/cli/program/options.ts` | 新建：registerGlobalOptions（全局 option 链） |
| `src/cli/program/types.ts` | 新建：ProgramOptions 类型 |
| `src/main.tsx` | 修改：删除行 1066-1434、4464-4613 对应内容 |
| `tests/integration/cli-program.test.ts` | 新建：冒烟测试 |

---

## Task 1: 读取 main.tsx 目标行段，确认边界

**Files:** 无修改

- [ ] **Step 1: 读取 main.tsx 行 1066-1434（Commander 装配段）**

Run:
```bash
sed -n '1066,1434p' src/main.tsx | head -50
sed -n '1066,1434p' src/main.tsx | wc -l
```

记录：
- `createProgram()` 或 `new Command(...)` 的位置
- preAction hook 的实现（通常是 `.hook('preAction', async cmd => {...})`）
- 全局 option 注册的开始/结束

- [ ] **Step 2: 读取 main.tsx 行 4464-4613（option 链）**

Run:
```bash
sed -n '4464,4613p' src/main.tsx | head -30
sed -n '4464,4613p' src/main.tsx | wc -l
```

记录每个 `.option(...)` 的 flag 名、描述、默认值。

- [ ] **Step 3: 创建目录**

Run:
```bash
mkdir -p src/cli/program/__tests__
```

- [ ] **Step 4: Commit（标记调研完成）**

```bash
git commit --allow-empty -m "chore: C4 调研 - 确认 main.tsx 1066-1434 + 4464-4613 边界"
```

---

## Task 2: 创建 program/types.ts

**Files:**
- Create: `src/cli/program/types.ts`

- [ ] **Step 1: 抽取 ProgramOptions 类型**

从 main.tsx 中 Commander `.option()` 调用推导出 options 对象类型：

```ts
// src/cli/program/types.ts

/**
 * Commander 解析后的全局 options。
 * 字段对应 main.tsx 行 4464-4613 的 .option() 链。
 */
export interface ProgramOptions {
  // 按 main.tsx 中的 .option() 顺序声明
  // 示例字段（实际需根据 main.tsx 内容补全）：
  print?: string
  prompt?: string
  continue?: boolean
  resume?: string
  model?: string
  inputFormat?: string
  outputFormat?: string
  verbose?: boolean
  dangerouslySkipPermissions?: boolean
  allowedTools?: string[]
  disallowedTools?: string[]
  permissionMode?: string
  maxTurns?: number
  addDir?: string[]
  worktree?: boolean
  tmux?: boolean
  sessionId?: string
  // ... 其余 ~30 个 option
  [key: string]: unknown
}

/**
 * preAction hook 执行后的规范化 options。
 */
export interface NormalizedOptions extends ProgramOptions {
  cwd: string
  sessionId: string
  permissionMode: 'default' | 'plan' | 'acceptEdits' | 'bypassPermissions'
}
```

**操作：** 执行 `grep '\.option(' src/main.tsx` 列出所有 option 定义，每个对应一个字段。

- [ ] **Step 2: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/cli/program/types.ts 2>&1 | head -10
```

Expected: 零错误。

- [ ] **Step 3: Commit**

```bash
git add src/cli/program/types.ts
git commit -m "feat: C4 - 添加 cli/program/types.ts（ProgramOptions 类型）"
```

---

## Task 3: 创建 program/index.ts（createProgram + preAction hook）

**Files:**
- Create: `src/cli/program/index.ts`

- [ ] **Step 1: 抽取 Commander 装配代码**

从 main.tsx 行 1066-1434 找到 `const program = new Command(...)` 及其配置（`.name()`、`.description()`、`.version()`），移到 `program/index.ts`：

```ts
// src/cli/program/index.ts
import { Command } from 'commander'
import { registerGlobalOptions } from './options.js'
import type { ProgramOptions } from './types.js'

/**
 * 创建 Commander program 实例 + 注册全局 options + preAction hook。
 *
 * 替代 main.tsx 行 1066-1434 的装配逻辑。
 */
export function createProgram(): Command {
  const program = new Command()

  program
    .name('claude')
    .description('Claude Code CLI')
    .version(/* 从 MACRO 注入 */ MACRO.VERSION)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .helpOption('-h, --help', 'Show help')

  registerGlobalOptions(program)

  // preAction hook（从 main.tsx 行 ~1200-1434 抽取）
  program.hook('preAction', async (thisCommand, actionCommand) => {
    // 从 main.tsx 抽取的 preAction 逻辑：
    // - 设置 process.env
    // - 校验 --print 与 --resume 互斥
    // - 初始化 telemetry
    // - 等
    await runPreActionHook(thisCommand, actionCommand)
  })

  return program
}

/**
 * preAction hook 实现。
 * 从 main.tsx 行 1200-1434 整体搬移。
 */
async function runPreActionHook(
  thisCommand: Command,
  actionCommand: Command,
): Promise<void> {
  const options = actionCommand.opts() as ProgramOptions

  // === 以下从 main.tsx 原样搬移 ===
  // 设置 CWD
  // 校验互斥 options
  // 初始化 telemetry（调用 cli/bootstrap/telemetry，C7 迁移）
  // 设置 permission mode
  // ...
  // 具体实现见 main.tsx 原代码
}

/**
 * 解析 argv 并返回 options。
 * 用于 fast-paths 不走 Commander 时手动解析。
 */
export async function parseProgram(program: Command, argv: string[]): Promise<Command> {
  await program.parseAsync(argv)
  return program
}
```

**操作：** 打开 main.tsx 行 1066-1434，把整段代码搬移到 `index.ts` 内的 `createProgram` 和 `runPreActionHook`。保留原 import（修正相对路径）。

- [ ] **Step 2: 修正 import 路径**

原 main.tsx 在 `src/`，现 `index.ts` 在 `src/cli/program/`：
- `from './commands.js'` → `from '../../commands.js'`
- `from './Tool.js'` → `from '../../tools/core/index.js'`（C1 后路径）
- `from './services/...'` → `from '../../services/...'`
- `from './utils/...'` → `from '../../utils/...'`

- [ ] **Step 3: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/cli/program/index.ts 2>&1 | head -20
```

Expected: 零错误。如果有 "Cannot find name MACRO"，确认 `src/types/global.d.ts` 已声明。

- [ ] **Step 4: Commit**

```bash
git add src/cli/program/index.ts
git commit -m "refactor: C4 - 抽取 main.tsx 1066-1434 到 cli/program/index.ts（createProgram + preAction）"
```

---

## Task 4: 创建 program/options.ts（全局 option 链）

**Files:**
- Create: `src/cli/program/options.ts`

- [ ] **Step 1: 抽取 150 行 option 链**

从 main.tsx 行 4464-4613 把整个 `.option(...)` 链搬到 `registerGlobalOptions` 函数：

```ts
// src/cli/program/options.ts
import type { Command } from 'commander'

/**
 * 注册全局 option。
 * 替代 main.tsx 行 4464-4613 的 .option() 链。
 */
export function registerGlobalOptions(program: Command): void {
  program
    .option('-p, --print <prompt>', 'Print mode: run non-interactively')
    .option('--continue', 'Continue last conversation')
    .option('--resume <sessionId>', 'Resume a specific session')
    .option('-m, --model <model>', 'Model to use')
    .option('--input-format <format>', 'Input format (text|stream-json)')
    .option('--output-format <format>', 'Output format (text|json|stream-json)')
    .option('--verbose', 'Verbose output')
    .option('--dangerously-skip-permissions', 'Skip permission prompts')
    .option('--allowedTools <tools...>', 'Allowed tools')
    .option('--disallowedTools <tools...>', 'Disallowed tools')
    .option('--permission-mode <mode>', 'Permission mode')
    .option('--max-turns <n>', 'Max turns', parseInt)
    .option('--add-dir <dirs...>', 'Additional directories')
    .option('--worktree', 'Use git worktree')
    .option('--tmux', 'Use tmux integration')
    .option('--session-id <id>', 'Session ID override')
    // ... 从 main.tsx 行 4464-4613 搬移全部 ~40 个 option
}
```

**操作：** 把 main.tsx 4464-4613 整段 `.option(...)` 链原样复制到 `registerGlobalOptions` 函数体内。

- [ ] **Step 2: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/cli/program/options.ts 2>&1 | head -10
```

Expected: 零错误。

- [ ] **Step 3: Commit**

```bash
git add src/cli/program/options.ts
git commit -m "refactor: C4 - 抽取 main.tsx 4464-4613 到 cli/program/options.ts（全局 option 链）"
```

---

## Task 5: 从 main.tsx 删除已搬移的代码

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: 删除行 1066-1434（Commander 装配）**

把 main.tsx 中的 `const program = new Command()` 到 preAction hook 结束的整段替换为：

```ts
// main.tsx 顶部加 import
import { createProgram } from './cli/program/index.js'

// 原 1066-1434 替换为：
const program = createProgram()
```

- [ ] **Step 2: 删除行 4464-4613（option 链）**

原 option 链已由 `createProgram()` 内部的 `registerGlobalOptions(program)` 替代。删除 main.tsx 中的 `.option(...)` 链整段。

- [ ] **Step 3: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: 零错误。如果报 "Cannot find module './cli/program/index.js'"，确认路径。

- [ ] **Step 4: 验证 main.tsx 行数减少**

Run:
```bash
wc -l src/main.tsx
```

Expected: 行数从 5640 减少到约 5120（减少 ~520 行）。

- [ ] **Step 5: Commit**

```bash
git add src/main.tsx
git commit -m "refactor: C4 - 从 main.tsx 删除 Commander 装配与 option 链（-520 行）"
```

---

## Task 6: 写冒烟集成测试

**Files:**
- Create: `tests/integration/cli-program.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/integration/cli-program.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'

describe('C4 cli/program', () => {
  test('createProgram 返回 Commander 实例', async () => {
    const { createProgram } = await import('../../src/cli/program/index.ts')
    const program = createProgram()
    expect(program).toBeDefined()
    expect(program.name()).toBe('claude')
  })

  test('program 含 --print option', async () => {
    const { createProgram } = await import('../../src/cli/program/index.ts')
    const program = createProgram()
    const options = program.options.map(o => o.flags)
    expect(options.some(f => f.includes('--print'))).toBe(true)
  })

  test('program 含 --resume option', async () => {
    const { createProgram } = await import('../../src/cli/program/index.ts')
    const program = createProgram()
    const options = program.options.map(o => o.flags)
    expect(options.some(f => f.includes('--resume'))).toBe(true)
  })

  test('registerGlobalOptions 注册至少 30 个 option', async () => {
    const { registerGlobalOptions } = await import('../../src/cli/program/options.ts')
    const { Command } = await import('commander')
    const program = new Command()
    registerGlobalOptions(program)
    expect(program.options.length).toBeGreaterThan(30)
  })

  test('main.tsx 行数减少', () => {
    const content = require('node:fs').readFileSync(
      require('node:path').resolve(process.cwd(), 'src/main.tsx'), 'utf8',
    )
    const lines = content.split('\n').length
    expect(lines).toBeLessThan(5200)
  })

  test('ProgramOptions 类型存在', async () => {
    const mod = await import('../../src/cli/program/types.ts')
    expect(mod).toBeDefined()
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/cli-program.test.ts
```

Expected: 6 tests pass。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/cli-program.test.ts
git commit -m "test: C4 - cli/program 冒烟测试"
```

---

## Task 7: 跑 precheck + build 验证

**Files:** 无修改

- [ ] **Step 1: 跑 precheck**

Run:
```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 2: 验证 CLI 行为不变**

Run:
```bash
bun run dev --help 2>&1 | head -20
```

Expected: help 输出含全部 option，与重构前一致。

Run:
```bash
bun run dev --version 2>&1
```

Expected: 输出版本号。

- [ ] **Step 3: 跑 build**

Run:
```bash
bun run build 2>&1 | tail -5
```

Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: C4 完成 - cli/program 装配 + option 链迁移"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| preAction hook 内的副作用丢失（telemetry/settings 初始化） | 高 | Task 3 Step 1 整体搬移；Task 7 Step 2 验证 CLI 行为 |
| ProgramOptions 字段遗漏 | 中 | Task 2 基于 main.tsx .option() 完整抽取 |
| MACRO.VERSION 在 program/index.ts 中不可用 | 中 | 确认 global.d.ts 声明；scripts/defines.ts 注入 |
| main.tsx 删除后其他地方引用丢失 | 中 | Task 5 Step 3 tsc 全量检查 |
| option 链顺序变化影响 Commander 解析 | 低 | Task 4 原样复制，不改顺序 |

---

## Workflow Adaptation

- **PR ID:** C4
- **依赖:** C3+C8（H6：原 C4→C2 虚假依赖移除；实际依赖命令系统稳定）
- **被依赖:** C5（subcommands 注册到 program）、C6（dispatcher 从 program 接收 action）
- **推荐 maxConcurrency:** 1
- **建议 phases:**
  1. `Survey` — 读取 main.tsx 目标行段（Task 1）
  2. `Types` — 创建 ProgramOptions（Task 2）
  3. `Program` — 创建 index.ts（Task 3）
  4. `Options` — 创建 options.ts（Task 4）
  5. `Slim` — 从 main.tsx 删除（Task 5）
  6. `Test` — 冒烟测试（Task 6）
  7. `Verify` — precheck + build（Task 7）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      typesCreated: { type: 'boolean' },
      programCreated: { type: 'boolean' },
      optionsCreated: { type: 'boolean' },
      mainTxSlimmed: { type: 'boolean' },
      mainTxLineCount: { type: 'number' },
      optionCount: { type: 'number' },
      unitTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      buildPass: { type: 'boolean' },
      helpOutputCorrect: { type: 'boolean' }
    },
    required: ['programCreated', 'optionsCreated', 'precheckPass', 'buildPass']
  }
  ```
- **可并行点:** Task 2（types）与 Task 3（index）可由同一 subagent 顺序完成；Task 4（options）可由另一 subagent 并行准备 options.ts 草稿，但最终合并需串行。
- **Plan B 触发条件:** 若 preAction hook 搬移后副作用顺序变化导致测试失败，保留 hook 在 main.tsx 中，只搬移 createProgram 骨架，hook 留到 C6 dispatcher 拆分时处理。

---

**本 plan 实现 v2 spec §6.1（行 1066-1434 + 4464-4613 迁移）+ §3.2（cli/program 职责矩阵）。**
