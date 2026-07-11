# 循环依赖基线（P0.5 完成时）

- **生成时间：** 2026-07-11（P0.5 实施时）
- **工具：** madge 8.0.0
- **命令：** `bunx madge --circular --extensions ts,tsx --ts-config tsconfig.json --json src/`
- **扫描范围：** `src/` 下所有 `.ts` / `.tsx` 文件（madge 通过 tsconfig 解析，自动包含被 `src/` 引用的 `packages/` 文件）
- **tsconfig：** `tsconfig.json`（`baseUrl: src`，`paths` 别名）
- **总循环数（含 packages）：** 2282
- **src-only 循环数：** 361
- **packages-only 循环数：** 55
- **src ↔ packages 混合循环数：** 1866
- **可视化 SVG：** skipped（`dot` 未安装，`brew install graphviz` 后可生成）

> **注：** madge 把 `packages/@ant/ink/`、`packages/builtin-tools/` 等 workspace 包的源文件一并纳入解析，所以"总循环数 2282"远大于"src/ 内部循环 361"。后续 C1/C9 的重构主要关注 **src-only 与 src↔builtin-tools 的混合循环**（因为它们跨边界引用 `src/Tool.ts`）。`packages/@ant/ink/` 内部循环不在本次重构范围（项目规则：不动 Ink 框架）。

## 分类

### 类型 A：工具系统循环（C1 必须优先处理）

这些循环都跨 `src/Tool.ts` 或 `src/tools.ts` 边界，是 C1（工具系统重构）的阻断项。

| # | 循环（简写） | 涉及文件 | 解除方案 |
|---|------|---------|---------|
| A1 | `src/Tool.ts` → `src/tools.ts` → `packages/builtin-tools/.../TeamCreateTool.ts` → `src/Tool.ts` | `src/Tool.ts`、`src/tools.ts`、`packages/builtin-tools/src/tools/TeamCreateTool/TeamCreateTool.ts` | 方案 1（依赖注入）。详见：TeamCreateTool 反向 `import { Tool, buildTool } from 'src/Tool.js'`（文件第 6-7 行），而 `src/tools.ts` 第 71-73 行已用 `require()` 懒加载破环。C1 须把 `Tool` 类型 + `buildTool` 工厂抽到独立的 `src/tools/core.ts`（无业务依赖），让 TeamCreateTool 改 import 该 core 模块。 |
| A2 | `src/Tool.ts` → `src/commands.ts` → `src/commands/<name>/index.ts` → ... → `src/Tool.ts` | `src/Tool.ts`、`src/commands.ts`、~100 个 `src/commands/*/index.ts` 及其下属 `*.tsx`/`*.ts`（add-dir、agents、artifacts、buddy、color、compact、context、doctor、effort、export、files、lang、mcp、permissions、rate-limit-options、rename、review、rewind、summary 等） | 方案 1（依赖注入）。根因：`Tool.ts` re-export 了被 command 实现用的 `Tool` 类型/辅助函数；command 实现又通过 `commands.ts` 注册回 `Tool.ts`。C1 应把 `Tool` 类型与 `buildTool` 工厂拆到 `src/tools/core.ts`，commands 改 import core。**此项循环最多（92 个），是 C1 工程量主要来源**。 |
| A3 | `src/Tool.ts` → `src/utils/hooks.ts` → `src/Tool.ts`（经 `state/AppState.tsx` / `utils/teammate.ts` / `services/analytics/metadata.ts` 等长链） | `src/Tool.ts`、`src/utils/hooks.ts`、`src/state/AppState.tsx`、`src/utils/teammate.ts`、`src/services/analytics/metadata.ts`、`src/memdir/paths.ts` 等 | 方案 2（抽取共享模块）+ 方案 1。根因：`Tool.ts` 被 `utils/hooks.ts` 的 hook 触发链反向引用。C1 应把 `Tool` 类型抽离，使 `utils/hooks.ts` 不再依赖 `src/Tool.ts` 的具体实现。 |
| A4 | `src/Tool.ts` → `src/commands.ts` → `commands/agents/.../agents.tsx` → `components/agents/*` → `state/AppState.tsx` → `hooks/useSettingsChange.ts` → `utils/settings/changeDetector.ts` → `utils/hooks.ts` → `src/Tool.ts` | `src/Tool.ts`、`src/commands.ts`、`src/commands/agents/`、`src/components/agents/`、`src/state/AppState.tsx`、`src/hooks/useSettingsChange.ts`、`src/utils/settings/changeDetector.ts`、`src/utils/hooks.ts` | 方案 1 + 方案 3（事件机制）。C1 完成后（Tool 类型抽离），此循环自然消失。 |
| A5 | `src/Tool.ts` → `src/utils/permissions/permissionSetup.ts` → `src/tools.ts` → builtin-tools → `src/Tool.ts` | `src/Tool.ts`、`src/utils/permissions/permissionSetup.ts`、`src/tools.ts` | 方案 1。`permissionSetup` 直接 import `src/tools.ts`（工具清单），应改为通过参数/接口接收工具清单。 |

**严重度评估：** A 类循环共 **92 + 若干长链**（主要来自 A1+A2），远超 Plan B 触发阈值（>15）。但由于 92 个循环中绝大多数（A2、A4）是**同一根因**（`Tool.ts` 既是类型定义又是命令注册器，commands 反向引用），C1 只需抽离一次 `Tool` 类型/工厂即可批量解除。**建议 C1 仍可执行，但需在 Task 0 显式拆分 `Tool.ts` 为 `Tool.ts`（接口）+ `tools/core.ts`（工厂）+ `tools/registry.ts`（注册）三部分。**

**C1 阻断项清单：**
- **A1（阻断）：** `TeamCreateTool.ts` 反向 `import { Tool, buildTool } from 'src/Tool.js'`（文件第 6-7 行）。C1 必须把 `Tool`/`buildTool` 抽到 core 模块，TeamCreateTool 改 import core 后，才能删除 `src/tools.ts:71-73` 的 `require()` 懒加载。
- **A2（阻断）：** `Tool.ts ↔ commands.ts` 互引。C1 Task 中需要专门步骤把 `Tool` 类型与命令注册器分离。
- **A3（阻断）：** `Tool.ts ↔ utils/hooks.ts` 互引（经 AppState 长链）。C1 Task 中需要专门步骤处理 hook 对 Tool 类型的依赖。
- **A4（阻断）：** A2+A3 的衍生循环，A2/A3 解除后自动消失。
- **A5（阻断）：** `permissionSetup.ts → tools.ts`，C1 Task 中需要把工具清单改为依赖注入。

### 类型 B：query / 核心循环链循环（C9 实施时处理）

这些循环涉及 `src/query.ts` 或 `src/QueryEngine.ts`，是 C9（query/QueryEngine 拆分）的阻断项。

| # | 循环（简写） | 涉及文件 | 解除方案 |
|---|------|---------|---------|
| B1 | `src/query.ts` → `tasks/LocalMainSessionTask.ts` → `tasks/LocalShellTask/LocalShellTask.tsx` → `packages/builtin-tools/.../PowerShellTool.tsx` → `utils/promptShellExecution.ts` → ... → `src/tools.ts` → ... → `src/query.ts` | `src/query.ts`、`src/tasks/LocalMainSessionTask.ts`、`src/tasks/LocalShellTask/LocalShellTask.tsx`、`packages/builtin-tools/src/tools/PowerShellTool/PowerShellTool.tsx`、`src/utils/promptShellExecution.ts`、`src/tools.ts` 等 | 方案 1（依赖注入）+ 方案 2（抽取共享模块）。根因：`query.ts` 被 task 实现反向引用，task 又被 tool 引用，tool 又被 `tools.ts` 注册。C9 应把 query 入口拆为 `query/core.ts`（纯函数）+ `query/runner.ts`（副作用），task 只依赖 core。 |
| B2 | `src/services/api/claude.ts` → `src/services/api/{gemini,grok,openai}/index.ts` → `src/services/api/claude.ts` | `src/services/api/claude.ts`、`src/services/api/gemini/index.ts`、`src/services/api/grok/index.ts`、`src/services/api/openai/index.ts` | 方案 2（抽取共享模块）。`claude.ts`（主 API client）反向 import 各兼容层 adapter，adapter 又依赖 claude.ts 的类型。应抽 `services/api/types.ts` 共享类型层。 |
| B3 | `src/services/claudeAiLimits.ts` → `src/services/api/claude.ts` → `src/services/claudeAiLimits.ts`（经长链） | `src/services/claudeAiLimits.ts`、`src/services/api/claude.ts`、`src/services/mockRateLimits.ts`、`src/utils/auth.ts`、`src/utils/model/model.ts` | 方案 2。`claudeAiLimits` 与 `mockRateLimits` 与 `api/claude` 互相引用。应抽 `services/api/limits.ts`。 |
| B4 | `src/utils/slowOperations.ts` → `src/utils/debug.ts` → `src/utils/slowOperations.ts`（经 `fsOperations.ts`） | `src/utils/slowOperations.ts`、`src/utils/debug.ts`、`src/utils/fsOperations.ts` | 方案 2。`slowOperations`（JSON stringify 等性能工具）与 `debug.ts` 互引。应抽 `utils/fs/debugFs.ts`。 |

**严重度评估：** B 类循环共约 487（query.ts 参与的循环）。大部分是 B1 的衍生（query.ts 作为主循环入口被长链引回）。C9 需重点处理 B1 的拆分，其余 B2/B3/B4 可独立处理。

### 类型 C：services / utils 循环（不在本次范围）

这些循环不阻断 C1/C9，记录但不处理。

| # | 循环 | 涉及文件 | 备注 |
|---|------|---------|------|
| C1 | `src/utils/file.ts` ↔ `src/utils/fileReadCache.ts` | 2 文件 | file 读缓存互引，低优 |
| C2 | `src/utils/log.ts` → `src/types/logs.ts` → `src/utils/fileHistory.ts` → `src/utils/log.ts` | 3 文件 | 日志类型循环 |
| C3 | `src/utils/log.ts` → `src/types/logs.ts` → `src/utils/toolResultStorage.ts` → `src/utils/log.ts` | 3 文件 | 工具结果存储循环 |
| C4 | `src/utils/git.ts` ↔ `src/utils/detectRepository.ts`、`src/utils/git/gitFilesystem.ts` | 3 文件 | git 工具互引 |
| C5 | `src/utils/config.ts` → `src/utils/model/modelOptions.ts` → `src/utils/model/antModels.ts` → `src/utils/effort.ts` → `src/utils/thinking.ts` → ... → `src/utils/config.ts` | 5+ 文件 | 模型配置循环 |
| C6 | `src/utils/model/modelOptions.ts` → `src/utils/modelCost.ts` → `src/utils/fastMode.ts` → `src/utils/model/modelOptions.ts` | 3 文件 | 模型成本/快速模式循环 |
| C7 | `src/services/PromptSuggestion/speculation.ts` ↔ `src/services/PromptSuggestion/promptSuggestion.ts` | 2 文件 | Prompt 建议互引 |
| C8 | `src/services/mcp/utils.ts` ↔ `src/services/mcp/config.ts` | 2 文件 | MCP 配置循环 |
| C9 | `src/services/skillLearning/skillGenerator.ts` ↔ `src/services/skillLearning/skillLifecycle.ts` | 2 文件 | skill 学习循环 |
| C10 | `src/services/skillLearning/sessionObserver.ts` ↔ `src/services/skillLearning/llmObserverBackend.ts` | 2 文件 | skill 观察者循环 |
| C11 | `src/services/tools/toolExecution.ts` ↔ `src/services/tools/toolHooks.ts` | 2 文件 | 工具执行/hook 循环 |
| C12 | `src/services/analytics/growthbook.ts` → `src/services/analytics/firstPartyEventLogger.ts` → ... → `src/services/analytics/metadata.ts` → `src/services/analytics/growthbook.ts`（经长链） | 4+ 文件 | analytics 内部循环 |
| C13 | `src/utils/teammate.ts` → `src/state/AppState.tsx` → `src/hooks/useSettingsChange.ts` → `src/utils/settings/changeDetector.ts` → `src/utils/hooks.ts` → `src/Tool.ts` → ... → `src/utils/teammate.ts`（长链） | 5+ 文件 | teammate ↔ AppState 循环（A 类衍生） |
| C14 | `src/utils/plugins/pluginLoader.ts` → `installedPluginsManager.ts` → `marketplaceManager.ts` → `cacheUtils.ts` → `loadPlugin{Agents,Commands,OutputStyles}.ts` → `pluginLoader.ts` | 5+ 文件 | 插件加载器循环 |
| C15 | `src/utils/plugins/marketplaceManager.ts` ↔ `src/utils/plugins/marketplaceHelpers.ts` | 2 文件 | marketplace 互引 |
| C16 | `src/utils/swarm/backends/registry.ts` ↔ `backends/{ITermBackend,TmuxBackend,WindowsTerminalBackend,InProcessBackend,PaneBackendExecutor}.ts` | 5+ 文件 | swarm backend 注册循环 |
| C17 | `src/utils/swarm/spawnInProcess.ts` → `teamHelpers.ts` → `backends/registry.ts` → `backends/InProcessBackend.ts` → `spawnInProcess.ts` | 4 文件 | swarm 进程内 spawn 循环 |
| C18 | `src/utils/udsMessaging.ts` ↔ `src/utils/udsResponseReader.ts` | 2 文件 | UDS 消息循环 |
| C19 | `src/utils/processUserInput/processUserInput.ts` ↔ `processBashCommand.tsx`、`processSlashCommand.tsx` | 3 文件 | 用户输入处理循环 |
| C20 | `src/utils/hooks/sessionHooks.ts` ↔ `src/utils/hooks/hooksSettings.ts` | 2 文件 | hook 设置循环 |
| C21 | `src/utils/hooks.ts` ↔ `src/utils/hooks/execAgentHook.ts`、`execPromptHook.ts` | 3 文件 | hook 执行循环 |
| C22 | `src/hooks/toolPermission/permissionLogging.ts` ↔ `src/hooks/toolPermission/PermissionContext.ts` | 2 文件 | 工具权限日志循环 |
| C23 | `src/utils/nativeInstaller/installer.ts` ↔ `src/utils/nativeInstaller/download.ts` | 2 文件 | 原生安装循环 |
| C24 | `src/skills/loadSkillsDir.ts` ↔ `src/skills/mcpSkillBuilders.ts` | 2 文件 | skill 加载循环 |
| C25 | `src/tasks/DreamTask/DreamTask.ts` → `src/utils/task/framework.ts` → `src/tasks/types.ts` → `src/tasks/DreamTask/DreamTask.ts` | 3 文件 | task 框架循环 |
| C26 | `src/utils/task/framework.ts` → `src/tasks/types.ts` → `tasks/{LocalWorkflowTask,MonitorMcpTask,RemoteAgentTask}/...` → `src/utils/task/framework.ts` | 4+ 文件 | task 注册循环 |
| C27 | `src/utils/stats.ts` ↔ `src/utils/statsCache.ts` | 2 文件 | 统计缓存循环 |
| C28 | `src/memdir/memdir.ts` ↔ `src/memdir/teamMemPrompts.ts` | 2 文件 | memdir 循环 |
| C29 | `src/constants/outputStyles.ts` → `src/outputStyles/loadOutputStylesDir.ts` → `src/utils/plugins/loadPluginOutputStyles.ts` → ... → `src/constants/outputStyles.ts` | 3+ 文件 | output style 循环 |
| C30 | `src/utils/attachments.ts` ↔ `src/buddy/prompt.ts` | 2 文件 | buddy 循环 |
| C31 | `src/utils/ide.ts` ↔ `src/components/IdeOnboardingDialog.tsx`、`src/services/mcp/client.ts`、`src/utils/jetbrains.ts` | 4 文件 | IDE 循环（含 components，但根因在 utils/ide.ts） |
| C32 | `src/utils/searchExtraTools.ts` ↔ `src/utils/analyzeContext.ts` | 2 文件 | 工具搜索循环 |
| C33 | `src/types/plugin.ts` → `src/skills/bundledSkills.ts` → `src/types/command.ts` → `src/types/plugin.ts` | 3 文件 | 类型循环 |
| C34 | `src/utils/bash/registry.ts` ↔ `src/utils/bash/specs/{alias,nohup,pyright,sleep,srun,time,timeout}.ts`（经 `specs/index.ts`） | 8+ 文件 | bash spec 注册循环 |
| C35 | `src/workflow/service.ts` ↔ `src/workflow/notifications.ts` | 2 文件 | workflow 循环 |
| C36 | `src/state/AppState.tsx` ↔ `src/utils/settings/applySettingsChange.ts`、`src/hooks/useSettingsChange.ts` ↔ `src/utils/settings/changeDetector.ts` ↔ `src/utils/hooks.ts` | 4 文件 | 设置变更循环 |
| C37 | `src/dialogLaunchers.tsx` → `src/interactiveHelpers.tsx` → `src/main.tsx` → `src/dialogLaunchers.tsx` | 3 文件 | 主入口循环 |

**类型 C 总计：约 37 个独立循环簇（去重后）。**

### 类型 D：UI 组件循环（不动，src/components/ 保持原样）

项目规则明确 `src/components/` 不动。这些循环记录但不处理。

| # | 循环 | 备注 |
|---|------|------|
| D1 | `components/Messages.tsx` ↔ `components/MessageRow.tsx` | 消息渲染 |
| D2 | `screens/REPL.tsx` → `components/Messages.tsx` → `components/MessageRow.tsx` → `screens/REPL.tsx` | REPL 主循环 |
| D3 | `screens/REPL.tsx` ↔ `hooks/{useCancelRequest,useGlobalKeybindings}.ts(x)` | REPL hook |
| D4 | `components/permissions/PermissionRequest.tsx` ↔ `components/permissions/{AskUserQuestion,Bash,SedEdit,FileEdit,FileWrite,Filesystem,Monitor,NotebookEdit,PowerShell,ReviewArtifact,Skill,WebFetch,EnterPlanMode,Fallback}PermissionRequest/*.tsx` | 14+ 文件，权限请求分发 |
| D5 | `components/permissions/PermissionRequest.tsx` → `workflow/WorkflowPermissionRequest.tsx` | workflow 权限 |
| D6 | `hooks/useCanUseTool.tsx` → `components/permissions/PermissionRequest.tsx` → `workflow/wiring.ts` → `workflow/service.ts` → `hooks/useCanUseTool.tsx` | 工具权限循环 |
| D7 | `components/CustomSelect/select.tsx` ↔ `use-select-input.ts` ↔ `use-select-state.ts` ↔ `use-select-navigation.ts` ↔ `select-input-option.tsx` | CustomSelect 内部 |
| D8 | `components/FullscreenLayout.tsx` ↔ `components/VirtualMessageList.tsx` | 全屏布局 |
| D9 | `components/Message.tsx` → `components/CompactSummary.tsx` → `screens/REPL.tsx` → `components/Messages.tsx` → `components/MessageRow.tsx` | 消息展示 |
| D10 | `commands/effort/effort.tsx` ↔ `components/EffortPanel/EffortPanel.tsx` | effort 面板 |
| D11 | `commands/tui/index.ts` ↔ `commands/tui/panel.tsx` | TUI 面板 |
| D12 | `commands/break-cache/index.ts` ↔ `commands/break-cache/panel.tsx` | break-cache 面板 |
| D13 | `components/PromptInput/inputModes.ts` ↔ `hooks/useArrowKeyHistory.tsx` | 输入模式 |
| D14 | `components/Spinner.tsx` ↔ `components/Spinner/TeammateSpinnerTree.tsx` | spinner |
| D15 | `components/TeleportError.tsx` ↔ `components/ConsoleOAuthFlow.tsx` | teleport 错误 |

**类型 D 总计：约 50+ 循环（含 packages/@ant/ink/ 内部 55 个循环，不在 src/ 范围）。**

## 解除方案模板

### 方案 1：依赖注入

适用：A 类（Tool.ts ↔ TeamCreateTool / commands.ts）、B1（query.ts ↔ tasks）

**当前：**
```
src/tools.ts:71-73: const getTeamCreateTool = () => require('...TeamCreateTool.js')  // 懒加载破环
packages/builtin-tools/.../TeamCreateTool.ts:
  import { Tool, buildTool } from 'src/Tool.js'  // 反向引用（第 6-7 行）
```

**目标：**
- 抽离 `Tool` 类型 + `buildTool` 工厂到 `src/tools/core.ts`（无任何业务 import）
- `TeamCreateTool.ts` 改为 `import { Tool, buildTool } from 'src/tools/core.js'`
- `src/Tool.ts` re-export core 的内容以保持向后兼容
- `src/tools.ts` 删除 `require()` 懒加载，改为正常 `import`

**步骤：** C1 Task N 中实施。

### 方案 2：抽取共享模块

适用：两个文件互相 import 同一个 helper / type

**当前：** A ↔ B 都 import `validateTool()` / 共享类型，定义在 A 中
**目标：** 抽 `validateTool` 或类型到 `core/validation.ts` 或 `types/shared.ts`，A 和 B 都依赖 core

**适用项：** B2（api/claude.ts ↔ api/gemini/grok/openai）、B3（claudeAiLimits ↔ api/claude）、B4（slowOperations ↔ debug）、C5/C6（model 配置）、C14（plugins）

### 方案 3：事件机制

适用：UI 组件 ↔ 业务逻辑循环

**当前：** Component ↔ Service 互引
**目标：** Service emit 事件，Component subscribe

**适用项：** D6（useCanUseTool ↔ PermissionRequest）、A4（AppState ↔ Tool）

## 验证

C1 完成后跑 `bunx madge --circular --extensions ts,tsx --ts-config tsconfig.json src/`，预期：
- A 类循环数（涉及 `Tool.ts` 的 src-only 短循环）从 92 → **0**
- 总 src-only 循环数从 361 → **< 270**（A 类消除后，部分 C 类长链也会消失）

C9 完成后跑同样命令，预期：
- B 类循环数（涉及 `query.ts` 的循环）从 487 → **0**
- 总循环数进一步下降

**Plan B 触发条件：** 若 A 类循环在 C1 实施后仍 > 5 个，或 C9 实施后 B 类仍 > 10 个，需暂停并与用户重新评估。
