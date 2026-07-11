# C5: cli/subcommands/ —— 静态 import 模式

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `main.tsx` 行 4615-5455（~840 行 subcommand 链式注册）迁到 `src/cli/subcommands/`，改为静态 import + `define()` 函数模式（F1：放弃运行时 globSync）。完成后 `main.tsx` 再减少 ~840 行。

**Architecture:** 11 个 subcommand（mcp/auth/plugin/agents/doctor/update/server/auto-mode/autonomy/task 等）各一个文件，导出 `define(program: Command): void`。`subcommands/index.ts` 静态 import 全部 define 函数，`registerAllSubcommands(program)` 顺序调用。

**Tech Stack:** TypeScript + Commander.js。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/cli/subcommands/index.ts` | 新建：registerAllSubcommands |
| `src/cli/subcommands/mcp.ts` | 新建：mcp serve/add/remove/list/... |
| `src/cli/subcommands/auth.ts` | 新建：auth login/logout/status |
| `src/cli/subcommands/plugin.ts` | 新建：plugin install/uninstall/list |
| `src/cli/subcommands/agents.ts` | 新建：agents 子命令 |
| `src/cli/subcommands/doctor.ts` | 新建：doctor |
| `src/cli/subcommands/update.ts` | 新建：update |
| `src/cli/subcommands/server.ts` | 新建：server |
| `src/cli/subcommands/auto-mode.ts` | 新建：auto-mode |
| `src/cli/subcommands/autonomy.ts` | 新建：autonomy |
| `src/cli/subcommands/task.ts` | 新建：task |
| `src/cli/subcommands/__tests__/` | 新建：测试目录 |
| `src/main.tsx` | 修改：删除行 4615-5455 |
| `tests/integration/cli-subcommands.test.ts` | 新建：冒烟测试 |

---

## Task 1: 读取 main.tsx 4615-5455，识别所有 subcommand

**Files:** 无修改

- [ ] **Step 1: 读取 subcommand 注册段**

Run:
```bash
sed -n '4615,5455p' src/main.tsx | grep -E "program\.command\(" | head -30
```

Expected: 输出每个 `.command('xxx')` 的行，识别所有 subcommand 名。

- [ ] **Step 2: 记录每个 subcommand 的边界**

对每个 `program.command('name')`，记录：
- 起始行（`program.command(...)`）
- 结束行（下一个 `.command(...)` 或段末）
- 该 subcommand 的 `.option()` 数量
- 该 subcommand 的 `.action()` 实现（内联还是引用）

常见 subcommand（根据 CLAUDE.md）：`mcp`（含子子命令 serve/add/remove/list）、`server`、`ssh`、`open`、`auth`、`plugin`、`agents`、`auto-mode`、`doctor`、`update`。

- [ ] **Step 3: 创建目录**

Run:
```bash
mkdir -p src/cli/subcommands/__tests__
```

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: C5 调研 - 识别 main.tsx 4615-5455 的 subcommand 边界"
```

---

## Task 2: 创建 mcp.ts（最复杂的 subcommand 示范）

**Files:**
- Create: `src/cli/subcommands/mcp.ts`

- [ ] **Step 1: 定位 mcp subcommand 在 main.tsx 的位置**

Run:
```bash
grep -n "program\.command('mcp'" src/main.tsx
grep -n "program\.command('mcp " src/main.tsx
```

mcp 通常有嵌套子命令（`mcp serve`、`mcp add`、`mcp remove`、`mcp list`）。

- [ ] **Step 2: 抽取 mcp 注册逻辑到 define 函数**

```ts
// src/cli/subcommands/mcp.ts
import type { Command } from 'commander'

/**
 * 注册 mcp 及其子命令。
 * 替代 main.tsx 中 program.command('mcp')... 链。
 */
export function define(program: Command): void {
  const mcp = program
    .command('mcp')
    .description('Manage MCP server connections')

  mcp
    .command('serve')
    .description('Start as MCP server')
    .option('--transport <type>', 'Transport type (stdio|http|sse)')
    .action(async (options) => {
      // 从 main.tsx 原样搬移 mcp serve action 实现
      const { handleMcpServe } = await import('../../commands/mcp/serve/serve.js')
      await handleMcpServe(options)
    })

  mcp
    .command('add <name>')
    .description('Add an MCP server')
    .option('--transport <type>', 'Transport')
    .option('--url <url>', 'Server URL')
    .option('--command <cmd>', 'Command to run')
    .action(async (name, options) => {
      const { handleMcpAdd } = await import('../../commands/mcp/add/add.js')
      await handleMcpAdd(name, options)
    })

  mcp
    .command('remove <name>')
    .description('Remove an MCP server')
    .action(async (name) => {
      const { handleMcpRemove } = await import('../../commands/mcp/remove/remove.js')
      await handleMcpRemove(name)
    })

  mcp
    .command('list')
    .description('List configured MCP servers')
    .action(async () => {
      const { handleMcpList } = await import('../../commands/mcp/list/list.js')
      await handleMcpList()
    })

  // 其余 mcp 子命令从 main.tsx 搬移
}
```

**操作：** 打开 main.tsx 中 mcp 注册段，把每个 `.command()` 链原样搬到 `define` 函数内。`.action()` 的实现如果内联，用 `await import(...)` 改为懒加载（保持启动性能）。

- [ ] **Step 3: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/cli/subcommands/mcp.ts 2>&1 | head -10
```

Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add src/cli/subcommands/mcp.ts
git commit -m "refactor: C5 - 抽取 mcp subcommand 到 cli/subcommands/mcp.ts"
```

---

## Task 3: 批量创建其余 10 个 subcommand 文件

**Files:**
- Create: `auth.ts`、`plugin.ts`、`agents.ts`、`doctor.ts`、`update.ts`、`server.ts`、`auto-mode.ts`、`autonomy.ts`、`task.ts`

- [ ] **Step 1: 对每个 subcommand 重复 Task 2 的流程**

对 main.tsx 中每个 `program.command('xxx')`：

1. 创建 `src/cli/subcommands/<name>.ts`
2. 导出 `define(program: Command): void`
3. 把对应的 `.command()` 链搬入
4. `.action()` 用 `await import(...)` 懒加载命令实现

**模板（以 auth 为例）：**

```ts
// src/cli/subcommands/auth.ts
import type { Command } from 'commander'

export function define(program: Command): void {
  const auth = program
    .command('auth')
    .description('Authentication management')

  auth
    .command('login')
    .description('Log in to Claude')
    .action(async () => {
      const { handleAuthLogin } = await import('../../commands/model/login/login.js')
      await handleAuthLogin()
    })

  auth
    .command('logout')
    .description('Log out')
    .action(async () => {
      const { handleAuthLogout } = await import('../../commands/model/logout/logout.js')
      await handleAuthLogout()
    })

  auth
    .command('status')
    .description('Show auth status')
    .action(async () => {
      const { handleAuthStatus } = await import('../../commands/model/login/status.js')
      await handleAuthStatus()
    })
}
```

- [ ] **Step 2: 逐个跑 typecheck**

Run:
```bash
for f in auth plugin agents doctor update server auto-mode autonomy task; do
  echo "=== $f ==="
  bunx tsc --noEmit src/cli/subcommands/$f.ts 2>&1 | head -5
done
```

Expected: 每个零错误。

- [ ] **Step 3: Commit**

```bash
git add src/cli/subcommands/{auth,plugin,agents,doctor,update,server,auto-mode,autonomy,task}.ts
git commit -m "refactor: C5 - 抽取 9 个 subcommand 到 cli/subcommands/"
```

---

## Task 4: 创建 subcommands/index.ts（registerAllSubcommands）

**Files:**
- Create: `src/cli/subcommands/index.ts`

- [ ] **Step 1: 写 index.ts**

```ts
// src/cli/subcommands/index.ts
import type { Command } from 'commander'
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
 */
const DEFINERS = [
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
]

/**
 * 注册所有 subcommand 到 program。
 */
export function registerAllSubcommands(program: Command): void {
  for (const define of DEFINERS) {
    define(program)
  }
}

export { defineMcp, defineAuth, definePlugin, defineAgents, defineDoctor,
  defineUpdate, defineServer, defineAutoMode, defineAutonomy, defineTask }
```

- [ ] **Step 2: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/cli/subcommands/index.ts 2>&1 | head -10
```

Expected: 零错误。

- [ ] **Step 3: Commit**

```bash
git add src/cli/subcommands/index.ts
git commit -m "feat: C5 - 添加 registerAllSubcommands（静态 import 11 个 define）"
```

---

## Task 5: 从 main.tsx 删除 subcommand 链

**Files:**
- Modify: `src/main.tsx`

- [ ] **Step 1: 替换 subcommand 链为 registerAllSubcommands 调用**

在 main.tsx 中找到行 4615-5455 的 subcommand 注册段，替换为：

```ts
// main.tsx 顶部加 import
import { registerAllSubcommands } from './cli/subcommands/index.js'

// 原 4615-5455 替换为：
registerAllSubcommands(program)
```

- [ ] **Step 2: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: 零错误。

- [ ] **Step 3: 验证 main.tsx 行数**

Run:
```bash
wc -l src/main.tsx
```

Expected: 约 4300 行（5640 - 520[C4] - 840[C5] ≈ 4280）。

- [ ] **Step 4: Commit**

```bash
git add src/main.tsx
git commit -m "refactor: C5 - 从 main.tsx 删除 840 行 subcommand 链（-840 行）"
```

---

## Task 6: 写单测 —— 每个 define 注册正确

**Files:**
- Create: `src/cli/subcommands/__tests__/subcommands.test.ts`

- [ ] **Step 1: 写测试**

Create `src/cli/subcommands/__tests__/subcommands.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { Command } from 'commander'

describe('C5 subcommands', () => {
  test('registerAllSubcommands 注册全部 subcommand', async () => {
    const { registerAllSubcommands } = await import('../index.ts')
    const program = new Command()
    registerAllSubcommands(program)
    const cmds = program.commands.map(c => c.name())
    expect(cmds).toContain('mcp')
    expect(cmds).toContain('auth')
    expect(cmds).toContain('plugin')
    expect(cmds).toContain('doctor')
    expect(cmds).toContain('update')
  })

  test('mcp define 注册 serve/add/remove/list', async () => {
    const { defineMcp } = await import('../mcp.ts')
    const program = new Command()
    defineMcp(program)
    const mcp = program.commands.find(c => c.name() === 'mcp')
    expect(mcp).toBeDefined()
    const subCmds = mcp!.commands.map(c => c.name())
    expect(subCmds).toContain('serve')
    expect(subCmds).toContain('add')
    expect(subCmds).toContain('remove')
    expect(subCmds).toContain('list')
  })

  test('auth define 注册 login/logout', async () => {
    const { defineAuth } = await import('../auth.ts')
    const program = new Command()
    defineAuth(program)
    const auth = program.commands.find(c => c.name() === 'auth')
    expect(auth).toBeDefined()
    const subCmds = auth!.commands.map(c => c.name())
    expect(subCmds).toContain('login')
    expect(subCmds).toContain('logout')
  })

  test('每个 define 是函数', async () => {
    const mod = await import('../index.ts')
    expect(typeof mod.defineMcp).toBe('function')
    expect(typeof mod.defineAuth).toBe('function')
    expect(typeof mod.definePlugin).toBe('function')
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test src/cli/subcommands/__tests__/subcommands.test.ts
```

Expected: 4 tests pass。

- [ ] **Step 3: Commit**

```bash
git add src/cli/subcommands/__tests__/subcommands.test.ts
git commit -m "test: C5 - subcommands define 单测"
```

---

## Task 7: 写冒烟集成测试

**Files:**
- Create: `tests/integration/cli-subcommands.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/integration/cli-subcommands.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { execSync } from 'node:child_process'

describe('C5 cli/subcommands integration', () => {
  test('mcp --help 输出含 serve/add/remove/list', () => {
    const output = execSync('bun run dev mcp --help 2>&1 || true', {
      cwd: process.cwd(),
    }).toString()
    expect(output).toContain('serve')
    expect(output).toContain('add')
  })

  test('auth --help 输出含 login', () => {
    const output = execSync('bun run dev auth --help 2>&1 || true', {
      cwd: process.cwd(),
    }).toString()
    expect(output).toContain('login')
  })

  test('main.tsx 不再含 program.command 链', () => {
    const content = require('node:fs').readFileSync(
      require('node:path').resolve(process.cwd(), 'src/main.tsx'), 'utf8',
    )
    // 允许少量（fast-path 内的），但 subcommand 主体应已搬走
    const commandCount = (content.match(/program\.command\(/g) || []).length
    expect(commandCount).toBeLessThan(5)
  })

  test('main.tsx 行数 < 4400', () => {
    const content = require('node:fs').readFileSync(
      require('node:path').resolve(process.cwd(), 'src/main.tsx'), 'utf8',
    )
    expect(content.split('\n').length).toBeLessThan(4400)
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/cli-subcommands.test.ts
```

Expected: 4 tests pass。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/cli-subcommands.test.ts
git commit -m "test: C5 - subcommands 冒烟集成测试"
```

---

## Task 8: 跑 precheck + build 验证

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
bun run dev mcp --help 2>&1 | head -10
bun run dev auth --help 2>&1 | head -10
bun run dev doctor --help 2>&1 | head -10
```

Expected: 每个 subcommand 的 help 输出与重构前一致。

- [ ] **Step 3: 跑 build**

Run:
```bash
bun run build 2>&1 | tail -5
```

Expected: 构建成功。

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: C5 完成 - subcommands 静态 import 模式"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| subcommand 的 .action() 内联实现搬移后丢失上下文 | 高 | Task 2/3 用 `await import(...)` 懒加载，保持原闭包 |
| subcommand 顺序变化影响 Commander 解析 | 低 | DEFINERS 数组顺序按 main.tsx 原顺序 |
| 某些 subcommand 有共享状态（如 auth 影响 mcp） | 中 | action 内通过 `await import` 动态加载，状态走模块单例 |
| 懒加载 import 路径错误 | 中 | Task 3 Step 2 逐个 typecheck |
| 漏搬某个 subcommand | 中 | Task 7 测试验证 main.tsx 中 `.command(` 计数 < 5 |

---

## Workflow Adaptation

- **PR ID:** C5
- **依赖:** C4（program 已创建，subcommand 注册到 program）
- **被依赖:** C6（dispatcher 接管 program.action）、C7（main.tsx 最终删除）
- **推荐 maxConcurrency:** 2（10 个 subcommand 文件可分两组并行创建，但 index.ts 与 main.tsx 改动串行）
- **建议 phases:**
  1. `Survey` — 识别 subcommand 边界（Task 1）
  2. `Mcp` — 示范创建 mcp.ts（Task 2，串行）
  3. `Batch` — 并行创建其余 9 个（Task 3，可 2-3 subagent 并行）
  4. `Index` — 创建 index.ts（Task 4，串行）
  5. `Slim` — 从 main.tsx 删除（Task 5，串行）
  6. `Test` — 单测 + 冒烟（Task 6-7）
  7. `Verify` — precheck + build（Task 8）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      subcommandCount: { type: 'number' },
      indexCreated: { type: 'boolean' },
      mainTxSlimmed: { type: 'boolean' },
      mainTxLineCount: { type: 'number' },
      unitTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      buildPass: { type: 'boolean' },
      helpOutputCorrect: { type: 'boolean' }
    },
    required: ['indexCreated', 'mainTxSlimmed', 'precheckPass', 'buildPass']
  }
  ```
- **可并行点:** Task 3 的 10 个 subcommand 文件创建可并行（2-3 个 subagent 分担）。每个文件独立，无相互依赖。
- **Plan B 触发条件:** 若某 subcommand 的 action 实现过于复杂（如 server.ts 含 HTTP 服务器启动逻辑），该 subcommand 保留在 main.tsx 中不搬，C5 只搬简单的。剩余复杂 subcommand 在 C6 dispatcher 拆分时一并处理。

---

**本 plan 实现 v2 spec §6.1（行 4615-5455 迁移）+ §6.3（CLI subcommand 静态 import 模式）+ §3.2（cli/subcommands 职责矩阵）。**
