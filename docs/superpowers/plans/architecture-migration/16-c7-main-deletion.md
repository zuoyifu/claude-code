# C7: main.tsx 删除 + cli.tsx 最终形态

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `main.tsx` 剩余的 bootstrap 函数（行 369-1029、5459-5620）迁到 `cli/bootstrap/`，改写 `entrypoints/cli.tsx` 为最终形态（<200 行），整合所有 fast-paths（M7），删除 `main.tsx`。

**Architecture:** `cli/bootstrap/` 含 5 个模块（telemetry/settings/prefetch/trust/index），集中启动副作用。`cli/fast-paths.ts` 统一接管所有快速路径（`--version`/bridge/daemon/template jobs 等）。`entrypoints/cli.tsx` 是极薄入口，只 dispatch。

**Tech Stack:** TypeScript + Commander + Bun。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/cli/bootstrap/telemetry.ts` | 新建：telemetry 初始化 + logTenguInit |
| `src/cli/bootstrap/settings.ts` | 新建：settings 加载 + trust dialog |
| `src/cli/bootstrap/prefetch.ts` | 新建：启动期 prefetch |
| `src/cli/bootstrap/trust.ts` | 新建：trust dialog |
| `src/cli/bootstrap/index.ts` | 新建：barrel |
| `src/cli/fast-paths.ts` | 新建：统一 fast-path 调度（含 bridge/daemon/M7） |
| `src/entrypoints/cli.tsx` | 修改：改为最终形态（<200 行） |
| `src/main.tsx` | **删除** |
| `src/utils/terminal/cursor.ts` | 新建：resetCursor |
| `tests/integration/c7-main-deletion.test.ts` | 新建：冒烟测试 |

---

## Task 1: 创建 cli/bootstrap/telemetry.ts

**Files:**
- Create: `src/cli/bootstrap/telemetry.ts`

- [ ] **Step 1: 读取 main.tsx 行 369-470（telemetry）+ 5459-5563（logTenguInit）**

Run:
```bash
sed -n '369,470p' src/main.tsx | head -40
sed -n '5459,5563p' src/main.tsx | head -30
```

- [ ] **Step 2: 写 telemetry.ts**

```ts
// src/cli/bootstrap/telemetry.ts
/**
 * Telemetry 初始化 + logTenguInit。
 * 替代 main.tsx 行 369-470 + 5459-5563。
 */
export async function initTelemetry(options: unknown): Promise<void> {
  // 从 main.tsx 行 369-470 搬移
  // - 初始化 analytics（如非 stubbed）
  // - 设置 session ID
  // - 记录 CLI 启动事件
}

export async function logTenguInit(): Promise<void> {
  // 从 main.tsx 行 5459-5563 搬移
  // - 记录 Tengu 初始化（telemetry 后端）
}
```

**操作：** 把 main.tsx 对应行段的原代码搬入，修正 import 路径（`src/cli/bootstrap/` → `src/` 根需 `../../`）。

- [ ] **Step 3: typecheck + Commit**

```bash
bunx tsc --noEmit src/cli/bootstrap/telemetry.ts 2>&1 | head -5
git add src/cli/bootstrap/telemetry.ts
git commit -m "refactor: C7 - 抽取 bootstrap/telemetry（initTelemetry + logTenguInit）"
```

---

## Task 2: 创建 bootstrap/settings.ts、prefetch.ts、trust.ts

**Files:**
- Create: 3 个文件

- [ ] **Step 1: settings.ts**

从 main.tsx 行 582-668 抽取 settings 加载：

```ts
// src/cli/bootstrap/settings.ts
export async function loadSettings(options: unknown): Promise<void> {
  // 从 main.tsx 行 582-668 搬移
  // - 读 ~/.claude/settings.json
  // - 合并项目 .claude/settings.json
  // - 应用 overrides
}

export async function runTrustDialog(cwd: string): Promise<void> {
  // 从 main.tsx 行 670-742 搬移 trust dialog
}
```

- [ ] **Step 2: prefetch.ts**

从 main.tsx 行 507-580 抽取：

```ts
// src/cli/bootstrap/prefetch.ts
export async function startPrefetches(options: unknown): Promise<void> {
  // 从 main.tsx 行 507-580 搬移
  // - 启动 MCP prefetch
  // - 启动 skill prefetch
  // - 启动 tool index 预构建
}
```

- [ ] **Step 3: trust.ts（如果 settings.ts 已含 trust dialog，此文件可为空 barrel）**

```ts
// src/cli/bootstrap/trust.ts
export { runTrustDialog } from './settings.js'
```

- [ ] **Step 4: 创建 bootstrap/index.ts**

```ts
// src/cli/bootstrap/index.ts
export * from './telemetry.js'
export * from './settings.js'
export * from './prefetch.js'
export * from './trust.js'
```

- [ ] **Step 5: 更新 dispatcher/bootstrap.ts 的 import 路径**

C6 中 dispatcher/bootstrap.ts 用 `await import('../bootstrap/telemetry.js')` 等（带 @ts-expect-error）。现在路径可达，移除 @ts-expect-error：

Edit `src/cli/dispatcher/bootstrap.ts`：把 `await import('../../../migrations/index.js')` 等修正为正确路径，删除 `@ts-expect-error`。

- [ ] **Step 6: typecheck + Commit**

```bash
bunx tsc --noEmit src/cli/bootstrap/ 2>&1 | head -10
git add src/cli/bootstrap/{settings,prefetch,trust,index}.ts src/cli/dispatcher/bootstrap.ts
git commit -m "refactor: C7 - 抽取 bootstrap/settings/prefetch/trust + 更新 dispatcher import"
```

---

## Task 3: 创建 cli/fast-paths.ts（M7 统一 fast-path）

**Files:**
- Create: `src/cli/fast-paths.ts`

- [ ] **Step 1: 识别所有 fast-path**

从 `entrypoints/cli.tsx` 的 `main()` 和 main.tsx 的 fast-path 分支（M7）：

| argv 模式 | 处理 |
|-----------|------|
| `--version` / `-v` | 零模块加载，打印版本 |
| `--dump-system-prompt` | feature-gated |
| `--claude-in-chrome-mcp` / `--chrome-native-host` | 启动 Chrome MCP |
| `--computer-use-mcp` | 启动 Computer Use MCP |
| `--daemon-worker=<kind>` | feature-gated |
| `remote-control` / `rc` / `remote` / `sync` / `bridge` | bridgeMain |
| `daemon` [subcommand] | daemonMain |
| `ps` / `logs` / `attach` / `kill` / `--bg` | BG_SESSIONS |
| `new` / `list` / `reply` | Template jobs |
| `environment-runner` / `self-hosted-runner` | BYOC runner |
| `--tmux` + `--worktree` | worktree 模式 |

- [ ] **Step 2: 写 fast-paths.ts**

```ts
// src/cli/fast-paths.ts
import { feature } from 'bun:bundle'

/**
 * 统一 fast-path 调度（M7）。
 * 替代 entrypoints/cli.tsx 中散布的 if-else 链。
 *
 * @returns true 如果 fast-path 已处理（应退出进程），false 表示继续默认路径
 */
export async function handleFastPath(argv: string[]): Promise<boolean> {
  const [first, second] = argv.slice(2)

  // --version / -v（零模块加载）
  if (first === '--version' || first === '-v') {
    console.log(MACRO.VERSION)
    return true
  }

  // --dump-system-prompt
  if (first === '--dump-system-prompt') {
    if (feature('DUMP_SYSTEM_PROMPT')) {
      const { dumpSystemPrompt } = await import('../context.js')
      console.log(await dumpSystemPrompt())
      return true
    }
  }

  // --computer-use-mcp
  if (first === '--computer-use-mcp') {
    const { runComputerUseMcp } = await import('@ant/computer-use-mcp')
    await runComputerUseMcp()
    return true
  }

  // --chrome-native-host / --claude-in-chrome-mcp
  if (first === '--chrome-native-host' || first === '--claude-in-chrome-mcp') {
    const { runChromeNativeHost } = await import('@ant/claude-for-chrome-mcp')
    await runChromeNativeHost()
    return true
  }

  // --daemon-worker
  if (first?.startsWith('--daemon-worker=')) {
    if (feature('DAEMON')) {
      const kind = first.split('=')[1]
      const { runDaemonWorker } = await import('../daemon/worker.js')
      await runDaemonWorker(kind)
      return true
    }
  }

  // bridge / remote-control
  if (['remote-control', 'rc', 'remote', 'sync', 'bridge'].includes(first)) {
    if (feature('BRIDGE_MODE')) {
      const { bridgeMain } = await import('../bridge/bridgeMain.js')
      await bridgeMain(argv.slice(2))
      return true
    }
  }

  // daemon [subcommand]
  if (first === 'daemon') {
    if (feature('DAEMON')) {
      const { daemonMain } = await import('../daemon/main.js')
      await daemonMain(second)
      return true
    }
  }

  // BG_SESSIONS: ps / logs / attach / kill
  if (['ps', 'logs', 'attach', 'kill'].includes(first) || argv.includes('--bg')) {
    if (feature('BG_SESSIONS')) {
      const { bgMain } = await import('../bg/main.js')
      await bgMain(argv.slice(2))
      return true
    }
  }

  // Template jobs: new / list / reply
  if (['new', 'list', 'reply'].includes(first)) {
    if (feature('TEMPLATES')) {
      const { templateMain } = await import('../templates/main.js')
      await templateMain(argv.slice(2))
      return true
    }
  }

  // BYOC runners
  if (['environment-runner', 'self-hosted-runner'].includes(first)) {
    const { byocMain } = await import('../byoc/main.js')
    await byocMain(argv.slice(2))
    return true
  }

  // --tmux + --worktree 组合
  if (argv.includes('--tmux') && argv.includes('--worktree')) {
    const { runWorktreeTmux } = await import('./worktree-tmux.js')
    await runWorktreeTmux(argv.slice(2))
    return true
  }

  return false
}
```

**注意：** `feature()` 调用必须在条件位置（Bun 编译器限制）。此处的 fast-path 模块允许少量 feature() 调用（spec §3.3 约束 2：cli/bootstrap/ 内允许 <=5 处，fast-paths 同理）。

- [ ] **Step 3: typecheck**

Run:
```bash
bunx tsc --noEmit src/cli/fast-paths.ts 2>&1 | head -10
```

Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add src/cli/fast-paths.ts
git commit -m "feat: C7 - 添加 cli/fast-paths.ts 统一快速路径调度（M7）"
```

---

## Task 4: 改写 entrypoints/cli.tsx 为最终形态

**Files:**
- Modify: `src/entrypoints/cli.tsx`

- [ ] **Step 1: 写最终形态**

```tsx
// src/entrypoints/cli.tsx (<200 行)
// F3 放宽：cli.tsx 可依赖 cli/dispatcher（合理的根依赖）
import { createProgram } from '../cli/program/index.js'
import { registerAllSubcommands } from '../cli/subcommands/index.js'
import { handleDefaultAction } from '../cli/dispatcher/index.js'
import { handleFastPath } from '../cli/fast-paths.js'

async function main(): Promise<void> {
  // 1. fast-path 调度
  if (await handleFastPath(process.argv)) return

  // 2. 默认路径：Commander 装配
  const program = createProgram()
  registerAllSubcommands(program)
  program.action(handleDefaultAction)

  // 3. 解析 argv
  await program.parseAsync(process.argv)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 2: 验证行数 < 200**

Run:
```bash
wc -l src/entrypoints/cli.tsx
```

Expected: < 200 行（实际约 30 行）。

- [ ] **Step 3: typecheck**

Run:
```bash
bunx tsc --noEmit src/entrypoints/cli.tsx 2>&1 | head -10
```

Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add src/entrypoints/cli.tsx
git commit -m "refactor: C7 - 改写 entrypoints/cli.tsx 为最终形态（<200 行）"
```

---

## Task 5: 创建 utils/terminal/cursor.ts + 迁移剩余辅助函数

**Files:**
- Create: `src/utils/terminal/cursor.ts`

- [ ] **Step 1: cursor.ts**

从 main.tsx 行 5607-5620 抽取 `resetCursor`：

```ts
// src/utils/terminal/cursor.ts

/**
 * 重置终端光标。
 * 替代 main.tsx 行 5607-5620。
 */
export function resetCursor(): void {
  process.stdout.write('\x1B[?25h') // 显示光标
}
```

- [ ] **Step 2: 检查 main.tsx 是否还有未迁移代码**

Run:
```bash
wc -l src/main.tsx
grep -c "^export\|^async function\|^function" src/main.tsx
```

Expected: 行数 < 200，剩余只有 import 和零散导出。如果有实质函数未迁移，逐一处理。

- [ ] **Step 3: typecheck + Commit**

```bash
bunx tsc --noEmit src/utils/terminal/cursor.ts 2>&1 | head -5
git add src/utils/terminal/cursor.ts
git commit -m "refactor: C7 - 抽取 utils/terminal/cursor.ts（resetCursor）"
```

---

## Task 6: 删除 main.tsx

**Files:**
- Delete: `src/main.tsx`

- [ ] **Step 1: 确认无外部引用**

Use Grep tool:
- Pattern: `from '.*main(\.js|\.tsx)?'`
- Path: `/Users/konghayao/code/ai/claude-code/src`
- Output mode: `files_with_matches`

Expected: 零匹配（或只有 `entrypoints/cli.tsx` 旧引用，已在 Task 4 移除）。

如有残留，修正 import 到新路径。

- [ ] **Step 2: 删除 main.tsx**

Run:
```bash
git rm src/main.tsx
```

- [ ] **Step 3: 跑全项目 typecheck**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: 零错误。如果有 "Cannot find module './main.js'"，回到 Step 1 修正残留引用。

- [ ] **Step 4: 验证 tsconfig 入口**

检查 `tsconfig.json` / `build.ts` 是否引用 `src/main.tsx`：

Run:
```bash
grep -r "main\.tsx\|main\.js" tsconfig.json build.ts scripts/ 2>/dev/null | head -10
```

如有引用，改为 `src/entrypoints/cli.tsx`。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: C7 - 删除 src/main.tsx（5640 行 → 0 行，拆分到 cli/）"
```

---

## Task 7: 写冒烟集成测试

**Files:**
- Create: `tests/integration/c7-main-deletion.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/integration/c7-main-deletion.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'src')

describe('C7 main.tsx deletion', () => {
  test('main.tsx 已删除', () => {
    expect(existsSync(path.join(SRC, 'main.tsx'))).toBe(false)
  })

  test('cli/bootstrap/ 5 个模块存在', () => {
    const expected = ['telemetry.ts', 'settings.ts', 'prefetch.ts', 'trust.ts', 'index.ts']
    for (const f of expected) {
      expect(existsSync(path.join(SRC, 'cli/bootstrap', f))).toBe(true)
    }
  })

  test('cli/fast-paths.ts 存在', () => {
    expect(existsSync(path.join(SRC, 'cli/fast-paths.ts'))).toBe(true)
  })

  test('entrypoints/cli.tsx < 200 行', () => {
    const content = require('node:fs').readFileSync(
      path.join(SRC, 'entrypoints/cli.tsx'), 'utf8',
    )
    expect(content.split('\n').length).toBeLessThan(200)
  })

  test('cli.tsx import handleFastPath', () => {
    const content = require('node:fs').readFileSync(
      path.join(SRC, 'entrypoints/cli.tsx'), 'utf8',
    )
    expect(content).toContain('handleFastPath')
    expect(content).toContain('createProgram')
    expect(content).toContain('registerAllSubcommands')
    expect(content).toContain('handleDefaultAction')
  })

  test('handleFastPath 处理 --version', async () => {
    const { handleFastPath } = await import('../../src/cli/fast-paths.ts')
    const result = await handleFastPath(['node', 'cli', '--version'])
    expect(result).toBe(true)
  })

  test('handleFastPath 非 fast-path 返回 false', async () => {
    const { handleFastPath } = await import('../../src/cli/fast-paths.ts')
    const result = await handleFastPath(['node', 'cli', 'some-command'])
    expect(result).toBe(false)
  })

  test('utils/terminal/cursor.ts 存在', () => {
    expect(existsSync(path.join(SRC, 'utils/terminal/cursor.ts'))).toBe(true)
  })

  test('无文件引用 main.tsx', () => {
    const { execSync } = require('node:child_process')
    const output = execSync(
      "grep -rl \"from '.*main\\.\\(js\\|tsx\\)'\" src/ 2>/dev/null || true",
      { cwd: process.cwd() },
    ).toString().trim()
    expect(output).toBe('')
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/c7-main-deletion.test.ts
```

Expected: 9 tests pass。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/c7-main-deletion.test.ts
git commit -m "test: C7 - main.tsx 删除冒烟测试"
```

---

## Task 8: 跑 precheck + build + 全面行为验证

**Files:** 无修改

- [ ] **Step 1: 跑 precheck**

Run:
```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 2: 跑 build**

Run:
```bash
bun run build 2>&1 | tail -5
```

Expected: 构建成功，输出 `dist/cli.js`。

- [ ] **Step 3: 验证 dist 产物行为**

Run:
```bash
node dist/cli.js --version 2>&1 | head -2
bun dist/cli.js --help 2>&1 | head -5
echo "hello" | bun dist/cli.js -p 2>&1 | head -3
```

Expected: 所有命令行为正常。

- [ ] **Step 4: 跑 dependency-cruiser 验证边界**

Run:
```bash
bunx depcruise src --config 2>&1 | grep -E 'cli-dispatcher|feature-bundle' | head -5
```

Expected: `cli-dispatcher-no-command-impl` 规则 warning 减少（dispatcher 不再 import 具体 command）。

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore: C7 完成 - main.tsx 删除 + cli.tsx 最终形态 + fast-paths 统一"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| main.tsx 删除后遗漏的导出被外部引用 | 高 | Task 6 Step 1 Grep 验证 + Step 3 tsc 全量检查 |
| fast-paths.ts 的 feature() 调用超过 5 处 | 中 | spec §3.3 允许少量；统计后如超标，把低频 path 合并 |
| bootstrap 模块副作用顺序在 C6→C7 迁移中错乱 | 高 | Task 2 Step 5 更新 dispatcher import；Task 8 Step 3 行为验证 |
| tsconfig/build.ts 入口未更新 | 中 | Task 6 Step 4 检查 |
| dist 产物中 fast-path 不工作 | 高 | Task 8 Step 3 用 node/bun 分别验证 |

---

## Workflow Adaptation

- **PR ID:** C7
- **依赖:** C6（dispatcher 已完成，main.tsx 只剩 bootstrap 残余）
- **被依赖:** F1（shim 验证）、F3（CLAUDE.md 更新）、F4（depcruise 收紧）
- **推荐 maxConcurrency:** 1
- **建议 phases:**
  1. `Bootstrap` — 创建 telemetry/settings/prefetch/trust（Task 1-2）
  2. `FastPaths` — 统一 fast-path 调度（Task 3）
  3. `CliTsx` — 改写 entrypoints/cli.tsx（Task 4）
  4. `Helpers` — cursor.ts + 残余（Task 5）
  5. `Delete` — 删除 main.tsx（Task 6）
  6. `Test` — 冒烟测试（Task 7）
  7. `Verify` — precheck + build + 行为（Task 8）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      bootstrapCreated: { type: 'boolean' },
      fastPathsCreated: { type: 'boolean' },
      cliTsxUnder200: { type: 'boolean' },
      mainTxDeleted: { type: 'boolean' },
      noDanglingMainRef: { type: 'boolean' },
      unitTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      buildPass: { type: 'boolean' },
      distBehaviorCorrect: { type: 'boolean' }
    },
    required: ['bootstrapCreated', 'fastPathsCreated', 'mainTxDeleted', 'precheckPass', 'buildPass']
  }
  ```
- **可并行点:** Task 1（telemetry）与 Task 2（settings/prefetch/trust）可由 2 个 subagent 并行。Task 3-8 串行。
- **Plan B 触发条件:** 若 main.tsx 删除后发现某处遗漏（tsc 报错且无法快速定位），临时恢复 main.tsx 为 re-export shim（从 cli/ 各模块 re-export），分两个 PR 完成删除。此为退路，非首选。

---

**本 plan 实现 v2 spec §6.1（剩余行迁移）+ §6.4（cli.tsx 最终形态 F3）+ §6.1 M7（fast-paths 统一）+ §9.2 C7。**
