# F3: 更新 CLAUDE.md 架构章节

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 F1/F2 完成后，把 `CLAUDE.md` 中描述旧架构（`src/main.tsx` 5640 行、`src/Tool.ts`、`src/tools.ts`、`src/query.ts`+`QueryEngine.ts`）的章节全面更新为新架构（`src/cli/`、`src/tools/`、`src/query/`、`src/commands/_registry/`）。所有 before/after 片段必须基于真实代码结构。

**Architecture:** 纯文档 PR——只动 `CLAUDE.md`，不改任何代码。修改点覆盖 5 个章节：Entry & Bootstrap、Core Loop、Tool System、Stubbed/Deleted Modules、Working with This Codebase。

**Tech Stack:** Markdown。

---

## File Structure

| 文件 | 责任 |
|------|------|
| `CLAUDE.md` | 修改：5 个章节的 before/after 替换 |

---

## Task 1: 读取 CLAUDE.md 当前内容并定位修改点

**Files:** 无修改

- [ ] **Step 1: 读取完整 CLAUDE.md**

Run:
```bash
wc -l CLAUDE.md
```

Expected: 约 420 行。

- [ ] **Step 2: 定位 5 个待修改章节的行号**

Run:
```bash
rg --no-heading --line-number --type md \
  -e '^### Entry & Bootstrap' \
  -e '^### Core Loop' \
  -e '^### Tool System' \
  -e '^### Stubbed/Deleted Modules' \
  -e '^## Working with This Codebase' \
  CLAUDE.md
```

Expected:
```
93:### Entry & Bootstrap
111:### Core Loop
123:### Tool System
270:### Stubbed/Deleted Modules
381:## Working with This Codebase
```

如果行号与预期不符，以 grep 结果为准（CLAUDE.md 可能在本 PR 之前有微调）。

---

## Task 2: 更新 Entry & Bootstrap 章节

**Files:**
- Modify: `CLAUDE.md`（行 93-109）

- [ ] **Step 1: 替换 Entry & Bootstrap 内容**

**Before**（当前 CLAUDE.md 行 93-109）：

```markdown
### Entry & Bootstrap

1. **`src/entrypoints/cli.tsx`** — True entrypoint。`main()` 函数按优先级处理多条快速路径：
   - `--version` / `-v` — 零模块加载
   - `--dump-system-prompt` — feature-gated (DUMP_SYSTEM_PROMPT)
   - `--claude-in-chrome-mcp` / `--chrome-native-host`
   - `--computer-use-mcp` — 独立 MCP server 模式
   - `--daemon-worker=<kind>` — feature-gated (DAEMON)
   - `remote-control` / `rc` / `remote` / `sync` / `bridge` — feature-gated (BRIDGE_MODE)
   - `daemon` [subcommand] — feature-gated (DAEMON)
   - `ps` / `logs` / `attach` / `kill` / `--bg` — feature-gated (BG_SESSIONS)
   - `new` / `list` / `reply` — Template job commands
   - `environment-runner` / `self-hosted-runner` — BYOC runner
   - `--tmux` + `--worktree` 组合
   - 默认路径：加载 `main.tsx` 启动完整 CLI
2. **`src/main.tsx`** (~5674 行) — Commander.js CLI definition。注册大量 subcommands：`mcp` (serve/add/remove/list...)、`server`、`ssh`、`open`、`auth`、`plugin`、`agents`、`auto-mode`、`doctor`、`update` 等。主 `.action()` 处理器负责权限、MCP、会话恢复、REPL/Headless 模式分发。
3. **`src/entrypoints/init.ts`** — One-time initialization (telemetry, config, trust dialog)。
```

**After**：

```markdown
### Entry & Bootstrap

1. **`src/entrypoints/cli.tsx`** (<200 行) — True entrypoint。`main()` 函数先调用 `cli/fast-paths.ts::handleFastPath()` 按优先级处理快速路径：
   - `--version` / `-v` — 零模块加载
   - `--dump-system-prompt` — feature-gated (DUMP_SYSTEM_PROMPT)
   - `--claude-in-chrome-mcp` / `--chrome-native-host`
   - `--computer-use-mcp` — 独立 MCP server 模式
   - `--daemon-worker=<kind>` — feature-gated (DAEMON)
   - `remote-control` / `rc` / `remote` / `sync` / `bridge` — feature-gated (BRIDGE_MODE)
   - `daemon` [subcommand] — feature-gated (DAEMON)
   - `ps` / `logs` / `attach` / `kill` / `--bg` — feature-gated (BG_SESSIONS)
   - `new` / `list` / `reply` — Template job commands
   - `environment-runner` / `self-hosted-runner` — BYOC runner
   - `--tmux` + `--worktree` 组合
   - 默认路径：创建 Commander program → 注册 subcommands → `.action(handleDefaultAction)` → parseAsync
2. **`src/cli/`** — 从原 `main.tsx`（5640 行）拆分而来，分为 5 个子目录：
   - `cli/program/` — Commander 实例创建 + 全局 option 注册
   - `cli/dispatcher/` — 默认 `.action()` 主路径，按 10 个子模块拆分（options-normalizer、bootstrap、permissions、session-restore、headless、repl 等）
   - `cli/subcommands/` — 11 个 subcommand（mcp/auth/plugin/agents/doctor/update/server/auto-mode/autonomy/task）的静态 import 注册
   - `cli/bootstrap/` — 启动副作用集中点（telemetry/settings/MCP connect/prefetch）
   - `cli/fast-paths.ts` — 唯一 fast-paths 模块（含 bridge/daemon 快速路径）
3. **`src/commands/_registry/`** — 命令注册表。`generated.ts` 由 `scripts/generate-command-registry.ts` 在 build/dev 时编译期生成（扫描 `commands/<category>/<name>/index.ts`），不再是中央手动数组。
4. **`src/entrypoints/init.ts`** — One-time initialization (telemetry, config, trust dialog)。
```

- [ ] **Step 2: 验证替换**

Run:
```bash
rg --no-heading --line-number "src/cli/" CLAUDE.md | head -5
rg --no-heading --line-number "src/main\.tsx" CLAUDE.md
```

Expected:
- 第一条输出包含 `src/cli/` 的多处提及。
- 第二条**不输出**（main.tsx 引用已全部移除）。

如果第二条仍有输出：找到剩余提及，按上下文更新（如 "Testing" 章节可能有 "main.tsx 5640 行" 的描述）。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: F3 更新 CLAUDE.md Entry & Bootstrap 章节（main.tsx → cli/）"
```

---

## Task 3: 更新 Core Loop 章节

**Files:**
- Modify: `CLAUDE.md`（行 111-115）

- [ ] **Step 1: 替换 Core Loop 内容**

**Before**（当前 CLAUDE.md 行 111-115）：

```markdown
### Core Loop

- **`src/query.ts`** — The main API query function. Sends messages to Claude API, handles streaming responses, processes tool calls, and manages the conversation turn loop.
- **`src/QueryEngine.ts`** — Higher-level orchestrator wrapping `query()`. Manages conversation state, compaction, file history snapshots, attribution, and turn-level bookkeeping. Used by the REPL screen.
- **`src/screens/REPL.tsx`** — The interactive REPL screen (React/Ink component). Handles user input, message display, tool permission prompts, and keyboard shortcuts.
```

**After**：

```markdown
### Core Loop

Core loop 已从 `src/query.ts`（2057 行）+ `src/QueryEngine.ts`（1365 行）共 3422 行的两个上帝文件，拆分为 `src/query/` 下三层强制单向依赖结构：

- **`src/query/api.ts`** — API 层。单次 API 请求 + 流解码（`BetaRawMessageStreamEvent` 处理）。不依赖 loop/engine。
- **`src/query/stream/`** — 流处理子模块：`handlers.ts`（流事件处理）、`reducer.ts`（消息归约）、`tool-call-extractor.ts`（工具调用提取）。
- **`src/query/loop/`** — Turn 循环层。多 turn 编排（`index.ts` 主生成器）+ 工具派发（`tool-dispatch.ts`）+ 结果合并（`tool-result-merge.ts`）+ autonomy 决策（`autonomy.ts`）+ 输出限制（`output-validation.ts`）+ 错误恢复（`error-recovery.ts`）。子模块采用三种委托模式：AsyncGenerator 用 `yield*`、Promise 用 `await`、纯函数直接调用。
- **`src/query/engine/`** — 会话级状态机层。`QueryEngine.ts` + `submit-message.ts`（37 个 yield 的生成器）+ `compaction.ts` + `attribution.ts` + `session-persist.ts` + `file-history.ts` + `interrupt.ts` + `messages-state.ts` + `nested-memory.ts` + `skill-discovery.ts`。
- **`src/query/params.ts`** / **`src/query/types.ts`** / **`src/query/ask.ts`** — 共享类型与 `ask()` 顶层函数。
- **依赖方向强制单向：** `engine → loop → api`（`query/loop/` 不得 import `query/engine/`，`query/api.ts` 不得 import `query/loop/` 或 `query/engine/`）。由 `.dependency-cruiser.js` 在 CI 中检查。
- **`src/screens/REPL.tsx`** — The interactive REPL screen (React/Ink component). Handles user input, message display, tool permission prompts, and keyboard shortcuts. 调用 `QueryEngine.submitMessage()` 的 AsyncGenerator。
```

- [ ] **Step 2: 验证替换**

Run:
```bash
rg --no-heading --line-number "src/query\.ts|src/QueryEngine\.ts" CLAUDE.md
```

Expected: 在 Core Loop 章节不应再出现"作为现存上帝文件"的引用。如果 "Testing" 章节仍提及（如 "src/query.ts 2057 行"），保留作为历史描述，但 Core Loop 段必须更新。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: F3 更新 CLAUDE.md Core Loop 章节（query.ts+QueryEngine → query/ 三层）"
```

---

## Task 4: 更新 Tool System 章节

**Files:**
- Modify: `CLAUDE.md`（行 123-138）

- [ ] **Step 1: 替换 Tool System 内容**

**Before**（当前 CLAUDE.md 行 123-138）：

```markdown
### Tool System

- **`src/Tool.ts`** — Tool interface definition (`Tool` type) and utilities (`findToolByName`, `toolMatchesName`).
- **`src/tools.ts`** — Tool registry. Assembles the tool list; tools are imported from `@claude-code-best/builtin-tools` package. Some tools are conditionally loaded via `feature()` flags or `process.env.USER_TYPE`.
- **`src/constants/tools.ts`** — `CORE_TOOLS` 白名单常量（38 个核心工具名），用于 `isDeferredTool` 白名单制判定。
- **`packages/builtin-tools/src/tools/`** — 60 个工具目录（含 shared/testing 等工具目录），通过 `@claude-code-best/builtin-tools` 包导出。主要分类：
  - **文件操作**: FileEditTool, FileReadTool, FileWriteTool, GlobTool, GrepTool
  - **Shell/执行**: BashTool, PowerShellTool, REPLTool
  - **Agent 系统**: AgentTool, TaskCreateTool, TaskUpdateTool, TaskListTool, TaskGetTool
  - **规划**: EnterPlanModeTool, ExitPlanModeV2Tool, VerifyPlanExecutionTool
  - **Web/MCP**: WebFetchTool, WebSearchTool, MCPTool, McpAuthTool
  - **调度**: CronCreateTool, CronDeleteTool, CronListTool
  - **工具发现**: SearchExtraToolsTool, ExecuteExtraTool, SyntheticOutput（CORE_TOOLS，用于延迟工具按需加载）
  - **其他**: LSPTool, ConfigTool, SkillTool, EnterWorktreeTool, ExitWorktreeTool 等
- **`src/tools/shared/`** / **`packages/builtin-tools/src/tools/shared/`** — Tool 共享工具函数。
- **`src/services/searchExtraTools/`** — TF-IDF 工具索引模块（`toolIndex.ts`），为延迟工具提供语义搜索能力。复用 `localSearch.ts` 的 TF-IDF 算法函数（`computeWeightedTf`、`computeIdf`、`cosineSimilarity` 已导出）。修改这些函数时需同步检查工具索引测试。`prefetch.ts` 的 `extractQueryFromMessages` 复用了 `skillSearch/prefetch.ts` 的同名导出函数，修改 skill prefetch 的该函数时需同步检查工具预取行为。工具预取使用独立的 `discoveredToolsThisSession` Set，与 skill prefetch 的去重集合互不影响。
```

**After**：

```markdown
### Tool System

工具系统已从散落 5 处（`src/Tool.ts`、`src/tools.ts`、`src/constants/tools.ts`、`src/services/tools/`、`src/services/searchExtraTools/`）合并为 `src/tools/` 下清晰分层：

- **`src/tools/core/`** — Tool 类型定义 + 生命周期契约（原 `src/Tool.ts`）。零运行时依赖，纯类型层。包含 `findToolByName`、`toolMatchesName` 等工具函数。
- **`src/tools/registry/`** — 工具注册 + 白名单 + feature gate 边界。子模块：
  - `registry.ts` — 注册器实现（原 `src/tools.ts` 的装配逻辑）
  - `feature-gate.ts` — **工具注册级 feature() 唯一边界**（约 15 处工具注册相关 `feature()` 调用集中于此）
  - `assembler.ts` — 工具列表组装（首次调用时惰性装配）
  - `whitelists.ts` — `CORE_TOOLS` 白名单（原 `src/constants/tools.ts`）
  - `agent-policy.ts` — Agent 工具策略
  - `filter.ts` — 工具过滤
- **`src/tools/presets/`** — Preset 配置（依赖 core 仅类型）。
- **`src/tools/execution/`** — 工具运行时（原 `src/services/tools/`，含 `runToolUse`、`toolHooks`、`StreamingToolExecutor`、`toolOrchestration`）。**不得 import `tools/builtin/`、`tools/discovery/`** 防止循环。
- **`src/tools/discovery/`** — TF-IDF 工具索引 + 延迟加载 + prefetch（原 `src/services/searchExtraTools/`）。`toolIndex.ts` 复用 `localSearch.ts` 的 TF-IDF 算法函数（`computeWeightedTf`、`computeIdf`、`cosineSimilarity` 已导出）。修改这些函数时需同步检查工具索引测试。`prefetch.ts` 的 `extractQueryFromMessages` 复用了 `skillSearch/prefetch.ts` 的同名导出函数，修改 skill prefetch 的该函数时需同步检查工具预取行为。工具预取使用独立的 `discoveredToolsThisSession` Set，与 skill prefetch 的去重集合互不影响。
- **`src/tools/builtin/`** — 内置工具唯一接入点，通过 `@claude-code-best/builtin-tools` 包加载 60 个工具实现。主要分类：
  - **文件操作**: FileEditTool, FileReadTool, FileWriteTool, GlobTool, GrepTool
  - **Shell/执行**: BashTool, PowerShellTool, REPLTool
  - **Agent 系统**: AgentTool, TaskCreateTool, TaskUpdateTool, TaskListTool, TaskGetTool
  - **规划**: EnterPlanModeTool, ExitPlanModeV2Tool, VerifyPlanExecutionTool
  - **Web/MCP**: WebFetchTool, WebSearchTool, MCPTool, McpAuthTool
  - **调度**: CronCreateTool, CronDeleteTool, CronListTool
  - **工具发现**: SearchExtraToolsTool, ExecuteExtraTool, SyntheticOutput（CORE_TOOLS，用于延迟工具按需加载）
  - **其他**: LSPTool, ConfigTool, SkillTool, EnterWorktreeTool, ExitWorktreeTool 等
- **`src/tools/shared/`** / **`packages/builtin-tools/src/tools/shared/`** — Tool 共享工具函数。纯 helper，不依赖其他 tools 子目录。
- **内部依赖方向（由 `.dependency-cruiser.js` 在 CI 中检查）：** `core ← shared ← registry ← {builtin, presets, discovery, execution}`。
```

- [ ] **Step 2: 验证替换**

Run:
```bash
rg --no-heading --line-number "src/Tool\.ts|src/tools\.ts|src/constants/tools\.ts|src/services/tools|src/services/searchExtraTools" CLAUDE.md
```

Expected: 这些旧路径在 Tool System 章节不再作为"当前架构"出现。可能在 "Stubbed/Deleted Modules" 表格中作为历史记录出现（Task 5 会处理）。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: F3 更新 CLAUDE.md Tool System 章节（散落 5 处 → tools/ 分层）"
```

---

## Task 5: 更新 Stubbed/Deleted Modules 表格

**Files:**
- Modify: `CLAUDE.md`（行 270-283）

- [ ] **Step 1: 在表格末尾追加架构迁移记录**

**Before**（当前 CLAUDE.md 行 283 附近，表格最后一行）：

```markdown
| MCP OAuth | Simplified |
```

**After**（在 `| MCP OAuth | Simplified |` 之后追加一行）：

```markdown
| MCP OAuth | Simplified |
| 架构迁移（`main.tsx` / `query.ts` / `QueryEngine.ts` / `Tool.ts` / `tools.ts` / `commands.ts`） | Refactored — 拆分为 `src/cli/`（5 子目录）、`src/tools/`（6 子目录）、`src/query/`（api/stream/loop/engine 四层）、`src/commands/_registry/`（编译期生成注册表）。详见 `docs/superpowers/specs/2026-07-11-architecture-migration-design.md`。原上帝文件全部删除。 |
```

- [ ] **Step 2: 验证替换**

Run:
```bash
rg --no-heading --line-number "架构迁移" CLAUDE.md
```

Expected: 输出新追加的那一行。

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: F3 更新 CLAUDE.md Stubbed/Deleted Modules 表格（补充架构迁移记录）"
```

---

## Task 6: 更新 Working with This Codebase 章节

**Files:**
- Modify: `CLAUDE.md`（行 381-394）

- [ ] **Step 1: 更新 bun:bundle import 约束说明**

当前 CLAUDE.md 行 386 的 `bun:bundle import` 条目：

**Before**：

```markdown
- **`bun:bundle` import** — `import { feature } from 'bun:bundle'` 是 Bun 内置模块，由运行时/构建器解析。不要用自定义函数替代它。**`feature()` 只能直接用在 `if` 语句或三元表达式的条件位置**（Bun 编译器限制），不能赋值给变量、不能放在箭头函数体里、不能作为 `&&` 链的一部分。正确：`if (feature('X')) {}` 或 `feature('X') ? a : b`。
```

**After**：

```markdown
- **`bun:bundle` import** — `import { feature } from 'bun:bundle'` 是 Bun 内置模块，由运行时/构建器解析。不要用自定义函数替代它。**`feature()` 只能直接用在 `if` 语句或三元表达式的条件位置**（Bun 编译器限制），不能赋值给变量、不能放在箭头函数体里、不能作为 `&&` 链的一部分。正确：`if (feature('X')) {}` 或 `feature('X') ? a : b`。**工具注册级 feature() 调用（约 15 处）集中在 `src/tools/registry/feature-gate.ts`**，其他 tools/ 子目录不允许直接 import `bun:bundle`（由 `.dependency-cruiser.js` 检查）。UI/业务功能级 feature() 调用（约 200 处）保留现状，不在架构迁移范围。
```

- [ ] **Step 2: 在 Working with This Codebase 末尾补充 dependency-cruiser 说明**

**Before**（当前 CLAUDE.md 行 394 附近，"Provider 优先级" 条目）：

```markdown
- **Provider 优先级** — `modelType` 参数 > 环境变量 > 默认 `firstParty`。新增 provider 需在 `src/utils/model/providers.ts` 注册。
```

**After**（在 Provider 优先级条目之后追加两条）：

```markdown
- **Provider 优先级** — `modelType` 参数 > 环境变量 > 默认 `firstParty`。新增 provider 需在 `src/utils/model/providers.ts` 注册。
- **架构边界（dependency-cruiser）** — `bun run lint:deps` 检查模块依赖方向（v2 架构 §3.2 规则）。CI 中 `lint:deps:strict` 以 error 级别阻断违规。修改 `src/tools/`、`src/cli/`、`src/query/`、`src/commands/` 时需确认不违反分层约束（见 `.dependency-cruiser.js`）。
- **命令注册表（generated.ts）** — `src/commands/_registry/generated.ts` 由 `scripts/generate-command-registry.ts` 在 build/dev 时自动生成，**不要手动编辑**（文件头有 AUTO-GENERATED 标记）。新增命令：在 `src/commands/<category>/<name>/` 下创建 `index.ts`，build 时自动接入注册表。
```

- [ ] **Step 3: 验证替换**

Run:
```bash
rg --no-heading --line-number "feature-gate\.ts|lint:deps|generated\.ts" CLAUDE.md
```

Expected: 输出新追加的三处提及。

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: F3 更新 CLAUDE.md Working with This Codebase 章节（补充架构边界与命令注册表说明）"
```

---

## Task 7: 全局一致性检查

**Files:** 无修改

- [ ] **Step 1: 搜索 CLAUDE.md 中所有旧路径引用，确认每处都已被正确更新**

Run:
```bash
rg --no-heading --line-number --type md \
  -e 'src/main\.tsx' \
  -e 'src/Tool\.ts' \
  -e 'src/tools\.ts' \
  -e 'src/constants/tools\.ts' \
  -e 'src/query\.ts' \
  -e 'src/QueryEngine\.ts' \
  -e 'src/commands\.ts' \
  -e 'src/services/tools' \
  -e 'src/services/searchExtraTools' \
  CLAUDE.md
```

Expected: 仅在以下上下文中出现（作为历史描述，非"当前架构"）：
- "Stubbed/Deleted Modules" 表格中的架构迁移记录行（Task 5 追加的）。
- "Core Loop" 章节中如保留 "拆分前...拆分后..." 对比（可选）。

如果发现其他位置仍把旧路径作为"当前架构"引用：用 Task 2-4 的 before/after 方式更新。

- [ ] **Step 2: 检查 "5640 行" / "3422 行" / "144 个平铺" 等数字描述**

Run:
```bash
rg --no-heading --line-number --type md \
  -e '5640 行|5674 行' \
  -e '3422 行' \
  -e '144 个' \
  CLAUDE.md
```

Expected: 如果这些数字出现在"当前状态描述"中，改为"拆分前曾是...已拆分为..."的历史语态。如果出现在 "Testing" 章节作为测试覆盖范围的历史说明，可保留。

- [ ] **Step 3: 跑 precheck 确认 CLAUDE.md 修改不影响任何代码**

```bash
bun run precheck
```

Expected: 零错误。

- [ ] **Step 4: Commit（如有修补）**

```bash
git add CLAUDE.md
git commit -m "docs: F3 补充 CLAUDE.md 全局一致性修正"
```

- [ ] **Step 5: 空 commit 标记 F3 完成**

```bash
git commit --allow-empty -m "docs: F3 完成 - CLAUDE.md 架构章节全面更新"
```

---

## Risk

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| before/after 片段与 CLAUDE.md 实际内容不匹配（行号漂移） | 中 | Task 1 Step 2 先 grep 行号；替换时用内容匹配而非行号匹配 |
| 某章节有旧路径引用但未在本 plan 覆盖 | 中 | Task 7 Step 1 全局搜索兜底 |
| CLAUDE.md 中 "Testing" 章节提到 mock `src/query.ts` 等，更新后语义变化 | 低 | Task 7 Step 1 只更新"当前架构"引用，历史对比保留 |
| 补充的 generated.ts / feature-gate.ts 说明与 F4 最终实现不一致 | 低 | F3 在 F4 之前执行，F4 实施时如 dep-cruiser 配置变化，再补一个小 CLAUDE.md patch |
| `bun run precheck` 因 CLAUDE.md 格式（Biome markdown lint）失败 | 低 | CLAUDE.md 不在 Biome 格式化范围（Biome 只管 .ts/.tsx/.js/.json）；precheck 跑的是 tsc + biome + test，不含 md |

---

## Workflow Adaptation

- **PR ID:** F3
- **依赖:** F1（确认新目录结构存在）、F2（tsconfig 已清理，CLAUDE.md 中的 path alias 描述才准确）
- **被依赖:** F4（F4 不依赖 CLAUDE.md 内容，可独立）
- **推荐 maxConcurrency:** 1（CLAUDE.md 是单文件，不可并行编辑）
- **建议 phases:**
  1. `Audit` — 定位修改点（Task 1）
  2. `Entry` — 更新 Entry & Bootstrap（Task 2）
  3. `CoreLoop` — 更新 Core Loop（Task 3）
  4. `ToolSystem` — 更新 Tool System（Task 4）
  5. `Stubbed` — 更新 Stubbed/Deleted 表格（Task 5）
  6. `WorkingWith` — 更新 Working with This Codebase（Task 6）
  7. `Consistency` — 全局一致性检查（Task 7）
- **验证 schema:**
  ```js
  {
    type: 'object',
    properties: {
      entryUpdated: { type: 'boolean' },
      coreLoopUpdated: { type: 'boolean' },
      toolSystemUpdated: { type: 'boolean' },
      stubbedUpdated: { type: 'boolean' },
      workingWithUpdated: { type: 'boolean' },
      noStaleRefs: { type: 'boolean' },
      precheckPasses: { type: 'boolean' }
    },
    required: [
      'entryUpdated', 'coreLoopUpdated', 'toolSystemUpdated',
      'stubbedUpdated', 'workingWithUpdated', 'noStaleRefs', 'precheckPasses'
    ]
  }
  ```
- **可并行点:** 无。CLAUDE.md 是单文件串行编辑。各 Task 内部的 before/after 可独立提交，但文件互斥。
- **Plan B 触发条件:**
  1. 若 Task 2-6 中某个 before 片段无法在 CLAUDE.md 中匹配（CLAUDE.md 在本 PR 前被他人修改）：用 `rg` 重新定位实际内容，调整 before 片段后继续。
  2. 若 Task 7 Step 1 发现 >5 处遗漏：把遗漏整理成清单，拆为 F3.1 补丁 PR，F3 主体先合并（已覆盖 5 大章节）。

---

**本 plan 实现 v2 spec §9.3（F3 条目）。**
