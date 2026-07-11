# P2: registry types + scanner 脚本

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 `src/commands/_registry/types.ts`（CommandSpec 类型 + CommandCategory）和 `src/commands/_registry/scanner.ts`（编译期扫描脚本，输出 `generated.ts` 内容）。本期**只创建模块**，不改业务代码——build.ts 集成留到 P4。

**Architecture:** scanner.ts 是纯函数模块，导出 `scanCommands(srcRoot)` 和 `generateRegistryCode(commands)` 两个 API。两者都被 P4 的 build.ts 集成调用。类型扩展保证向后兼容（`CommandSpec extends Command`，新字段全 optional）。

**Tech Stack:** TypeScript + Node.js `fs.globSync`（Node 22+ / Bun 内置）。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `src/commands/_registry/types.ts` | 新建：CommandSpec / CommandCategory / CommandVisibility / CommandSafety / RegisteredCommand |
| `src/commands/_registry/scanner.ts` | 新建：scanCommands + generateRegistryCode 纯函数 |
| `src/commands/_registry/__tests__/scanner.test.ts` | 新建：scanner 单测 |

---

## Task 1: 创建 types.ts

**Files:**
- Create: `src/commands/_registry/types.ts`

- [ ] **Step 1: 创建目录**

Run:
```bash
mkdir -p src/commands/_registry/__tests__
```

- [ ] **Step 2: 写 types.ts**

Create `src/commands/_registry/types.ts`:

```ts
import type { Command } from '../../../types/command.js'

/**
 * 命令主题分组。由 scanner 从目录路径推导（M4 修正：不在 CommandSpec 中重复声明）。
 *
 * 命令目录路径必须匹配 commands/<category>/<name>/index.ts。
 */
export type CommandCategory =
  | 'session-info'  // 原 commands/session/，M5 重命名
  | 'session'       // 会话生命周期：clear/resume/rewind/fork/rename/tag/compact/export
  | 'mcp'           // MCP 子系统：serve/add/remove/list
  | 'model'         // 模型与 provider：model/login/logout/provider/fast/effort
  | 'config'        // 配置与权限：config/permissions/hooks/keybindings/theme/vim
  | 'memory'        // 记忆系统：memory/local-memory/memory-stores
  | 'skills'        // 技能：skills/skill-search/skill-store/skill-learning
  | 'plugins'       // 插件：plugin/reload-plugins/install-*
  | 'tasks'         // 任务与调度：tasks/agents/job/schedule
  | 'ui'            // UI 控制：color/statusline/tui
  | 'debug'         // 调试：doctor/debug-tool-call/perf-issue/heapdump/env
  | 'review'        // 代码审查：review/security-review/autofix-pr/pr_comments
  | 'version'       // 版本：version/upgrade/release-notes
  | 'files'         // 文件操作：files/diff/add-dir/copy
  | 'bridge'        // Bridge/RCS：bridge/remoteControlServer/remote-env/remote-setup
  | 'daemon'        // 守护进程：daemon/attach/detach/status
  | '_misc'         // 临时归桶，目标趋近于空

/**
 * 命令可见性——取代当前 commands.ts 顶部的多个数组。
 */
export type CommandVisibility =
  | 'public'          // 普通用户可见（默认）
  | 'internal'        // 仅 USER_TYPE=ant 可见（取代 INTERNAL_ONLY_COMMANDS）
  | 'feature-gated'   // 由 feature flag 控制（featureGate 字段必填）

/**
 * 命令安全级别——取代 REMOTE_SAFE_COMMANDS / BRIDGE_SAFE_COMMANDS。
 */
export type CommandSafety =
  | 'remote-safe'     // 取代 REMOTE_SAFE_COMMANDS
  | 'bridge-safe'     // 取代 BRIDGE_SAFE_COMMANDS
  | 'restricted'      // 默认

/**
 * 命令 spec——在现有 Command 类型基础上扩展。
 * 所有新字段 optional，向后兼容。
 */
export interface CommandSpec extends Command {
  /**
   * 命令可见性。默认 'public'。
   * - 'internal' 替代原 INTERNAL_ONLY_COMMANDS 集合
   * - 'feature-gated' 必须填 featureGate
   */
  visibility?: CommandVisibility

  /**
   * 命令安全级别。默认 'restricted'。
   * - 'remote-safe' 替代原 REMOTE_SAFE_COMMANDS
   * - 'bridge-safe' 替代原 BRIDGE_SAFE_COMMANDS
   */
  safety?: CommandSafety

  /**
   * visibility='feature-gated' 时必填。
   * flag 名必须存在于 scripts/defines.ts 的 DEFAULT_BUILD_FEATURES。
   */
  featureGate?: string
}

/**
 * 扫描器注入的最终形态——运行时由 generated.ts 提供。
 * 业务代码不直接创建此类型，只消费。
 */
export interface RegisteredCommand extends CommandSpec {
  /**
   * 主题分组——由 scanner 从目录路径推导（M4 修正）。
   */
  category: CommandCategory

  /**
   * 源文件相对路径，例如 'commands/session/clear/index.ts'。
   * 用于调试和错误信息。
   */
  sourcePath: string
}
```

- [ ] **Step 3: 验证类型可被 import**

Run:
```bash
bunx tsc --noEmit src/commands/_registry/types.ts 2>&1 | head -20
```

Expected: 零错误。如果报 `Cannot find module '../../../types/command.js'`，确认路径（`src/commands/_registry/types.ts` → `src/types/command.ts` 是 3 层 `../`）。

- [ ] **Step 4: Commit**

```bash
git add src/commands/_registry/types.ts
git commit -m "feat: 添加 commands/_registry CommandSpec 类型定义"
```

---

## Task 2: 创建 scanner.ts

**Files:**
- Create: `src/commands/_registry/scanner.ts`

- [ ] **Step 1: 写 scanner.ts**

Create `src/commands/_registry/scanner.ts`:

```ts
import { globSync } from 'node:fs'
import path from 'node:path'
import type { CommandCategory } from './types.js'

const COMMAND_GLOB = 'commands/*/*/index.ts'

/**
 * 扫描结果——单个命令的路径元数据。
 */
export interface ScannedCommand {
  /** 主题分组（从路径推导）。 */
  category: string
  /** 命令名（从路径推导）。 */
  name: string
  /** 相对路径，例如 'commands/session/clear/index.ts'。 */
  relativePath: string
}

const VALID_CATEGORIES: ReadonlySet<string> = new Set<CommandCategory>([
  'session-info', 'session', 'mcp', 'model', 'config', 'memory',
  'skills', 'plugins', 'tasks', 'ui', 'debug', 'review',
  'version', 'files', 'bridge', 'daemon', '_misc',
])

/**
 * 扫描 srcRoot/commands/<category>/<name>/index.ts。
 * 同时被 dev mode 和 build.ts 调用。
 *
 * 校验：
 * 1. 路径必须匹配 commands/<category>/<name>/index.ts
 * 2. <category> 必须是 CommandCategory 联合类型之一
 *
 * @throws 如果路径格式不符或 category 非法
 */
export function scanCommands(srcRoot: string): ScannedCommand[] {
  const files = globSync(COMMAND_GLOB, { cwd: srcRoot })
  return files.map(file => {
    // commands/<category>/<name>/index.ts
    const parts = file.split('/')
    if (parts.length !== 4 || parts[3] !== 'index.ts') {
      throw new Error(`Unexpected command path: ${file} (expected commands/<category>/<name>/index.ts)`)
    }
    const [, category, name] = parts
    if (!VALID_CATEGORIES.has(category)) {
      throw new Error(`Unknown command category: '${category}' in ${file}. Add to CommandCategory union in types.ts or rename the directory.`)
    }
    return {
      category,
      name,
      relativePath: file.replace(/\.ts$/, '.js'),
    }
  })
}

/**
 * 把扫描结果中的特殊字符替换为合法 JS 标识符。
 */
function sanitizeIdentifier(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '_')
}

/**
 * 生成 generated.ts 内容。
 * 输出格式：纯静态 import + 数组，tsc 可类型检查，Bun.build 可正确打包。
 *
 * @param commands 扫描结果
 * @returns generated.ts 文件内容字符串
 */
export function generateRegistryCode(commands: ScannedCommand[]): string {
  const imports = commands
    .map(c => {
      const ident = `cmd_${sanitizeIdentifier(c.category)}_${sanitizeIdentifier(c.name)}`
      // generated.ts 位于 src/commands/_registry/generated.ts
      // 相对 import 路径：../../<relativePath>
      return `import ${ident} from '../../${c.relativePath}'`
    })
    .join('\n')

  const entries = commands
    .map(c => {
      const ident = `cmd_${sanitizeIdentifier(c.category)}_${sanitizeIdentifier(c.name)}`
      return `  { ...${ident}, category: '${c.category}', sourcePath: '${c.relativePath}' }`
    })
    .join(',\n')

  return `// AUTO-GENERATED by scanner.ts — DO NOT EDIT
// Regenerated on every 'bun run dev' and 'bun run build'.
import type { RegisteredCommand } from './types.js'

${imports}

export const REGISTERED_COMMANDS: RegisteredCommand[] = [
${entries}
]
`
}
```

- [ ] **Step 2: 验证 TypeScript 解析**

Run:
```bash
bunx tsc --noEmit src/commands/_registry/scanner.ts 2>&1 | head -20
```

Expected: 零错误。

- [ ] **Step 3: Commit**

```bash
git add src/commands/_registry/scanner.ts
git commit -m "feat: 添加 commands/_registry scanner 编译期扫描脚本"
```

---

## Task 3: 写 scanner 单测

**Files:**
- Create: `src/commands/_registry/__tests__/scanner.test.ts`

- [ ] **Step 1: 写测试**

Create `src/commands/_registry/__tests__/scanner.test.ts`:

```ts
import { describe, test, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

import { scanCommands, generateRegistryCode } from '../scanner.js'

describe('scanner', () => {
  let tempRoot: string

  beforeEach(() => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'))
  })

  afterEach(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  describe('scanCommands', () => {
    test('空目录返回空数组', () => {
      const result = scanCommands(tempRoot)
      expect(result).toEqual([])
    })

    test('扫描单个命令', () => {
      mkdirSync(path.join(tempRoot, 'commands', 'session', 'clear'), { recursive: true })
      writeFileSync(
        path.join(tempRoot, 'commands', 'session', 'clear', 'index.ts'),
        'export default {}',
      )
      const result = scanCommands(tempRoot)
      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        category: 'session',
        name: 'clear',
        relativePath: 'commands/session/clear/index.js',
      })
    })

    test('扫描多个命令', () => {
      for (const [cat, name] of [['session', 'clear'], ['mcp', 'serve'], ['review', 'pr']]) {
        mkdirSync(path.join(tempRoot, 'commands', cat, name as string), { recursive: true })
        writeFileSync(
          path.join(tempRoot, 'commands', cat, name as string, 'index.ts'),
          'export default {}',
        )
      }
      const result = scanCommands(tempRoot)
      expect(result).toHaveLength(3)
    })

    test('非法 category 抛错', () => {
      mkdirSync(path.join(tempRoot, 'commands', 'INVALID_CATEGORY', 'foo'), { recursive: true })
      writeFileSync(
        path.join(tempRoot, 'commands', 'INVALID_CATEGORY', 'foo', 'index.ts'),
        'export default {}',
      )
      expect(() => scanCommands(tempRoot)).toThrow(/Unknown command category/)
    })

    test('深度错误的路径抛错', () => {
      // commands/clear/index.ts（少一层 category）
      mkdirSync(path.join(tempRoot, 'commands', 'clear'), { recursive: true })
      writeFileSync(path.join(tempRoot, 'commands', 'clear', 'index.ts'), 'export default {}')
      expect(() => scanCommands(tempRoot)).not.toThrow()  // 此格式不匹配 GLOB，所以不抛错
      expect(scanCommands(tempRoot)).toEqual([])
    })
  })

  describe('generateRegistryCode', () => {
    test('空输入生成有效 TypeScript', () => {
      const code = generateRegistryCode([])
      expect(code).toContain('AUTO-GENERATED')
      expect(code).toContain('REGISTERED_COMMANDS: RegisteredCommand[] = []')
    })

    test('生成 import 语句', () => {
      const code = generateRegistryCode([
        { category: 'session', name: 'clear', relativePath: 'commands/session/clear/index.js' },
      ])
      expect(code).toContain("import cmd_session_clear from '../../commands/session/clear/index.js'")
      expect(code).toContain('...cmd_session_clear')
      expect(code).toContain("category: 'session'")
      expect(code).toContain("sourcePath: 'commands/session/clear/index.js'")
    })

    test('特殊字符的命令名被 sanitize', () => {
      const code = generateRegistryCode([
        { category: 'mcp', name: 'add-from-claude-desktop', relativePath: 'commands/mcp/add-from-claude-desktop/index.js' },
      ])
      expect(code).toContain('cmd_mcp_add_from_claude_desktop')
    })

    test('生成的代码语法有效（eval 检查）', () => {
      const code = generateRegistryCode([
        { category: 'session', name: 'clear', relativePath: 'commands/session/clear/index.js' },
      ])
      // 简单的语法检查：能被 new Function 解析（不执行）
      // 去掉 import 和 export，只验证表达式部分
      const stripped = code
        .replace(/import[^;]+;/g, 'var x;')
        .replace(/export /g, '')
      expect(() => new Function(stripped)).not.toThrow()
    })
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test src/commands/_registry/__tests__/scanner.test.ts
```

Expected: 8 tests pass。

- [ ] **Step 3: Commit**

```bash
git add src/commands/_registry/__tests__/scanner.test.ts
git commit -m "test: 添加 scanner 编译期扫描脚本单测"
```

---

## Task 4: 跑 precheck 验证

**Files:** 无修改

- [ ] **Step 1: 跑 precheck**

Run:
```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 2: 跑 dependency-cruiser**

Run:
```bash
bunx depcruise src --config
```

Expected: warning 数与 P0 baseline 一致（P2 没动业务代码）。

- [ ] **Step 3: Commit**

```bash
git commit --allow-empty -m "chore: P2 完成 - registry types + scanner 单测通过"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| `globSync` 在 Bun 环境行为与 Node 不一致 | 中 | 已通过单测覆盖；P4 实际跑 build 时再验证 |
| `Command` 类型与扩展字段冲突 | 低 | 新字段全 optional；如果有冲突，tsc 会立即报错 |
| 生成的 import 路径在 Bun.build 中失败 | 高 | P4 实际生成 generated.ts 后用 `bun run build` 验证 |
| 命令目录命名规则有例外（如 `commands/_shared/`） | 中 | GLOB `commands/*/*/index.ts` 要求 2 层目录，`_shared` 不匹配；C3+C8 时处理 |

---

## Workflow Adaptation

- **PR ID:** P2
- **依赖:** P0（验证 dependency-cruiser baseline）
- **被依赖:** P4（build.ts 集成 scanner）、C3+C8（启用 generated.ts）
- **推荐 maxConcurrency:** 1
- **建议 phases:**
  1. `Types` — 创建 types.ts
  2. `Scanner` — 创建 scanner.ts
  3. `Test` — 写单测
  4. `Verify` — precheck + depcruise
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      typesCreated: { type: 'boolean' },
      scannerCreated: { type: 'boolean' },
      unitTestsPass: { type: 'boolean' },
      precheckPass: { type: 'boolean' },
      scannerTestCoverage: { type: 'number' }
    },
    required: ['typesCreated', 'scannerCreated', 'unitTestsPass', 'precheckPass']
  }
  ```
- **可并行点:** P2 可与 P1 并行（都依赖 P0 但互相独立）。
- **Plan B 触发条件:** 若 `globSync` 在 Bun 完全无法用，改用 `Bun.Glob`（API 兼容）。该决策在 Task 2 Step 2 失败时触发。
