# C3+C8: 命令分组 + 启用 generated.ts（H8 合并：路径改写同 PR）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 144 个平铺命令目录搬到 17 个主题分组（含 M5 的 `session/`→`session-info/` 重命名），启用 P2 创建的 `generated.ts` 替代 `commands.ts` 中央数组，替换所有 import 路径。C3 与 C8 合并为原子 PR（H8：原 C8 "纯 git mv" 与 C3 必须同 PR，否则 import 路径不一致）。

**Architecture:** 按 v2 spec §4.2 的 `commands/<category>/<name>/index.ts` 约定。每个命令目录的 `index.ts` 改写为 `CommandSpec` 标准形态（自声明 `visibility` / `safety` / `featureGate`）。`generated.ts` 由 P4 集成到 build.ts/dev.ts，编译期生成静态 import 数组。

**Tech Stack:** TypeScript + Bun + Commander + `git mv`。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/commands/_registry/generated.ts` | 新建（首次生成，由 scanner.ts 产生） |
| `src/commands/_registry/registry.ts` | 新建：运行时查询入口（filter + find） |
| `src/commands/<category>/<name>/index.ts` | 修改：每个命令的 index.ts 改为 CommandSpec 形态 |
| `src/commands.ts` | 修改：从 850 行降到 ~50 行（只剩 re-export + 查询函数） |
| `src/commands/_shared/` | 新建：跨命令共享的 helper |
| `tests/integration/commands-regroup.test.ts` | 新建：冒烟测试 |

---

## Task 1: M5 重命名 —— `session/` → `session-info/`

**Files:**
- Rename: `src/commands/session/` → `src/commands/session-info/`

按 M5：原 `commands/session/`（显示远程 URL 的命令）与新的会话生命周期分组容器 `session/` 同名冲突。先重命名释放 `session` 名字。

- [ ] **Step 1: 确认当前 commands/session/ 是显示会话信息命令**

Run:
```bash
ls src/commands/session/ 2>&1
cat src/commands/session/index.ts 2>&1 | head -20
```

Expected: 单个命令目录，描述为显示远程 URL / session info。

- [ ] **Step 2: git mv**

Run:
```bash
git mv src/commands/session src/commands/session-info
```

Expected: `src/commands/session-info/` 存在，`src/commands/session/` 不存在。

- [ ] **Step 3: 在 Grep 中查找引用 `commands/session/` 的文件**

Use Grep tool:
- Pattern: `commands/session/`
- Path: `/Users/konghayao/code/ai/claude-code/src`
- Output mode: `files_with_matches`

修正每处引用为新路径。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: C3+C8 - M5 重命名 commands/session/ → session-info/（释放 session 分组容器）"
```

---

## Task 2: 创建 17 个分组目录骨架

**Files:**
- Create: `src/commands/{session,mcp,model,config,memory,skills,plugins,tasks,ui,debug,review,version,files,bridge,daemon,_misc,_shared}/`

- [ ] **Step 1: 批量创建分组目录**

Run:
```bash
cd src/commands && mkdir -p session mcp model config memory skills plugins tasks ui debug review version files bridge daemon _misc _shared
```

Expected: 17 个目录创建（含已存在的合并）。

- [ ] **Step 2: 验证**

Run:
```bash
ls -d src/commands/*/
```

Expected: 列出 17+ 个分组目录（含 `session-info/`、`_registry/`、`_shared/` 等）。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: C3+C8 - 创建 17 个命令分组目录骨架"
```

---

## Task 3: 命令分类映射表（基于 commands.ts 中央数组）

**Files:** 无修改（分析步骤）

- [ ] **Step 1: 读取 commands.ts 中央数组**

Run:
```bash
head -200 src/commands.ts
```

记录每个 import 与对应的命令名。

- [ ] **Step 2: 建立命令→分组映射**

在 `docs/superpowers/refactor-assets/command-category-mapping.md`（临时工作文档）列出 144 个命令的分组决策。规则：
- `clear`/`resume`/`rewind`/`fork`/`rename`/`tag`/`compact`/`export` → `session`
- `serve`/`add`/`remove`/`list`（MCP 相关）→ `mcp`
- `model`/`login`/`logout`/`provider`/`fast`/`effort` → `model`
- `config`/`permissions`/`hooks`/`keybindings`/`theme`/`vim` → `config`
- `memory`/`local-memory`/`memory-stores` → `memory`
- `skills`/`skill-search`/`skill-store`/`skill-learning` → `skills`
- `plugin`/`reload-plugins`/`install-*` → `plugins`
- `tasks`/`agents`/`job`/`schedule` → `tasks`
- `color`/`statusline`/`tui` + `session-info` → `ui`
- `doctor`/`debug-tool-call`/`perf-issue`/`heapdump`/`env` → `debug`
- `review`/`security-review`/`autofix-pr`/`pr_comments` → `review`
- `version`/`upgrade`/`release-notes` → `version`
- `files`/`diff`/`add-dir`/`copy` → `files`
- `bridge`/`remoteControlServer`/`remote-env`/`remote-setup` → `bridge`
- `daemon`/`attach`/`detach`/`status` → `daemon`
- 其余 → `_misc`

- [ ] **Step 3: 写到工作文档**

Create `docs/superpowers/refactor-assets/command-category-mapping.md`:

```markdown
# 命令分类映射（C3+C8 工作文档）

| 命令名 | 当前路径 | 目标分组 | 目标路径 |
|--------|---------|---------|---------|
| clear | commands/clear/ | session | commands/session/clear/ |
| resume | commands/resume/ | session | commands/session/resume/ |
| mcp serve | commands/mcp/serve/ (如有) | mcp | commands/mcp/serve/ |
...
```

完成 144 行映射。

- [ ] **Step 4: Commit（工作文档）**

```bash
git add docs/superpowers/refactor-assets/command-category-mapping.md
git commit -m "docs: C3+C8 - 144 命令分组映射工作文档"
```

---

## Task 4: 批量 git mv 命令到分组

**Files:** 移动 144 个目录

- [ ] **Step 1: 写移动脚本**

由于 144 个 `git mv` 命令繁多，写一个 bash 脚本批量执行。基于 Task 3 的映射表：

```bash
#!/bin/bash
# scripts/refactor/move-commands.sh
set -e

cd /Users/konghayao/code/ai/claude-code/src/commands

# session 分组
for cmd in clear resume rewind fork rename tag compact export backfill-sessions; do
  [ -d "$cmd" ] && git mv "$cmd" "session/$cmd"
done

# mcp 分组（原 commands/mcp-* 平铺）
for cmd in mcp-serve mcp-add mcp-remove mcp-list; do
  [ -d "$cmd" ] && git mv "$cmd" "mcp/${cmd#mcp-}"
done
# 如果 mcp 是单个命令目录，特殊处理
[ -d "serve" ] && git mv "serve" "mcp/serve"

# model 分组
for cmd in model login logout provider fast effort; do
  [ -d "$cmd" ] && git mv "$cmd" "model/$cmd"
done

# config 分组
for cmd in config permissions hooks keybindings theme vim; do
  [ -d "$cmd" ] && git mv "$cmd" "config/$cmd"
done

# memory / skills / plugins / tasks / ui / debug / review / version / files / bridge / daemon
# ...（按 Task 3 映射表继续）

# session-info 移到 ui
[ -d "session-info" ] && git mv "session-info" "ui/session-info"

echo "Move complete"
```

- [ ] **Step 2: 执行移动脚本**

Run:
```bash
bash scripts/refactor/move-commands.sh 2>&1 | tail -10
```

Expected: "Move complete"。如有 "destination already exists" 错误，手动处理冲突。

- [ ] **Step 3: 验证移动结果**

Run:
```bash
ls -d src/commands/*/ | wc -l
ls src/commands/session/ 2>&1
ls src/commands/mcp/ 2>&1
```

Expected: 顶层目录数显著减少（只剩分组目录 + `_registry` + `_shared` + `_misc` + 少量未分类）。

- [ ] **Step 4: 处理未分类（_misc 兜底）**

Run:
```bash
cd src/commands
for d in */; do
  d="${d%/}"
  case "$d" in
    _registry|_shared|_misc|session|mcp|model|config|memory|skills|plugins|tasks|ui|debug|review|version|files|bridge|daemon) ;;
    *) echo "未分类: $d"; git mv "$d" "_misc/$d" ;;
  esac
done
```

Expected: 所有平铺命令已归类。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: C3+C8 - 批量 git mv 144 命令到主题分组（保留 blame）"
```

---

## Task 5: 改写每个 index.ts 为 CommandSpec 形态

**Files:** 修改 144 个 `index.ts`

- [ ] **Step 1: 写一个 index.ts 转换辅助脚本**

由于 144 个 index.ts 需要改写，写一个生成模板的脚本：

```bash
#!/bin/bash
# scripts/refactor/rewrite-command-index.sh
# 对每个 commands/<category>/<name>/index.ts，注入 CommandSpec 标注

# 模板：
# import type { CommandSpec } from '../../../_registry/types.js'
# const cmd = { ...原内容, visibility: 'public', safety: 'restricted' } satisfies CommandSpec
# export default cmd
```

- [ ] **Step 2: 对 session/clear 做示范改写**

Edit `src/commands/session/clear/index.ts`:

```ts
import type { CommandSpec } from '../../../_registry/types.js'

const clear = {
  type: 'local',
  name: 'clear',
  description: 'Clear conversation history and free up context',
  aliases: ['reset', 'new'],
  isEnabled: true,
  supportsNonInteractive: false,
  load: () => import('./clear.js'),
  visibility: 'public',
  safety: 'restricted',
} satisfies CommandSpec

export default clear
```

**注意：** 原文件可能有更多字段（如 `userFacingName`），全部保留。只新增 `visibility` / `safety`。

- [ ] **Step 3: 批量改写其余 143 个**

对每个命令目录的 `index.ts`：
1. 在文件顶部加 `import type { CommandSpec } from '../../../_registry/types.js'`（层数根据分组深度：3 层 `../../../`）
2. 在 default export 对象末尾加 `visibility: 'public'`（或根据原 commands.ts 的 INTERNAL_ONLY / REMOTE_SAFE 标注）
3. 加 `satisfies CommandSpec`

**从 commands.ts 提取 visibility/safety 信息：**

```bash
grep -E 'INTERNAL_ONLY|REMOTE_SAFE|BRIDGE_SAFE' src/commands.ts | head -50
```

把对应命令的 `visibility` 改为 `'internal'` / `safety` 改为 `'remote-safe'` / `'bridge-safe'`。

- [ ] **Step 4: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit 2>&1 | grep "commands/" | head -30
```

Expected: 零错误。如有 "Object literal may only specify known properties"，检查 `CommandSpec extends Command` 是否涵盖原字段；若 Command 类型不含某字段，改用类型断言。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: C3+C8 - 改写 144 个 index.ts 为 CommandSpec 形态（visibility/safety 自声明）"
```

---

## Task 6: 创建 registry.ts + 首次生成 generated.ts

**Files:**
- Create: `src/commands/_registry/registry.ts`、`generated.ts`

- [ ] **Step 1: 写 registry.ts**

```ts
// src/commands/_registry/registry.ts
import { REGISTERED_COMMANDS } from './generated.js'
import type { Command, RegisteredCommand, CommandVisibility, CommandSafety } from './types.js'

function meetsVisibility(spec: RegisteredCommand, userType: string): boolean {
  if (spec.visibility === 'internal') return userType === 'ant'
  if (spec.visibility === 'feature-gated') {
    return spec.featureGate ? true : false  // 简化：实际检查 feature()
  }
  return true
}

function meetsSafety(spec: RegisteredCommand, required: CommandSafety): boolean {
  if (required === 'remote-safe') return spec.safety === 'remote-safe'
  if (required === 'bridge-safe') return spec.safety === 'bridge-safe'
  return true
}

export function getCommands(
  cwd: string,
  options: { userType?: string; requiredSafety?: CommandSafety } = {},
): Command[] {
  return REGISTERED_COMMANDS
    .filter(spec => meetsVisibility(spec, options.userType ?? process.env.USER_TYPE ?? 'external'))
    .filter(spec => options.requiredSafety ? meetsSafety(spec, options.requiredSafety) : true)
}

export function findCommand(
  name: string,
  cmds: Command[] = getCommands(process.cwd()),
): Command | undefined {
  return cmds.find(c => c.name === name || c.aliases?.includes(name))
}

export { REGISTERED_COMMANDS }
```

- [ ] **Step 2: 手动首次生成 generated.ts**

由于 build.ts 集成在 P4 已完成，直接运行 scanner：

Run:
```bash
bun -e "
import { scanCommands, generateRegistryCode } from './src/commands/_registry/scanner.ts'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
const commands = scanCommands(path.resolve('src'))
console.log('Scanned', commands.length, 'commands')
const code = generateRegistryCode(commands)
await mkdir(path.resolve('src/commands/_registry'), { recursive: true })
await writeFile(path.resolve('src/commands/_registry/generated.ts'), code)
console.log('Generated.ts written')
"
```

Expected: 输出 `Scanned N commands`（N ≈ 144）和 `Generated.ts written`。

- [ ] **Step 3: 验证 generated.ts**

Run:
```bash
head -20 src/commands/_registry/generated.ts
wc -l src/commands/_registry/generated.ts
```

Expected: 含 AUTO-GENERATED 注释、import 数组、REGISTERED_COMMANDS 数组，行数 ≈ 144 * 3 = 432 行。

- [ ] **Step 4: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit src/commands/_registry/registry.ts 2>&1 | head -20
```

Expected: 零错误。如果 generated.ts 中 import 路径错误（层数不对），调整 scanner.ts 的 generateRegistryCode 的相对路径计算。

- [ ] **Step 5: Commit**

```bash
git add src/commands/_registry/registry.ts src/commands/_registry/generated.ts
git commit -m "feat: C3+C8 - 创建 registry.ts 运行时查询 + 首次生成 generated.ts"
```

---

## Task 7: 精简 commands.ts（850 → ~50 行）

**Files:**
- Modify: `src/commands.ts`

- [ ] **Step 1: 用 re-export 替代中央数组**

改写 `src/commands.ts`：

```ts
// src/commands.ts（精简后 ~50 行）
// 中央数组已由 commands/_registry/generated.ts 编译期生成替代。
// 本文件保留 re-export 供外部调用方平滑过渡。

export { getCommands, findCommand, REGISTERED_COMMANDS } from './commands/_registry/registry.js'
export type {
  CommandSpec,
  CommandCategory,
  RegisteredCommand,
  CommandVisibility,
  CommandSafety,
} from './commands/_registry/types.js'

// 兼容期：INTERNAL_ONLY_COMMANDS / REMOTE_SAFE_COMMANDS / BRIDGE_SAFE_COMMANDS
// 这些集合现在通过 RegisteredCommand 的 visibility/safety 字段推导。
import { REGISTERED_COMMANDS } from './commands/_registry/registry.js'

export const INTERNAL_ONLY_COMMANDS = new Set(
  REGISTERED_COMMANDS.filter(c => c.visibility === 'internal').map(c => c.name),
)

export const REMOTE_SAFE_COMMANDS = new Set(
  REGISTERED_COMMANDS.filter(c => c.safety === 'remote-safe').map(c => c.name),
)

export const BRIDGE_SAFE_COMMANDS = new Set(
  REGISTERED_COMMANDS.filter(c => c.safety === 'bridge-safe').map(c => c.name),
)
```

- [ ] **Step 2: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -20
```

Expected: 零错误。外部调用方 import 的 `getCommands` / `findCommand` / `INTERNAL_ONLY_COMMANDS` 等保持可用。

- [ ] **Step 3: 跑 check:unused 验证无 dead export**

Run:
```bash
bun run check:unused 2>&1 | tail -10
```

Expected: 无新增 unused warning。

- [ ] **Step 4: Commit**

```bash
git add src/commands.ts
git commit -m "refactor: C3+C8 - 精简 commands.ts 从 850 行到 ~50 行（generated.ts 替代中央数组）"
```

---

## Task 8: 全局替换命令 import 路径

**Files:** 修改所有引用 `commands/<name>/` 的文件

- [ ] **Step 1: Grep 所有引用旧路径的文件**

Use Grep tool:
- Pattern: `from '(\.\./)+commands/[a-z-]+/`
- Path: `/Users/konghayao/code/ai/claude-code/src`
- Output mode: `files_with_matches`

- [ ] **Step 2: 批量替换**

对每个文件，把旧路径 `commands/clear/` 改为 `commands/session/clear/`（按 Task 3 映射表）。例如：
- `from './commands/clear/index.js'` → `from './commands/session/clear/index.js'`
- `from '../commands/clear/clear.js'` → `from '../commands/session/clear/clear.js'`

- [ ] **Step 3: 跑 typecheck**

Run:
```bash
bunx tsc --noEmit 2>&1 | head -30
```

Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: C3+C8 - 全局替换命令 import 路径到分组结构"
```

---

## Task 9: 写冒烟集成测试

**Files:**
- Create: `tests/integration/commands-regroup.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/integration/commands-regroup.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

const SRC = path.resolve(process.cwd(), 'src/commands')

describe('C3+C8 commands regroup', () => {
  test('17 个分组目录存在', () => {
    const expected = ['session', 'mcp', 'model', 'config', 'memory', 'skills',
      'plugins', 'tasks', 'ui', 'debug', 'review', 'version', 'files',
      'bridge', 'daemon', '_misc', '_shared', '_registry', 'session-info']
    for (const cat of expected) {
      expect(existsSync(path.join(SRC, cat))).toBe(true)
    }
  })

  test('session/ 分组含 clear', () => {
    expect(existsSync(path.join(SRC, 'session/clear/index.ts'))).toBe(true)
  })

  test('generated.ts 存在且非空', () => {
    const gen = path.join(SRC, '_registry/generated.ts')
    expect(existsSync(gen)).toBe(true)
    const content = require('node:fs').readFileSync(gen, 'utf8')
    expect(content).toContain('AUTO-GENERATED')
    expect(content).toContain('REGISTERED_COMMANDS')
  })

  test('generated.ts 含至少 100 个 import', () => {
    const content = require('node:fs').readFileSync(
      path.join(SRC, '_registry/generated.ts'), 'utf8',
    )
    const importCount = (content.match(/^import cmd_/gm) || []).length
    expect(importCount).toBeGreaterThan(100)
  })

  test('registry.ts getCommands 返回数组', async () => {
    const { getCommands } = await import('../../src/commands/_registry/registry.ts')
    const cmds = getCommands(process.cwd())
    expect(Array.isArray(cmds)).toBe(true)
    expect(cmds.length).toBeGreaterThan(50)
  })

  test('findCommand 能找到 clear', async () => {
    const { findCommand } = await import('../../src/commands/_registry/registry.ts')
    const cmd = findCommand('clear')
    expect(cmd).toBeDefined()
    expect(cmd?.name).toBe('clear')
  })

  test('commands.ts 精简后 < 100 行', () => {
    const content = require('node:fs').readFileSync(
      path.resolve(process.cwd(), 'src/commands.ts'), 'utf8',
    )
    const lines = content.split('\n').length
    expect(lines).toBeLessThan(100)
  })

  test('旧平铺命令目录已清理', () => {
    const entries = readdirSync(SRC, { withFileTypes: true })
    const flatCmds = entries.filter(e =>
      e.isDirectory() &&
      !e.name.startsWith('_') &&
      !['session', 'mcp', 'model', 'config', 'memory', 'skills', 'plugins',
        'tasks', 'ui', 'debug', 'review', 'version', 'files', 'bridge',
        'daemon'].includes(e.name),
    )
    // 允许少量过渡文件，但应趋近 0
    expect(flatCmds.length).toBeLessThan(5)
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/commands-regroup.test.ts
```

Expected: 8 tests pass。

- [ ] **Step 3: Commit**

```bash
git add tests/integration/commands-regroup.test.ts
git commit -m "test: C3+C8 - 命令分组与 generated.ts 启用冒烟测试"
```

---

## Task 10: 跑 precheck + build + dev 验证

**Files:** 无修改

- [ ] **Step 1: 跑 precheck**

Run:
```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 2: 跑 build 验证**

Run:
```bash
bun run build 2>&1 | tail -5
```

Expected: 构建成功。如果 Bun.build 报 "module not found"，检查 generated.ts 中 import 路径。

- [ ] **Step 3: 验证 dev mode 自动重新生成 generated.ts**

Run:
```bash
bun run dev --version 2>&1 | head -5
```

Expected: dev mode 启动时 scanner 重新生成 generated.ts（P4 集成），版本号输出正常。

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore: C3+C8 完成 - 144 命令分组 + generated.ts 启用"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| 144 git mv 中遗漏命令 | 中 | Task 4 Step 4 的 `_misc` 兜底；Task 9 测试验证 |
| index.ts 改写丢失原字段 | 高 | Task 5 Step 2 示范保留原字段；tsc 强制检查 |
| generated.ts 路径层数错误 | 高 | Task 6 Step 4 typecheck；build 验证 |
| commands.ts 精简破坏外部依赖 | 中 | Task 7 保留 re-export 兼容；check:unused 验证 |
| CommandSpec 类型与原 Command 冲突 | 中 | CommandSpec extends Command，新字段全 optional |
| 构建产物中命令缺失 | 极高 | Task 10 Step 2 build 验证 + Step 3 dev 验证 |

---

## Workflow Adaptation

- **PR ID:** C3+C8（合并）
- **依赖:** C1（H6 修正：原 C3→C1 虚假依赖已移除，但实际仍需工具系统稳定）
- **被依赖:** C4（cli/program 引用 registry）、C5（subcommands）
- **推荐 maxConcurrency:** 1（机械搬移 + 路径改写必须串行）
- **建议 phases:**
  1. `Rename` — M5 session→session-info（Task 1）
  2. `Skeleton` — 创建分组目录（Task 2）
  3. `Mapping` — 分类映射表（Task 3）
  4. `Move` — 批量 git mv（Task 4）
  5. `Rewrite` — index.ts CommandSpec 化（Task 5）
  6. `Generate` — registry.ts + generated.ts（Task 6）
  7. `Slim` — 精简 commands.ts（Task 7）
  8. `Rewire` — 全局 import 替换（Task 8）
  9. `Test` — 冒烟测试（Task 9）
  10. `Verify` — precheck + build + dev（Task 10）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      sessionRenamed: { type: 'boolean' },
      categoriesCreated: { type: 'boolean' },
      commandsMoved: { type: 'boolean' },
      indexRewritten: { type: 'boolean' },
      generatedTsCreated: { type: 'boolean' },
      commandsTsSlimmed: { type: 'boolean' },
      importPathsRewired: { type: 'boolean' },
      unitTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      buildPass: { type: 'boolean' },
      devGeneratesRegistry: { type: 'boolean' },
      commandCount: { type: 'number' }
    },
    required: ['commandsMoved', 'generatedTsCreated', 'precheckPass', 'buildPass']
  }
  ```
- **可并行点:** Task 3（映射表分析）可拆给多个 subagent 并行处理不同命令子集；Task 5（index.ts 改写）也可按分组并行。其余串行。
- **Plan B 触发条件:** 若 generated.ts 在 Bun.build 中 import 失败（路径解析问题），回退到 P2 scanner.ts 的 `generateRegistryCode` 函数调试；若 24 小时无解，临时保留 commands.ts 中央数组，generated.ts 仅用于开发期验证，C3+C8 部分降级。

---

**本 plan 实现 v2 spec §4（命令注册机制 F1/M4/M5）+ §9.2 H8（C3+C8 合并）+ §11 H8。**
