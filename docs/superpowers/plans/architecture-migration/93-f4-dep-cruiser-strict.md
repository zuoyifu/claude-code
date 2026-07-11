# F4: dependency-cruiser 收紧（warn → error）+ CI 集成

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `.dependency-cruiser.js` 中所有架构边界规则的 `severity` 从 `'warn'` 收紧为 `'error'`，添加 `lint:deps:strict` script，并把 dependency-cruiser 检查集成到 CI（`.github/workflows/ci.yml`）。验证 `bun run lint:deps` 退出码 0、`bun run lint:deps:strict` 以 error 级别阻断违规。

**Architecture:** 在 P0 建立的宽松规则（warn 级别）基础上，F4 是架构迁移的最终护栏——所有核心 PR 完成后，v2 架构边界已实际建立，warning 应全部清零，此时收紧为 error 不会产生误报。同时把检查接入 CI，防止未来 PR 退化。

**Tech Stack:** dependency-cruiser 16+、GitHub Actions、Bun。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `.dependency-cruiser.js` | 修改：所有规则 `severity: 'warn'` → `'error'` |
| `package.json` | 修改：添加 `lint:deps:strict` script |
| `.github/workflows/ci.yml` | 修改：在 Type check 后插入 dependency-cruiser 检查步骤 |
| `docs/superpowers/refactor-assets/dependency-rules-v2.md` | 修改：更新 baseline 记录（P0 文档的 F4 行标记完成） |
| `tests/integration/dependency-rules-strict.test.ts` | 新建：断言 lint:deps:strict 退出码 0 |

---

## Task 1: 确认 baseline 已清零

**Files:** 无修改

- [ ] **Step 1: 跑当前 warn 级别 dep-cruiser**

Run:
```bash
bunx depcruise src --config 2>&1 | tee /tmp/f4-baseline.txt
echo "---"
echo "warn count:"
grep -c '^\s*warn' /tmp/f4-baseline.txt || echo 0
echo "error count:"
grep -c '^\s*error' /tmp/f4-baseline.txt || echo 0
```

Expected: `warn count: 0`，`error count: 0`。

如果 warn count > 0：说明有架构违规未修复。**不要继续 F4**——先列出违规项，回到对应核心 PR 修复。常见情况：
- `tools-core-no-registry`：说明 `src/tools/core/` 仍 import `tools/registry/`——C1 未完成。
- `query-loop-no-engine`：说明 `src/query/loop/` 仍 import `query/engine/`——C9 未完成。
- `feature-bundle-tool-boundary`：说明 `tools/` 中除 `feature-gate.ts` 外有 `bun:bundle` import——C2 未完成。

- [ ] **Step 2: 验证 .dependency-cruiser.js 存在**

Run:
```bash
ls -la .dependency-cruiser.js
```

Expected: 文件存在（P0 创建）。如果不存在，P0 未完成——F4 依赖 P0 先合并。

- [ ] **Step 3: 记录当前规则清单**

Run:
```bash
rg --no-heading --line-number "name:|severity:" .dependency-cruiser.js
```

Expected: 输出所有规则名 + 当前 severity（应全部为 `'warn'`）。记录规则名清单用于 Task 2。

---

## Task 2: 收紧所有规则为 error

**Files:**
- Modify: `.dependency-cruiser.js`

- [ ] **Step 1: 全局替换 severity**

Run:
```bash
# 先统计当前 warn 数量
grep -c "severity: 'warn'" .dependency-cruiser.js
```

Expected: 输出 warn 出现次数（约 8-10 条规则，参考 P0 配置）。

用 Edit 工具修改 `.dependency-cruiser.js`：把所有 `severity: 'warn'` 替换为 `severity: 'error'`。

- [ ] **Step 2: 验证替换结果**

Run:
```bash
echo "remaining warn:"
grep -c "severity: 'warn'" .dependency-cruiser.js || echo 0
echo "error count:"
grep -c "severity: 'error'" .dependency-cruiser.js
```

Expected: `remaining warn: 0`，`error count` 等于 Step 1 的 warn 数量。

- [ ] **Step 3: 跑 dep-cruiser 验证零违规**

```bash
bunx depcruise src --config
echo "exit code: $?"
```

Expected: 退出码 0，无 error/warn 输出。

如果退出码非 0：列出违规项，逐一修复。**不允许回退到 warn 级别**——F4 的目的是收紧。

- [ ] **Step 4: Commit**

```bash
git add .dependency-cruiser.js
git commit -m "refactor: dependency-cruiser 规则收紧为 error 级别（架构迁移收尾）"
```

---

## Task 3: 添加 lint:deps:strict script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 在 package.json 的 scripts 中添加 lint:deps:strict**

Modify `package.json` 的 `scripts` 段。

Before（当前 scripts 中的相关行）：
```json
"lint": "biome lint .",
"lint:fix": "biome lint --fix .",
```

After（在 `lint:fix` 之后、`format` 之前插入）：
```json
"lint": "biome lint .",
"lint:fix": "biome lint --fix .",
"lint:deps": "depcruise src --config",
"lint:deps:strict": "depcruise src --config",
```

**说明：** P0 已添加 `lint:deps`（值为 `depcruise src --config`）。F4 新增 `lint:deps:strict` 作为语义明确的"严格模式"别名——两者命令相同（因为 F4 已把配置中的 severity 收紧为 error），但 `lint:deps:strict` 明确表达"会阻断 CI"的意图。保留 `lint:deps` 为了向后兼容（P0 的集成测试引用了它）。

- [ ] **Step 2: 验证两个 script 都可执行**

Run:
```bash
bun run lint:deps
echo "lint:deps exit: $?"
bun run lint:deps:strict
echo "lint:deps:strict exit: $?"
```

Expected: 两个命令退出码都是 0。

- [ ] **Step 3: 把 lint:deps:strict 加入 precheck**

Modify `package.json` 的 `precheck` script。

Before：
```json
"precheck": "bun run typecheck && bun run check:fix && bun test",
```

After：
```json
"precheck": "bun run typecheck && bun run check:fix && bun run lint:deps:strict && bun test",
```

**说明：** 把 dependency-cruiser 严格检查纳入 precheck，确保本地开发也能捕获架构违规。

- [ ] **Step 4: 跑 precheck 验证**

```bash
bun run precheck
```

Expected: 零错误（包括 lint:deps:strict 通过）。

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "chore: 添加 lint:deps:strict script 并纳入 precheck"
```

---

## Task 4: 集成到 CI

**Files:**
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 在 ci.yml 的 Type check 步骤后插入 dependency-cruiser 步骤**

Modify `.github/workflows/ci.yml`。

Before（当前 ci.yml 行 38-40）：
```yaml
      - name: Type check
        run: bun run typecheck
```

After：
```yaml
      - name: Type check
        run: bun run typecheck

      - name: Architecture boundary check (dependency-cruiser)
        run: bun run lint:deps:strict
```

- [ ] **Step 2: 验证 ci.yml 语法**

Run:
```bash
# 检查 YAML 缩进和结构
rg --no-heading --line-number "name:|run:" .github/workflows/ci.yml | head -20
```

Expected: 新增的 `Architecture boundary check` 步骤出现在 `Type check` 之后、`Test with Coverage` 之前。

- [ ] **Step 3: 本地模拟 CI 顺序执行**

Run:
```bash
bunx biome ci . && \
bun run typecheck && \
bun run lint:deps:strict && \
echo "CI sequence would pass"
```

Expected: 输出 "CI sequence would pass"。

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: 集成 dependency-cruiser 架构边界检查到 CI"
```

---

## Task 5: 添加严格模式集成测试

**Files:**
- Create: `tests/integration/dependency-rules-strict.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/integration/dependency-rules-strict.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(process.cwd())

describe('F4: dependency-cruiser 严格模式', () => {
  test('.dependency-cruiser.js 不含 warn 级别规则（全部 error）', () => {
    const configPath = path.resolve(REPO_ROOT, '.dependency-cruiser.js')
    const content = readFileSync(configPath, 'utf8')

    // 提取所有 severity 声明
    const severities = content.match(/severity:\s*['"](\w+)['"]/g) || []
    const warnCount = severities.filter((s) => s.includes('warn')).length
    const errorCount = severities.filter((s) => s.includes('error')).length

    expect(warnCount).toBe(0)
    expect(errorCount).toBeGreaterThan(0)
  })

  test('lint:deps:strict 退出码 0（零架构违规）', () => {
    expect(() => {
      execSync('bun run lint:deps:strict', { cwd: REPO_ROOT, stdio: 'pipe' })
    }).not.toThrow()
  })

  test('lint:deps 退出码 0（向后兼容）', () => {
    expect(() => {
      execSync('bun run lint:deps', { cwd: REPO_ROOT, stdio: 'pipe' })
    }).not.toThrow()
  })

  test('package.json 的 precheck 包含 lint:deps:strict', () => {
    const pkgPath = path.resolve(REPO_ROOT, 'package.json')
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
    expect(pkg.scripts.precheck).toContain('lint:deps:strict')
  })

  test('ci.yml 包含 dependency-cruiser 步骤', () => {
    const ciPath = path.resolve(REPO_ROOT, '.github/workflows/ci.yml')
    const content = readFileSync(ciPath, 'utf8')
    expect(content).toContain('lint:deps:strict')
    expect(content).toMatch(/[Aa]rchitecture boundary|dependency-cruiser/)
  })

  test('核心架构边界规则存在', () => {
    const configPath = path.resolve(REPO_ROOT, '.dependency-cruiser.js')
    const content = readFileSync(configPath, 'utf8')

    // v2 spec §3.2 + §7.6 的核心规则
    const expectedRules = [
      'query-loop-no-engine',
      'query-api-no-loop',
      'query-engine-no-cli',
      'tools-core-no-registry',
      'tools-shared-isolation',
      'tools-registry-no-execution',
      'feature-bundle-tool-boundary',
    ]

    for (const rule of expectedRules) {
      expect(content).toContain(`name: '${rule}'`)
    }
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/dependency-rules-strict.test.ts
```

Expected: 6 tests pass。

- [ ] **Step 3: 跑全量 precheck（含 lint:deps:strict）**

```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add tests/integration/dependency-rules-strict.test.ts
git commit -m "test: F4 添加 dependency-cruiser 严格模式集成测试"
```

---

## Task 6: 更新 baseline 文档

**Files:**
- Modify: `docs/superpowers/refactor-assets/dependency-rules-v2.md`

- [ ] **Step 1: 更新规则演进计划表**

Modify `docs/superpowers/refactor-assets/dependency-rules-v2.md`（P0 创建的文档）。

在文档末尾的 "规则演进计划" 表格中，把 F4 行标记为完成。

Before（P0 写入时的 F4 行）：
```markdown
| F4 | 全部 severity warn → error | 0 warning，违规即 CI fail |
```

After：
```markdown
| F4 | 全部 severity warn → error | 0 warning，违规即 CI fail | **已完成** — 所有规则收紧为 error，CI 已集成 `lint:deps:strict` 步骤。退出码 0 验证通过。 |
```

- [ ] **Step 2: 在文档顶部更新 baseline 状态**

在文档的 "## 当前 baseline（P0 完成时）" 段之后追加一段：

```markdown
## 当前 baseline（F4 完成时）

- 跑 `bun run lint:deps:strict` 退出码 0，零 warning，零 error。
- 所有 v2 架构边界规则以 `severity: 'error'` 级别生效。
- CI 在 Type check 后自动执行 `bun run lint:deps:strict`。
- `precheck` 已包含 `lint:deps:strict`，本地开发即可捕获架构违规。
- 任何 PR 引入违反 §3.2 分层约束的 import 都会被 CI 阻断。
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/refactor-assets/dependency-rules-v2.md
git commit -m "docs: F4 更新 dependency-cruiser baseline 文档（标记规则演进完成）"
```

---

## Task 7: 最终全量验证

**Files:** 无修改

- [ ] **Step 1: 跑 precheck（含 lint:deps:strict）**

```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 2: 跑两个 build**

```bash
bun run build && bun run build:vite
```

Expected: 两种 build 都成功。

- [ ] **Step 3: 跑 --version 快速路径**

```bash
node dist/cli.js --version
```

Expected: 输出版本号。

- [ ] **Step 4: 跑全套集成测试（确认无回归）**

```bash
bun test tests/integration/
```

Expected: 全部 pass，包括：
- `dependency-rules.test.ts`（P0 创建的冒烟测试）
- `dependency-rules-strict.test.ts`（F4 新增）
- `no-legacy-paths.test.ts`（F1 新增）
- `registry-generation.test.ts`（P4 新增）
- 其他现有集成测试

- [ ] **Step 5: 空 commit 标记 F4 完成**

```bash
git commit --allow-empty -m "chore: F4 完成 - dependency-cruiser 严格模式上线，架构迁移全部收尾"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| 收紧为 error 后发现遗留违规（某核心 PR 未完全清理）| 高 | Task 1 Step 1 先验证 baseline 零 warning；若非零，停止 F4 回核心 PR 修复 |
| `precheck` 加入 lint:deps:strict 后变慢（dep-cruiser 耗时） | 中 | dep-cruiser 对 ~1000 文件项目通常 < 3 秒；若 > 10 秒，考虑只在 CI 跑、precheck 保留原样 |
| CI 中 dep-cruiser 因 node_modules 路径误报 | 低 | P0 配置已有 `doNotFollow: { path: 'node_modules' }`；如仍有问题加 `exclude: 'node_modules'` |
| `bun:bundle` 被 dep-cruiser 当作未解析模块报错 | 中 | P0 配置已用 `tsPreCompilationDeps: true`；如 F4 报错，在 options 加 `externals: ['bun:bundle', 'bun:ffi']` |
| 某核心 PR（如 C6）漏修一条违规，F4 阻塞 | 高 | Task 1 Step 1 是硬门槛；Plan B：若仅剩 1-2 条且属同一 PR，F4 可暂时把该规则降回 warn 并在 baseline 文档记录，但不影响其他规则的 error 化 |
| GitHub Actions 环境与本地 dep-cruiser 版本不一致 | 低 | `package.json` devDependencies 锁定 `dependency-cruiser@^16`；CI 用 `bun install --frozen-lockfile` |

---

## Workflow Adaptation

- **PR ID:** F4
- **依赖:** F1（验证旧路径已清理，baseline 零 warning 才能收紧）、P0（.dependency-cruiser.js 已存在）、所有核心 PR（架构边界实际建立）
- **被依赖:** 无（F4 是架构迁移的最后一个 PR）
- **推荐 maxConcurrency:** 1（配置文件单线修改）
- **建议 phases:**
  1. `Baseline` — 确认 baseline 零 warning（Task 1）
  2. `Strictify` — 收紧 severity 为 error（Task 2）
  3. `Script` — 添加 lint:deps:strict script + precheck 集成（Task 3）
  4. `CI` — 集成到 ci.yml（Task 4）
  5. `Test` — 严格模式集成测试（Task 5）
  6. `Docs` — 更新 baseline 文档（Task 6）
  7. `Verify` — 最终全量验证（Task 7）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      baselineZero: { type: 'boolean' },
      allRulesError: { type: 'boolean' },
      lintDepsStrictPasses: { type: 'boolean' },
      lintDepsPasses: { type: 'boolean' },
      precheckIncludesDeps: { type: 'boolean' },
      ciIntegratesDeps: { type: 'boolean' },
      strictTestPasses: { type: 'boolean' },
      baselineDocUpdated: { type: 'boolean' },
      buildPasses: { type: 'boolean' },
      precheckPasses: { type: 'boolean' }
    },
    required: [
      'baselineZero', 'allRulesError', 'lintDepsStrictPasses',
      'precheckIncludesDeps', 'ciIntegratesDeps', 'strictTestPasses',
      'buildPasses', 'precheckPasses'
    ]
  }
  ```
- **可并行点:** 无。F4 是收尾链终点，严格串行。
- **Plan B 触发条件:**
  1. **Task 1 baseline 非零（核心 PR 有遗留违规）：** 立即停止 F4。把违规清单提交给对应核心 PR 的 owner。F4 延后到所有违规清零。**不允许**为了推进 F4 而把规则降回 warn——这违背 F4 的收紧目的。
  2. **Task 2 Step 3 收紧后仍有违规（Task 1 的 warn 检查不够全面）：** 若违规 ≤ 2 条且属于同一规则，F4 可暂时把**该单条规则**降回 warn 并在 baseline 文档标注 TODO，其他规则继续 error 化。若违规 > 2 条，整体回退，回到 Plan B 触发条件 1。
  3. **Task 4 CI 集成后 CI 失败（本地通过但 CI 环境差异）：** 排查 dep-cruiser 版本 / Bun 版本差异。若无法快速定位，把 CI 步骤改为 `continue-on-error: true` 临时放行，但不从 CI 移除——让团队可见违规信号。
  4. **Task 3 precheck 因 dep-cruiser 耗时变得不可接受（> 15 秒）：** 从 precheck 移除 `lint:deps:strict`，只在 CI 跑。`lint:deps:strict` script 保留供本地手动调用。

---

**本 plan 实现 v2 spec §9.3（F4 条目）+ §11（风险与缓解：依赖方向 lint 误报 → F4 前用宽松规则仅警告，F4 收紧 error）。**
