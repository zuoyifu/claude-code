# P0: dependency-cruiser 配置

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加 `dependency-cruiser` 配置，对架构边界做宽松规则检查（warning only），为后续 PR 的依赖方向约束打基础。

**Architecture:** 安装 `dependency-cruiser` 为 dev dependency，编写 `.dependency-cruiser.js` 配置文件，定义 v2 spec §3.2 的模块边界规则。本期**仅警告**，不阻断 CI。

**Tech Stack:** dependency-cruiser 16+、Node.js、Bun 兼容。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `.dependency-cruiser.js` | 新建：规则配置（warning 级别） |
| `package.json` | 修改：添加 dev dependency + `lint:deps` script |
| `docs/superpowers/refactor-assets/dependency-rules-v2.md` | 新建：规则与 v2 spec §3.2 的对应说明 |

---

## Task 1: 安装 dependency-cruiser

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装依赖**

Run:
```bash
bun add -d dependency-cruiser@^16
```

Expected: `package.json` 的 `devDependencies` 出现 `dependency-cruiser`。

- [ ] **Step 2: 验证安装**

Run:
```bash
bunx depcruise --version
```

Expected: 输出形如 `16.x.x` 的版本号。

- [ ] **Step 3: 添加 lint:deps script**

Modify `package.json`，在 `scripts` 中加：

```json
{
  "scripts": {
    "lint:deps": "depcruise src --config"
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lockb
git commit -m "chore: 添加 dependency-cruiser dev dependency"
```

---

## Task 2: 编写宽松规则配置

**Files:**
- Create: `.dependency-cruiser.js`

- [ ] **Step 1: 创建配置文件**

Create `.dependency-cruiser.js`:

```js
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // v2 spec §3.2 - query/ 三层强制单向依赖
    {
      name: 'query-loop-no-engine',
      severity: 'warn',
      comment: 'v2 spec §7.6: query/loop 不得 import query/engine',
      from: { path: '^src/query/loop/' },
      to: { path: '^src/query/engine/' },
    },
    {
      name: 'query-api-no-loop',
      severity: 'warn',
      comment: 'v2 spec §7.6: query/api 不得 import query/loop 或 query/engine',
      from: { path: '^src/query/api' },
      to: { path: '^src/query/(loop|engine)/' },
    },
    {
      name: 'query-engine-no-cli',
      severity: 'warn',
      comment: 'v2 spec §7.6: query/engine 不得 import cli/',
      from: { path: '^src/query/engine/' },
      to: { path: '^src/cli/' },
    },
    // v2 spec §3.2 - tools 内部依赖方向
    {
      name: 'tools-core-no-registry',
      severity: 'warn',
      comment: 'v2 spec §3.2: tools/core 是底层，不得依赖 tools/registry',
      from: { path: '^src/tools/core/' },
      to: { path: '^src/tools/(registry|execution|discovery|builtin|presets)/' },
    },
    {
      name: 'tools-shared-isolation',
      severity: 'warn',
      comment: 'v2 spec §3.2: tools/shared 是底层 helper，不得依赖其他 tools 子目录',
      from: { path: '^src/tools/shared/' },
      to: { path: '^src/tools/(registry|execution|discovery|builtin|presets|core)/' },
    },
    {
      name: 'tools-registry-no-execution',
      severity: 'warn',
      comment: 'v2 spec §3.2: tools/registry 不得依赖 tools/execution',
      from: { path: '^src/tools/registry/' },
      to: { path: '^src/tools/(execution|discovery|builtin)/' },
    },
    // v2 spec §3.2 - cli 分层
    {
      name: 'cli-dispatcher-no-command-impl',
      severity: 'warn',
      comment: 'v2 spec §3.2: cli/dispatcher 不得 import 具体 command 实现',
      from: { path: '^src/cli/dispatcher/' },
      to: { path: '^src/commands/[^_]' },  // 允许 import _registry
    },
    // F2 边界：feature() 调用约束（C2 完成后激活）
    {
      name: 'feature-bundle-tool-boundary',
      severity: 'warn',  // F4 才会改为 error
      comment: 'v2 spec §3.3: bun:bundle 在 tools/ 中只允许出现在 tools/registry/feature-gate.ts',
      from: { path: '^src/tools/(?!registry/feature-gate)' },
      to: { path: 'bun:bundle' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    moduleSystems: ['esm', 'cjs'],
    tsPreCompilationDeps: true,
    enhancedDepth: 1,
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
}
```

- [ ] **Step 2: 跑一次 baseline 验证**

Run:
```bash
bunx depcruise src --config
```

Expected: 输出大量 warning（因为 v2 目录结构还没建立），但**不应有 fatal error**。warning 数量记录为 baseline。

- [ ] **Step 3: 把 baseline 写入文档**

Create `docs/superpowers/refactor-assets/dependency-rules-v2.md`:

```markdown
# dependency-cruiser 规则与 v2 spec 对应

## 当前 baseline（P0 完成时）

- 跑 `bunx depcruise src --config` 输出约 N 条 warning
- 全部为预期：v2 目录结构尚未建立

## 规则演进计划

| PR | 启用规则 | 预期 warning 变化 |
|----|---------|-----------------|
| C1 完成 | tools-core-no-registry / tools-shared-isolation / tools-registry-no-execution | tools 相关 warning → 0 |
| C2 完成 | feature-bundle-tool-boundary | tools/ 中的 feature() warning → 0 |
| C7 完成 | cli-dispatcher-no-command-impl | cli 相关 warning → 0 |
| C10 完成 | query-loop-no-engine / query-api-no-loop / query-engine-no-cli | query 相关 warning → 0 |
| F4 | 全部 severity warn → error | 0 warning，违规即 CI fail |
```

- [ ] **Step 4: Commit**

```bash
git add .dependency-cruiser.js docs/superpowers/refactor-assets/dependency-rules-v2.md
git commit -m "chore: 添加 dependency-cruiser 宽松规则配置（v2 架构边界声明）"
```

---

## Task 3: 添加冒烟集成测试

**Files:**
- Create: `tests/integration/dependency-rules.test.ts`

- [ ] **Step 1: 写测试**

Create `tests/integration/dependency-rules.test.ts`:

```ts
import { describe, test, expect } from 'bun:test'
import { execSync } from 'node:child_process'

describe('dependency-cruiser rules', () => {
  test('配置文件存在', () => {
    const path = require('node:path').resolve(process.cwd(), '.dependency-cruiser.js')
    const fs = require('node:fs')
    expect(fs.existsSync(path)).toBe(true)
  })

  test('lint:deps script 可执行（允许 warning）', () => {
    // 不阻断测试——当前阶段 warning 是预期
    const output = execSync('bunx depcruise src --config --output-type text 2>&1 || true', {
      cwd: process.cwd(),
    }).toString()
    expect(output).not.toContain('invalid config')
  })
})
```

- [ ] **Step 2: 跑测试**

Run:
```bash
bun test tests/integration/dependency-rules.test.ts
```

Expected: 2 tests pass。

- [ ] **Step 3: 跑 precheck 验证全局无回归**

Run:
```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 4: Commit**

```bash
git add tests/integration/dependency-rules.test.ts
git commit -m "test: 添加 dependency-cruiser 配置冒烟测试"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| `dependency-cruiser` 与 Bun ESM 兼容性问题 | 中 | 已用 `tsPreCompilationDeps: true`；若报错，加 `externals` 选项排除 `bun:bundle` |
| warning 太多淹没 signal | 低 | baseline 文档记录预期数量；后续 PR 关闭对应规则时验证 |
| 配置文件被 Biome 格式化破坏 | 低 | `.dependency-cruiser.js` 是 CommonJS，Biome 不动 |

---

## Workflow Adaptation

- **PR ID:** P0
- **依赖:** 无（前置起点）
- **被依赖:** P0.5、P1、P2（均依赖 P0）
- **推荐 maxConcurrency:** 1（P0 本身串行，但可与其他前置 PR 并行）
- **建议 phases:**
  1. `Install` — 安装 dependency-cruiser
  2. `Configure` — 写规则配置
  3. `Baseline` — 记录 baseline warning
  4. `Test` — 冒烟测试
- **验证 schema:** `STEP_RESULT_SCHEMA`（stepId / status / output）
- **可并行点:** P0 内部不可并行；但 P0 完成后，P0.5 / P1 / P2 可同时启动。
- **Plan B 触发条件:** 若 `dependency-cruiser` 完全无法在 Bun 项目工作（10% 概率），改用 `madge` 替代（功能子集）。该决策在 Task 2 Step 2 失败时触发。
