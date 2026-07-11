# F2: tsconfig.json 过时配置清理

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 F1 验证旧文件已完全删除后，清理 `tsconfig.json` 和 `tsconfig.base.json` 中因架构迁移而过时的配置——主要是 `paths` 别名中指向已删除文件的条目，以及 `include` / `exclude` 未反映新结构的情况。保证 `bun run typecheck` 和 `bun run precheck` 零错误。

**Architecture:** 纯配置 PR——只动 `tsconfig.json`、`tsconfig.base.json`，不动业务代码。所有变更必须通过 tsc 验证。

**Tech Stack:** TypeScript 5 + Bun。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `tsconfig.json` | 修改：清理过时 paths / 调整 include 范围 |
| `tsconfig.base.json` | 检查：是否有过时 compilerOptions |

---

## Task 1: 审计当前 tsconfig 配置

**Files:** 无修改

- [ ] **Step 1: 读取当前 tsconfig.json**

Run:
```bash
cat tsconfig.json
```

记录当前 `paths`、`include`、`exclude` 三段。

- [ ] **Step 2: 读取 tsconfig.base.json**

Run:
```bash
cat tsconfig.base.json
```

确认 base 配置的 `compilerOptions`（target/module/moduleResolution/strict/types）。

- [ ] **Step 3: 找出所有 import 别名使用情况**

Run:
```bash
rg --no-heading --line-number \
  -e "from\s+['\"]src/" \
  -e "from\s+['\"]@claude-code-best/" \
  src/ packages/ scripts/ 2>&1 | head -40

echo "---"
echo "src/ alias usage count:"
rg -c "from\s+['\"]src/" src/ packages/ scripts/ 2>&1 | wc -l
echo "@claude-code-best/ alias usage count:"
rg -c "from\s+['\"]@claude-code-best/" src/ packages/ scripts/ 2>&1 | wc -l
```

Expected: 输出每条 alias 的使用次数。

**用途：** 如果某 alias 使用次数为 0，可考虑删除；使用次数 >0 必须保留。

- [ ] **Step 4: 检查 include/exclude 是否覆盖新目录结构**

Run:
```bash
# 验证新目录是否被 tsconfig include 匹配
for d in src/tools src/cli src/query src/commands/_registry; do
  if ls "$d"/*.ts "$d"/*.tsx 2>/dev/null | head -1 > /dev/null; then
    echo "COVERED: $d"
  else
    echo "EMPTY: $d"
  fi
done
```

Expected: 全部输出 `COVERED`（当前 tsconfig include `src/**/*.ts` + `src/**/*.tsx`，应该自动覆盖）。

---

## Task 2: 清理 paths 别名

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: 检查 paths 中是否有过时条目**

当前 tsconfig.json 的 `paths` 段（参考）：

```json
"paths": {
  "src/*": ["./src/*"],
  "@claude-code-best/builtin-tools/*": ["./packages/builtin-tools/src/*"],
  "@claude-code-best/builtin-tools": ["./packages/builtin-tools/src/index.ts"],
  "@claude-code-best/mcp-client/*": ["./packages/mcp-client/src/*"],
  "@claude-code-best/mcp-client": ["./packages/mcp-client/src/index.ts"],
  "@claude-code-best/agent-tools/*": ["./packages/agent-tools/src/*"],
  "@claude-code-best/agent-tools": ["./packages/agent-tools/src/index.ts"],
  "@claude-code-best/weixin/*": ["./packages/weixin/src/*"],
  "@claude-code-best/weixin": ["./packages/weixin/src/index.ts"],
  "@claude-code-best/workflow-engine/*": ["./packages/workflow-engine/src/*"],
  "@claude-code-best/workflow-engine": ["./packages/workflow-engine/src/index.ts"]
}
```

Run:
```bash
# 验证每个 alias 对应的物理路径还存在
for pkg in builtin-tools mcp-client agent-tools weixin workflow-engine; do
  if [ -d "packages/$pkg/src" ]; then
    echo "PKG_EXISTS: packages/$pkg/src"
  else
    echo "PKG_MISSING: packages/$pkg/src"
  fi
done
```

Expected: 全部 `PKG_EXISTS`。如果有 `PKG_MISSING`（对应包被删除），从 paths 中移除该条目。

**注意：** `src/*` 别名是整个架构迁移的基础（spec §3.1 所有新 import 都用 `src/tools/...` `src/cli/...` `src/query/...`），**必须保留**。

- [ ] **Step 2: 如有 PKG_MISSING，修改 tsconfig.json**

仅当 Step 1 报告某包不存在时执行。否则跳到 Task 3。

Modify `tsconfig.json`，删除缺失包对应的 paths 条目（包括 `pkg/*` 和 `pkg` 两行）。例如，如果 `packages/workflow-engine/` 被移除：

Before:
```json
"@claude-code-best/workflow-engine/*": ["./packages/workflow-engine/src/*"],
"@claude-code-best/workflow-engine": ["./packages/workflow-engine/src/index.ts"]
```

After:（删除这两行）

- [ ] **Step 3: 验证 typecheck 通过**

```bash
bun run typecheck
```

Expected: 零错误。

如果报错 "Cannot find module 'xxx'"：说明该 alias 仍被代码使用，恢复该条目（该包未真正废弃）。

- [ ] **Step 4: Commit（仅当有修改时）**

```bash
git add tsconfig.json
git commit -m "chore: 清理 tsconfig.json 中指向已删除包的 paths 别名"
```

---

## Task 3: 检查 types 数组与 internal-modules.d.ts

**Files:** 无修改（除非发现问题）

- [ ] **Step 1: 检查 types 配置**

当前 `tsconfig.json` 的 `compilerOptions.types` 是 `["bun"]`（继承自 base）。

Run:
```bash
# 检查 src/types/ 下是否有类型声明文件已变成孤儿（未在代码中被引用）
ls -la src/types/
```

Expected: 列出 `global.d.ts`、`internal-modules.d.ts`、`message.ts`、`permissions.ts` 等文件。

- [ ] **Step 2: 验证 internal-modules.d.ts 的 bun:bundle 声明仍需要**

Run:
```bash
rg --no-heading --count-matches "from\s+['\"]bun:bundle['\"]" src/ | wc -l
```

Expected: > 0（F2 修正：UI 功能级 feature 约 200 处仍保留，bun:bundle 模块声明必须保留）。

如果输出为 0：说明所有 feature() 都已被 feature-gate 替代（不太可能），可从 internal-modules.d.ts 删除 `bun:bundle` 声明。否则保留。

- [ ] **Step 3: 验证 global.d.ts 的 MACRO 声明仍需要**

Run:
```bash
rg --no-heading --count-matches "MACRO\." src/ scripts/ | head -3
```

Expected: > 0（`scripts/defines.ts` 仍管理 MACRO，所有版本号常量都用它）。

如果输出为 0：说明 MACRO 已废弃，可清理 global.d.ts。否则保留。

---

## Task 4: 检查 tsPreCompilationDeps 相关的 tsc 选项

**Files:** 无修改

- [ ] **Step 1: 确认 tsconfig 中没有阻碍 transimport 的选项**

architecture spec §3.2 要求 tools/core 等底层模块不依赖上层。dependency-cruiser 用 `tsPreCompilationDeps: true` 解析 TS import。但 tsc 层面，我们要确认 `moduleResolution: "bundler"`（当前值）能正确解析新目录结构。

Run:
```bash
bun run typecheck 2>&1 | head -20
```

Expected: 零错误，无 "Cannot find module" 报错。

- [ ] **Step 2: 确认 noEmit + Bun 运行时组合无问题**

当前 `tsconfig.base.json` 的 `noEmit: true` 表示 tsc 只做类型检查，不产生 .js。这是正确的——实际构建走 `bun build` / vite。

Run:
```bash
grep -E "noEmit|emitDeclarationOnly|declaration" tsconfig.json tsconfig.base.json
```

Expected: 只有 `tsconfig.base.json` 的 `"noEmit": true`，无其他 emit 相关配置。

---

## Task 5: 跑全量验证

**Files:** 无修改

- [ ] **Step 1: 跑 typecheck**

```bash
bun run typecheck
```

Expected: 零错误。

- [ ] **Step 2: 跑 precheck**

```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 3: 跑 build**

```bash
bun run build && bun run build:vite
```

Expected: 两种 build 都成功。

- [ ] **Step 4: Commit（空 commit 标记 F2 完成）**

```bash
git add -A
git commit --allow-empty -m "chore: F2 完成 - tsconfig 清理验证通过"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| 误删仍被代码引用的 paths 别名，导致 tsc 报 "Cannot find module" | 高 | Task 2 Step 3 跑 typecheck 验证；如报错立即回滚该条目 |
| tsconfig.base.json 中有过时 compilerOptions 未被发现 | 中 | Task 1 Step 2 显式 cat base 配置审查 |
| 某个 packages/* 包实际已废弃但 paths 仍保留（死配置） | 低 | Task 2 Step 1 验证 PKG_EXISTS；knip 在 F1 已捕获未使用导出 |
| Bun 对 tsconfig 某些字段的兼容性（如 `rootDirs`）| 低 | 本 PR 不引入新字段，只清理 |

---

## Workflow Adaptation

- **PR ID:** F2
- **依赖:** F1（旧文件已删除，才能判断哪些 paths 失效）
- **被依赖:** F3（F3 更新 CLAUDE.md 时会引用 tsconfig 现状）、F4
- **推荐 maxConcurrency:** 1
- **建议 phases:**
  1. `Audit` — 审计当前 tsconfig 配置（Task 1）
  2. `CleanPaths` — 清理过时 paths 别名（Task 2）
  3. `VerifyTypes` — 检查 types 数组与 d.ts 文件（Task 3）
  4. `VerifyResolution` — 验证 module resolution（Task 4）
  5. `Verify` — 全量验证（Task 5）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      auditComplete: { type: 'boolean' },
      pathsCleaned: { type: 'boolean' },
      typecheckPasses: { type: 'boolean' },
      precheckPasses: { type: 'boolean' },
      buildPasses: { type: 'boolean' }
    },
    required: ['auditComplete', 'typecheckPasses', 'precheckPasses', 'buildPasses']
  }
  ```
- **可并行点:** F2 与 F3 可部分并行——F3 改 CLAUDE.md 不影响 tsconfig。但建议串行，因为 F3 会引用 tsconfig 现状。
- **Plan B 触发条件:**
  1. 若 Task 2 Step 3 typecheck 失败且无法快速定位：回滚所有 tsconfig 修改，保留现状（paths 死配置无害，可延后到单独 PR）。
  2. 若 Task 4 Step 1 报 "Cannot find module" 但不是 paths 问题：说明新目录结构有 import 路径错误，回到对应核心 PR（C1/C4/C9）修复。F2 本身不改 import。

---

**本 plan 实现 v2 spec §9.3（F2 条目）。**
