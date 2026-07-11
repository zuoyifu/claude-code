# F1: shim 残留验证 + 外部 import 清理

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在所有核心 PR（C1-C10）完成后，最终验证旧架构的 7 个上帝文件/目录已被完全删除、`src/tools/` `src/cli/` `src/query/` 已成为唯一入口、且 workspace packages（如 `packages/remote-control-server`、`packages/acp-link`、`packages/builtin-tools`）无残留 import 指向旧路径。

**Architecture:** 这是纯验证 PR——不写新业务代码，只做：(1) 用 `bun run check:unused` 验证旧文件已删除；(2) 全项目 grep 残留 import；(3) 若发现残留，在同 PR 修复；(4) 补一个端到端冒烟集成测试断言旧路径不存在。

**Tech Stack:** Bun + grep (ripgrep) + knip-bun + bun:test。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `tests/integration/no-legacy-paths.test.ts` | 新建：断言旧路径文件不存在 + 无残留 import |
| `packages/*/src/**/*.ts` | 按需修复：若发现 import 旧路径，改为新路径 |
| `src/**/*.ts` / `src/**/*.tsx` | 按需修复：若发现 import 旧路径，改为新路径 |

---

## Task 1: 确认旧文件已删除

**Files:** 无修改

- [ ] **Step 1: 验证 7 个旧上帝文件/目录已删除**

Run:
```bash
for f in \
  src/Tool.ts \
  src/tools.ts \
  src/constants/tools.ts \
  src/query.ts \
  src/QueryEngine.ts \
  src/main.tsx \
  src/commands.ts; do
  if [ -f "$f" ]; then
    echo "STILL_EXISTS: $f"
    exit 1
  else
    echo "DELETED_OK: $f"
  fi
done
```

Expected:
```
DELETED_OK: src/Tool.ts
DELETED_OK: src/tools.ts
DELETED_OK: src/constants/tools.ts
DELETED_OK: src/query.ts
DELETED_OK: src/QueryEngine.ts
DELETED_OK: src/main.tsx
DELETED_OK: src/commands.ts
```

如果任何文件输出 `STILL_EXISTS`，说明对应核心 PR（C1/C7/C9/C10/C3+C8）未完成——**立即停止 F1**，回到对应 PR 修复。

- [ ] **Step 2: 验证旧 services/tools/ 和 services/searchExtraTools/ 已迁出**

Run:
```bash
for d in \
  src/services/tools \
  src/services/searchExtraTools; do
  if [ -d "$d" ]; then
    echo "STILL_EXISTS: $d/"
    ls "$d" | head -5
    exit 1
  else
    echo "DELETED_OK: $d/"
  fi
done
```

Expected:
```
DELETED_OK: src/services/tools/
DELETED_OK: src/services/searchExtraTools/
```

- [ ] **Step 3: 验证新目录结构存在**

Run:
```bash
for d in \
  src/tools/core \
  src/tools/registry \
  src/tools/execution \
  src/tools/discovery \
  src/cli/program \
  src/cli/dispatcher \
  src/cli/bootstrap \
  src/cli/subcommands \
  src/cli/fast-paths.ts \
  src/commands/_registry \
  src/query/api.ts \
  src/query/loop \
  src/query/engine; do
  if [ -e "$d" ]; then
    echo "EXISTS_OK: $d"
  else
    echo "MISSING: $d"
    exit 1
  fi
done
```

Expected: 全部输出 `EXISTS_OK`，无 `MISSING`。

---

## Task 2: 全项目 grep 残留 import

**Files:** 按需修改

- [ ] **Step 1: 在 src/ 中搜索旧路径 import**

Run:
```bash
rg --no-heading --line-number \
  -e 'from\s+["'\'']src/Tool["'\'']' \
  -e 'from\s+["'\'']src/Tool\.ts["'\'']' \
  -e 'from\s+["'\'']src/Tool\.js["'\'']' \
  -e 'from\s+["'\'']\.\./Tool["'\'']' \
  -e 'from\s+["'\'']\.\./Tool\.ts["'\'']' \
  -e 'from\s+["'\'']\./Tool["'\'']' \
  -e 'from\s+["'\'']src/tools["'\'']' \
  -e 'from\s+["'\'']src/tools\.ts["'\'']' \
  -e 'from\s+["'\'']src/tools\.js["'\'']' \
  -e 'from\s+["'\'']\.\./tools\.ts["'\'']' \
  -e 'from\s+["'\'']\./tools\.ts["'\'']' \
  -e 'from\s+["'\'']src/constants/tools["'\'']' \
  -e 'from\s+["'\'']src/constants/tools\.ts["'\'']' \
  -e 'from\s+["'\'']src/query\.ts["'\'']' \
  -e 'from\s+["'\'']src/query\.js["'\'']' \
  -e 'from\s+["'\'']src/QueryEngine["'\'']' \
  -e 'from\s+["'\'']src/QueryEngine\.ts["'\'']' \
  -e 'from\s+["'\'']src/main\.tsx["'\'']' \
  -e 'from\s+["'\'']src/main\.js["'\'']' \
  -e 'from\s+["'\'']src/commands\.ts["'\'']' \
  -e 'from\s+["'\'']src/commands\.js["'\'']' \
  src/ 2>&1 | tee /tmp/f1-src-grep.txt

echo "---"
echo "match count: $(wc -l < /tmp/f1-src-grep.txt)"
```

Expected: `match count: 0`。

如果非零：逐个修复，把旧路径改为新路径。常见映射表（对照 spec §3.1）：

| 旧 import | 新 import |
|----------|----------|
| `src/Tool` / `../Tool` | `src/tools/core` |
| `src/tools` / `src/tools.ts` | `src/tools/registry` |
| `src/constants/tools` | `src/tools/registry/whitelists` |
| `src/query.ts` / `src/query.js` | `src/query/api` 或 `src/query/loop` |
| `src/QueryEngine` | `src/query/engine/QueryEngine` |
| `src/main.tsx` / `src/main.js` | `src/cli/dispatcher` |
| `src/commands.ts` | `src/commands/_registry/registry` |
| `src/services/tools/*` | `src/tools/execution/*` |
| `src/services/searchExtraTools/*` | `src/tools/discovery/*` |

- [ ] **Step 2: 在 packages/ 中搜索旧路径 import**

workspace packages 可能仍 import 旧路径（`packages/remote-control-server`、`packages/acp-link`、`packages/builtin-tools` 等可能间接引用 `src/Tool` 类型）。

Run:
```bash
rg --no-heading --line-number \
  -e 'from\s+["'\''].*src/Tool' \
  -e 'from\s+["'\''].*src/tools['\.]' \
  -e 'from\s+["'\''].*src/constants/tools' \
  -e 'from\s+["'\''].*src/query\.ts' \
  -e 'from\s+["'\''].*src/QueryEngine' \
  -e 'from\s+["'\''].*src/main\.tsx' \
  -e 'from\s+["'\''].*src/commands\.ts' \
  -e 'from\s+["'\''].*src/services/tools' \
  -e 'from\s+["'\''].*src/services/searchExtraTools' \
  packages/ 2>&1 | grep -v 'node_modules' | tee /tmp/f1-pkg-grep.txt

echo "---"
echo "match count: $(wc -l < /tmp/f1-pkg-grep.txt)"
```

Expected: `match count: 0`。

如果非零：按 Step 1 的映射表修复 packages 中的 import。

- [ ] **Step 3: 在 scripts/ 和 tests/ 中搜索旧路径 import**

Run:
```bash
rg --no-heading --line-number \
  -e 'from\s+["'\''].*src/Tool' \
  -e 'from\s+["'\''].*src/tools['\.]' \
  -e 'from\s+["'\''].*src/constants/tools' \
  -e 'from\s+["'\''].*src/query\.ts' \
  -e 'from\s+["'\''].*src/QueryEngine' \
  -e 'from\s+["'\''].*src/main\.tsx' \
  -e 'from\s+["'\''].*src/commands\.ts' \
  scripts/ tests/ 2>&1 | tee /tmp/f1-scripts-grep.txt

echo "---"
echo "match count: $(wc -l < /tmp/f1-scripts-grep.txt)"
```

Expected: `match count: 0`。

- [ ] **Step 4: 如果前面任何 step 修改了文件，跑 precheck**

```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 5: Commit（仅当有修改时）**

```bash
git add -A
git commit -m "refactor: 清理 F1 残留旧路径 import（架构迁移收尾）"
```

如果前面所有 step match count 都是 0，跳过此 commit（无 diff）。

---

## Task 3: 用 bun run check:unused 验证无悬空导出

**Files:** 无修改

- [ ] **Step 1: 运行 knip 检查未使用导出**

Run:
```bash
bun run check:unused 2>&1 | tee /tmp/f1-knip.txt
echo "---"
echo "exit code: $?"
```

Expected: 退出码 0，输出 "No issues found" 或类似无问题信息。

如果报告 issues：逐条审查。常见情况：
- 旧 shim 的 re-export（如某文件 `export * from './Tool'`）：删除该 export 行。
- 新目录中未接入 registry 的工具：补到 `src/tools/builtin/index.ts`。
- 旧测试文件引用已删除模块：删除或更新该测试。

- [ ] **Step 2: 如有 knip 报告，修复后重跑**

```bash
bun run check:unused
```

Expected: 退出码 0。

- [ ] **Step 3: Commit（仅当有修改时）**

```bash
git add -A
git commit -m "chore: F1 修复 knip 报告的未使用导出"
```

---

## Task 4: 写端到端冒烟测试

**Files:**
- Create: `tests/integration/no-legacy-paths.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/integration/no-legacy-paths.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

const REPO_ROOT = path.resolve(process.cwd())

describe('F1: 旧架构路径已完全清理', () => {
  describe('旧上帝文件已删除', () => {
    const legacyFiles = [
      'src/Tool.ts',
      'src/tools.ts',
      'src/constants/tools.ts',
      'src/query.ts',
      'src/QueryEngine.ts',
      'src/main.tsx',
      'src/commands.ts',
    ]

    for (const file of legacyFiles) {
      test(`${file} 不存在`, () => {
        const fullPath = path.resolve(REPO_ROOT, file)
        expect(existsSync(fullPath)).toBe(false)
      })
    }
  })

  describe('旧服务目录已迁出', () => {
    const legacyDirs = [
      'src/services/tools',
      'src/services/searchExtraTools',
    ]

    for (const dir of legacyDirs) {
      test(`${dir}/ 不存在`, () => {
        const fullPath = path.resolve(REPO_ROOT, dir)
        expect(existsSync(fullPath)).toBe(false)
      })
    }
  })

  describe('新架构目录已建立', () => {
    const newPaths = [
      'src/tools/core',
      'src/tools/registry',
      'src/tools/execution',
      'src/cli/program',
      'src/cli/dispatcher',
      'src/cli/bootstrap',
      'src/commands/_registry',
      'src/query/loop',
      'src/query/engine',
    ]

    for (const p of newPaths) {
      test(`${p} 存在`, () => {
        const fullPath = path.resolve(REPO_ROOT, p)
        expect(existsSync(fullPath)).toBe(true)
      })
    }
  })

  describe('源码无残留旧路径 import', () => {
    test('rg 搜索 src/ + packages/ + scripts/ + tests/ 返回 0 匹配', () => {
      // 用 ripgrep 搜索旧路径 import，若 rg 不可用降级到 git grep
      const pattern = [
        'src/Tool[\\\'"]',
        'src/tools[\\\'\\.ts]',
        'src/constants/tools',
        'src/query\\.ts',
        'src/QueryEngine',
        'src/main\\.tsx',
        'src/commands\\.ts',
        'src/services/tools',
        'src/services/searchExtraTools',
      ].join('|')

      let output: string
      try {
        output = execSync(
          `rg --no-heading --count-matches -e '${pattern}' src/ packages/ scripts/ tests/ 2>&1 || true`,
          { cwd: REPO_ROOT },
        ).toString()
      } catch {
        // rg 找不到匹配会退出码 1，输出为空
        output = ''
      }

      // 过滤 node_modules 噪音（若 rg 配置未排除）
      const lines = output
        .split('\n')
        .filter((l) => l.trim().length > 0)
        .filter((l) => !l.includes('node_modules'))
        .filter((l) => !l.includes('dist/'))

      expect(lines).toEqual([])
    })
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/no-legacy-paths.test.ts
```

Expected: 全部测试 pass（约 20+ 个 test）。

- [ ] **Step 3: 跑全量 precheck**

Run:
```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add tests/integration/no-legacy-paths.test.ts
git commit -m "test: F1 添加旧架构路径清理的端到端冒烟测试"
```

---

## Task 5: 最终构建验证

**Files:** 无修改

- [ ] **Step 1: 跑 Bun build**

```bash
bun run build
```

Expected: 构建成功，`dist/cli.js` 生成。

- [ ] **Step 2: 跑 Vite build**

```bash
bun run build:vite
```

Expected: 构建成功，`dist/chunks/` 下生成 chunk 文件。

- [ ] **Step 3: 跑 --version 快速路径验证入口未破坏**

```bash
node dist/cli.js --version
```

Expected: 输出 Claude Code 版本号（当前 `2.8.3` 对应 MACRO，实际版本号取决于 `scripts/defines.ts`）。

- [ ] **Step 4: 跑 dependency-cruiser（应为零警告或仅 P0 baseline 剩余）**

```bash
bunx depcruise src --config
```

Expected: 无 warning（所有 v2 规则都已满足）。如果有 warning，记录到 F4 Plan B 备选方案——**不阻塞 F1 合并**。

- [ ] **Step 5: Commit（空 commit 标记 F1 完成）**

```bash
git commit --allow-empty -m "chore: F1 完成 - 旧架构路径清理验证通过"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| packages/ 中仍有 import 旧路径（packages/remote-control-server 是独立服务，可能间接引用 src/） | 高 | Task 2 Step 2 全文 grep 覆盖；如发现，按映射表替换；类型引用改为 `import type` 从 `tools/core` |
| knip 误报新增目录中的未使用 export | 中 | Task 3 审查每条 knip 输出，区分"真正未接入"vs"测试保留" |
| rg 不可用（CI 环境） | 低 | Task 4 测试代码已加 try/catch 降级；CI 跑 knip 代替 |
| 核心某 PR 漏删 shim 文件 | 高 | Task 1 Step 1+2 验证；若发现漏删，停止 F1 并回该 PR 修复 |
| ripgrep 模式过严漏报（如 `.js` 扩展名变体） | 中 | 模式覆盖 `.ts` / `.js` / 无扩展名三种；Task 4 集成测试补充 |

---

## Workflow Adaptation

- **PR ID:** F1
- **依赖:** C1、C2、C3+C8、C4、C5、C6、C7、C9、C10（所有核心 PR 必须完成）
- **被依赖:** F2、F3、F4（收尾链 F1→F2→F3→F4 严格串行）
- **推荐 maxConcurrency:** 1（纯验证 PR，不可并行）
- **建议 phases:**
  1. `Verify-Deleted` — 确认旧文件/目录已删除（Task 1）
  2. `Grep-Residual` — 全项目 grep 残留 import（Task 2）
  3. `Knip` — knip 检查未使用导出（Task 3）
  4. `Test` — 写冒烟测试（Task 4）
  5. `Build` — 最终构建验证（Task 5）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      legacyFilesDeleted: { type: 'boolean' },
      legacyDirsDeleted: { type: 'boolean' },
      newDirsExist: { type: 'boolean' },
      srcGrepClean: { type: 'boolean' },
      packagesGrepClean: { type: 'boolean' },
      knipPasses: { type: 'boolean' },
      smokeTestPasses: { type: 'boolean' },
      buildPasses: { type: 'boolean' },
      precheckPasses: { type: 'boolean' }
    },
    required: [
      'legacyFilesDeleted', 'legacyDirsDeleted', 'newDirsExist',
      'srcGrepClean', 'packagesGrepClean', 'knipPasses',
      'smokeTestPasses', 'buildPasses', 'precheckPasses'
    ]
  }
  ```
- **可并行点:** 无。F1 是收尾链起点，内部串行执行。
- **Plan B 触发条件:**
  1. 若 Task 1 发现旧文件未删除（核心 PR 未完成）：立即停止 F1，回到对应核心 PR 修复，F1 延后。
  2. 若 Task 2 发现 packages/ 大面积残留 import（>20 处）：单独拆出 PR 处理 packages 修复，F1 主体继续验证 src/。
  3. 若 Task 5 Step 4 dependency-cruiser 仍报 warning：不阻塞 F1，记录到 F4 处理（F4 本就是收紧 dep-cruiser）。

---

**本 plan 实现 v2 spec §9.3（F1 条目）+ §11.1（回滚预案：F1 前用 check:unused + grep 验证）。**
