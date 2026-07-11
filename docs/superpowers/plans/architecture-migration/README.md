# 架构迁移实施计划 · 总览

> **For agentic workers:** 本目录下的每个 plan 文件都是独立可执行的 PR 单元，遵循 `superpowers:writing-plans` 格式。用 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans` 执行；用 `/ultracode` 编排多 PR 并行执行（详见各 plan 文件的 **Workflow Adaptation** 段落）。

**Goal:** 按 v2 spec（`docs/superpowers/specs/2026-07-11-architecture-migration-design.md`）将 5640 行 `main.tsx` + 3422 行 `query/QueryEngine` + 散落 5 处的工具系统 + 144 个平铺命令目录，重构为分层 + 注册器架构。

**Architecture:** 方案 A（分层 + 注册器）。详见 spec 文档第 3 节。

**Tech Stack:** Bun + TypeScript + Commander.js + Biome + bun:test。新增 dev-only 依赖：`dependency-cruiser`、`madge`。

---

## 1. 文件清单（19 个 PR）

| # | 文件 | PR | 类型 | 依赖 | 估计行数 |
|---|------|----|------|------|---------|
| 00 | `00-README.md` | — | 总览 | — | 本文件 |
| 01 | `01-p0-dep-cruiser.md` | P0 | 前置 | — | 小 |
| 02 | `02-p0.5-madge-circular-deps.md` | P0.5 | 前置调研 | P0 | ~1 天 |
| 03 | `03-p1-feature-gate.md` | P1 | 前置 | P0 | ~150 行 |
| 04 | `04-p2-registry-types.md` | P2 | 前置 | P0 | ~200 行 |
| 05 | `05-p3-feature-gate-mock.md` | P3 | 前置 | P1 | ~50 行 |
| 06 | `06-p4-build-integration.md` | P4 | 前置 | P2 | ~30 行 |
| 07 | `10-c1-tools-relocation.md` | C1 | 核心 | P0.5, P1, P3 | ~3500 行 move |
| 08 | `11-c2-feature-gate-wiring.md` | C2 | 核心 | C1 | ~200 行 |
| 09 | `12-c3-c8-commands-regroup.md` | C3+C8 | 核心 | C1 | ~144 git mv + 300 行 |
| 10 | `13-c4-cli-program.md` | C4 | 核心 | C3+C8 | ~700 行 |
| 11 | `14-c5-subcommands.md` | C5 | 核心 | C4 | ~900 行 |
| 12 | `15-c6-dispatcher-split.md` | C6 | 核心（最高风险） | C5 | ~3000 行 |
| 13 | `16-c7-main-deletion.md` | C7 | 核心 | C6 | ~400 行 + 删除 |
| 14 | `17-c9-query-split.md` | C9 | 核心（与 C6/C7 并行） | C2 | ~2000 行 |
| 15 | `18-c10-engine-split.md` | C10 | 核心 | C9 | ~1400 行 |
| 16 | `90-f1-shim-verification.md` | F1 | 收尾 | C1-C10 全部 | 验证 |
| 17 | `91-f2-tsconfig-cleanup.md` | F2 | 收尾 | F1 | ~30 行 |
| 18 | `92-f3-claudemd-update.md` | F3 | 收尾 | F1 | 文档 |
| 19 | `93-f4-dep-cruiser-strict.md` | F4 | 收尾 | F1 | 配置 |

---

## 2. 依赖图（v2 并行化版本）

```
P0 ──┬─→ P0.5 ──┬─→ C1 ──→ C2 ──→ C3+C8 ──→ C4 ──→ C5 ──→ C6 ──→ C7
     │          │                                            ↘
     ├─→ P1 ──→ P3                                          F1-F4
     │                                                        ↑
     └─→ P2 ──→ P4                                          （等所有）
                    ↘
                      C2 ──→ C9 ──→ C10  （与 C3-C7 并行）
```

**关键路径（线性）：** P0 → P0.5 → C1 → C2 → C3+C8 → C4 → C5 → C6 → C7 → F1-F4
**Fallback 路径（如果 C6 阻塞）：** P0.5 → C1 → C2 → C9 → C10（先拿到 query/engine 收益）

---

## 3. 推荐执行顺序

### 阶段 1：基础设施（前置 PR，可批量并行）

```
P0 → P0.5（调研） ─┐
P0 → P1            ├─→ 阶段 2 起步
P0 → P2 → P4      ─┘
P1 → P3
```

5 个前置 PR 中只有 P0.5 是调研任务（不写代码），其他都是小代码改动。**建议用 `/ultracode` 并行执行**，maxConcurrency=3。

### 阶段 2：工具系统重构（C1 → C2，串行）

```
C1（搬移 + shim 同 PR 删除）→ C2（feature() 边界化）
```

C1 工程量大但机械，C2 是行为变更。**串行**执行，C2 必须 review C1 之后才能开始。

### 阶段 3：双线推进（核心 PR）

```
线路 A（命令 + CLI 入口）：C3+C8 → C4 → C5 → C6 → C7
线路 B（query/engine）：   C9 → C10
```

两条线路**完全独立**，可由两个并行的 workflow 推进。线路 A 关键路径更长、风险更高；线路 B 收益最直接。**Plan B**：如果线路 A 的 C6 阻塞，立即切换所有资源到线路 B。

### 阶段 4：收尾（串行）

```
F1 → F2 → F3 → F4
```

F1 是关键验证（确认所有 shim 已删），F4 是最终护栏（dependency-cruiser 收紧）。

---

## 4. Workflow 适配说明

### 4.1 单 PR 执行（推荐）

每个 plan 文件可以单独被 workflow 消费。典型模式：

```js
// scripts/workflows/run-pr.js
import { readFileSync } from 'node:fs'
import path from 'node:path'

export const meta = {
  name: 'run-pr',
  description: 'Execute a single PR plan',
  phases: [{ title: 'Plan', detail: 'Parse plan markdown' }, { title: 'Execute', detail: 'Run plan tasks' }],
}

const planPath = args.planPath  // 例如 'docs/superpowers/plans/architecture-migration/10-c1-tools-relocation.md'
const planContent = readFileSync(planPath, 'utf8')

phase('Plan')
const taskBreakdown = await agent(`分析以下 plan 文件，提取所有 task step 为结构化列表：\n\n${planContent}`, {
  label: 'parse-plan',
  phase: 'Plan',
  schema: TASK_LIST_SCHEMA,
})

phase('Execute')
// 用 pipeline 而不是 parallel——task 之间有顺序依赖
const results = await pipeline(
  taskBreakdown.tasks,
  task => agent(`执行 step：${task.description}\n\n代码：${task.code}\n\n预期：${task.expected}`, {
    label: `step:${task.id}`,
    phase: 'Execute',
    schema: STEP_RESULT_SCHEMA,
  }),
  result => agent(`验证 step 结果：${JSON.stringify(result)}`, {
    label: `verify:${result.stepId}`,
    phase: 'Verify',
    schema: VERDICT_SCHEMA,
  }),
)

return results
```

### 4.2 批量并行执行（前置 PR 阶段）

前置 5 个 PR 互相独立（除 P3 依赖 P1、P4 依赖 P2），可并行：

```js
// scripts/workflows/run-frontload-prs.js
export const meta = {
  name: 'run-frontload-prs',
  description: 'Parallel execute frontload PRs (P0-P4)',
  phases: [{ title: 'P0-batch', detail: 'P0 + P0.5 + P1 + P2 并行' }, { title: 'P3-P4', detail: '依赖 P1/P2 的后续' }],
}

phase('P0-batch')
// P0 是其他的前置，必须先完成
await agent('执行 P0: dependency-cruiser 配置', { label: 'P0', phase: 'P0-batch' })

// P0.5, P1, P2 并行
const [p05, p1, p2] = await parallel([
  () => agent('执行 P0.5: madge 循环依赖调研', { label: 'P0.5', phase: 'P0-batch' }),
  () => agent('执行 P1: feature-gate 边界', { label: 'P1', phase: 'P0-batch' }),
  () => agent('执行 P2: registry types', { label: 'P2', phase: 'P0-batch' }),
])

phase('P3-P4')
// P3 依赖 P1，P4 依赖 P2，可并行
const [p3, p4] = await parallel([
  () => agent('执行 P3: feature-gate mock', { label: 'P3', phase: 'P3-P4' }),
  () => agent('执行 P4: build integration', { label: 'P4', phase: 'P3-P4' }),
])
```

### 4.3 双线推进（核心 PR 阶段）

线路 A 和线路 B 独立，可两个 workflow 同时跑：

```js
// scripts/workflows/run-core-prs.js
export const meta = {
  name: 'run-core-prs',
  description: 'Parallel execute core PRs (lines A + B)',
  phases: [
    { title: 'Line-A' },
    { title: 'Line-B' },
    { title: 'Merge' },
  ],
}

// C1 + C2 是两条线路的共同前置
phase('Common')
await agent('执行 C1: 工具搬移', { label: 'C1', phase: 'Common' })
await agent('执行 C2: feature-gate wiring', { label: 'C2', phase: 'Common' })

phase('Line-A')
phase('Line-B')

// 两条线路并行
const [lineA, lineB] = await parallel([
  () => (async () => {
    await agent('执行 C3+C8: 命令分组', { label: 'C3+C8', phase: 'Line-A' })
    await agent('执行 C4: cli/program', { label: 'C4', phase: 'Line-A' })
    await agent('执行 C5: subcommands', { label: 'C5', phase: 'Line-A' })
    await agent('执行 C6: dispatcher', { label: 'C6', phase: 'Line-A' })
    await agent('执行 C7: main.tsx 删除', { label: 'C7', phase: 'Line-A' })
    return 'line-a-done'
  })(),
  () => (async () => {
    await agent('执行 C9: query.ts 拆分', { label: 'C9', phase: 'Line-B' })
    await agent('执行 C10: QueryEngine 拆分', { label: 'C10', phase: 'Line-B' })
    return 'line-b-done'
  })(),
])
```

### 4.4 每个 plan 文件的 Workflow Adaptation 段

每个 PR plan 文件末尾都有标准化的 **Workflow Adaptation** 段落：

```markdown
## Workflow Adaptation

- **PR ID:** C1
- **依赖:** P0.5, P1, P3（必须先完成）
- **被依赖:** C2, C9
- **推荐 maxConcurrency:** 1（C1 内部严格串行）
- **建议 phases:**
  1. `Scan` — 扫描当前文件位置
  2. `Move` — git mv 到新位置
  3. `Rewire` — 修改 import 路径
  4. `Verify` — precheck 通过
- **验证 schema:** `STEP_RESULT_SCHEMA`（stepId / status / output）
- **可并行点:** 无（机械搬移需要严格串行）
- **Plan B 触发条件:** 若循环依赖无法解除，跳过 C1，转 fallback
```

---

## 5. 关键约束（所有 PR 共享）

每个 PR 在执行时必须遵守：

1. **`bun run precheck` 必须零错误**（typecheck + lint fix + test）。
2. **每个 PR 加一个冒烟集成测试**到 `tests/integration/`。
3. **commit message 用 Conventional Commits**（`feat:` / `fix:` / `refactor:` / `chore:` / `docs:`）。
4. **不跳过 husky pre-commit hook**（除非用户明确要求）。
5. **改动跨多文件时用 `git mv`**而非 `mv`，保留 blame 追溯。
6. **不动 `src/components/` 和 `packages/@ant/ink/`**（React 组件保持原样）。
7. **C9/C10 之外的 PR 不动 `src/query.ts` / `src/QueryEngine.ts`**。
8. **C1 之外的 PR 不动 `src/Tool.ts` / `src/tools.ts` / `src/constants/tools.ts`**。

---

## 6. 进度跟踪

执行时建议在项目根目录维护 `.refactor-progress.md`（gitignore）：

```markdown
# 重构进度

## 阶段 1：前置
- [x] P0 dependency-cruiser 配置（2026-07-12）
- [x] P0.5 madge 循环依赖调研（2026-07-12）
- [ ] P1 feature-gate 边界
...

## 阶段 2：工具系统
- [ ] C1 工具搬移
...
```

每完成一个 PR，更新此文件。遇到阻塞，记录阻塞原因和 Plan B 触发情况。

---

## 7. 与 spec 文档的对应

| Spec 章节 | 对应 plan 文件 |
|----------|--------------|
| §4 命令注册机制 | `04-p2-registry-types.md`、`06-p4-build-integration.md`、`12-c3-c8-commands-regroup.md` |
| §5 工具系统统一 | `03-p1-feature-gate.md`、`05-p3-feature-gate-mock.md`、`10-c1-tools-relocation.md`、`11-c2-feature-gate-wiring.md` |
| §6 main.tsx 拆分 | `13-c4-cli-program.md`、`14-c5-subcommands.md`、`15-c6-dispatcher-split.md`、`16-c7-main-deletion.md` |
| §7 query/engine 拆分 | `17-c9-query-split.md`、`18-c10-engine-split.md` |
| §9 迁移策略 | 本 README 的 §3 推荐执行顺序 |
| §11 风险与缓解 | 各 plan 文件的 **Risk** 段 |
| §13 ROI | 本 README 的 §4 Workflow 适配说明 |
