# Dispatcher 闭包变量分析（H2）

> 本文件为 C6（`cli/dispatcher/` 拆分）的前置分析，对应 plan `15-c6-dispatcher-split.md` Task 1。
> 实际扫描源：`src/main.tsx` 行 1069-4083（`const defaultAction = async (...) => { ... }`，~3014 行）。

**扫描方式：** `sed -n '1069,4083p' src/main.tsx | grep -oE "(const|let|var) [a-zA-Z_][a-zA-Z0-9_]*"`。
共 288 条声明，去重后约 90+ 个不同变量名（多作用域重名如 `result`、`sig`）。

> **重要偏差说明：** plan 文件假设 `defaultAction` 在 main.tsx 行 1434-4464（基于 5674 行的 main.tsx）。
> 当前 main.tsx 经 C4/C5 后为 4599 行，`defaultAction` 实际位于 1069-4083（~3014 行）。行号整体前移约 365 行。
> 本分析按**实际代码**而非 plan 的行号进行。

## 启动期（进程级，保留在 bootstrap/ 内部，不进 DispatcherContext）

这些变量在 `defaultAction` 顶部一次性初始化，供后续所有阶段共享，但本质是"启动副作用产物"——
C7 会把它们迁到 `cli/bootstrap/` 各模块内部，`DispatcherContext` 不持有引用（通过 getter/全局访问）。

| 变量 | 用途 | 后续阶段 |
|------|------|---------|
| `kairosEnabled` | Assistant mode gate（GrowthBook latch） | 多处 |
| `assistantTeamContext` | 预初始化的 teammate team | system prompt / REPL |
| `fileDownloadPromise` | 文件下载 promise（早启动晚 await） | REPL 启动前 |
| `agentsJson` / `agentCli` | agent 配置/CLI 标识 | 全程 |
| `verbose` | 全局 verbose 开关 | 全程 |
| `print` | `-p` prompt | headless 分支 |
| `init` / `initOnly` / `maintenance` | 一次性初始化模式 | bootstrap 分支 |
| `disableSlashCommands` | 禁用 slash 命令 | REPL |
| `tasksOption` / `taskListId` | tasks 模式（ant-only） | REPL |
| `worktreeOption` / `worktreeName` / `worktreeEnabled` / `worktreePRNumber` | worktree 配置 | bootstrap/REPL |
| `tmuxEnabled` | tmux 集成 | REPL |
| `storedTeammateOpts` | teammate 身份选项 | system prompt/REPL |

**结论：** ~15 个，符合 plan 预期。

## 请求期（单次 action，进 DispatcherContext）

被 2 个以上子模块使用的"请求期"变量。严格按 H2 原则筛选。

| 字段 | 类型 | 来源 | 使用子模块 |
|------|------|------|-----------|
| `options` | `NormalizedOptions` | normalize 后的 raw options | 全部 |
| `permissionCtx` | `ToolPermissionContext` | setupPermissions | session-restore/headless/repl |
| `sessionId` | `string` | 自动生成或 `--resume` 指定 | bootstrap/session-restore/headless/repl |
| `cwd` | `string` | `process.cwd()` | bootstrap/permissions/headless/repl |
| `prompt` | `string \| undefined` | `.argument('[prompt]')` 或 stdin | headless/repl |
| `isHeadless` | `boolean` | `-p` / 非 TTY | fast-paths/headless/repl |
| `isResume` | `boolean` | `--resume` | session-restore |
| `isContinue` | `boolean` | `--continue` | session-restore |
| `worktree` | `{enabled, branch?}` | `--worktree` | bootstrap/repl |
| `tmux` | `boolean` | `--tmux` | repl |
| `mcpServers` | `unknown[]` | MCP 连接 | bootstrap/repl |
| `modelOverride` | `string` | `--model` | permissions/headless/repl |
| `allowedTools` | `string[]` | `--allowedTools` | permissions/repl |
| `disallowedTools` | `string[]` | `--disallowedTools` | permissions/repl |
| `maxTurns` | `number` | `--max-turns` | headless |
| `permissionMode` | `string` | `--permission-mode` / `--dangerously-skip-permissions` | permissions/headless/repl |
| `addDirs` | `string[]` | `--add-dir` | bootstrap/repl |
| `inputFormat` | `string` | `--input-format` | headless |
| `outputFormat` | `string` | `--output-format` | headless |

**字段数：19**（<= 20 硬上限）。符合 v2 spec §6.2 约束。

## 临时（子模块内部，不共享）

这些变量只在单个分支或单次使用，应保留在子模块内部（通过参数传递而非 context 共享）。

**bootstrap 内部：**
- `policySettings`, `trimmedSettings`, `settingsPath`, `loaded` —— settings 加载临时态
- `apiCreds` —— API 凭证拉取（一次性）
- `configs`, `nonPluginConfigs`, `nonSdkConfigNames`, `scopedConfigs` —— 配置校验
- `errors`, `allErrors`, `reservedNameError`, `bad` —— 校验错误收集
- `formattedErrors`, `failedCount` —— 错误展示

**session-restore 内部：**
- `resumeStart`, `validatedSessionId`, `targetSessionId`, `sessionData`, `session`, `createdSession`, `sessions`, `sessionRepo`, `repoValidation` —— 会话加载临时态

**headless 内部：**
- `initialUserMessage`, `hasInitialPrompt`, `customPrompt`, `mergePrompt`, `syntheticOutputResult`, `parsedResult` —— headless 输入构造与渲染
- `isTTY`, `chunks`, `trimmedValue` —— stdin 读取

**repl 内部：**
- `sessionConfig`, `remoteSessionConfig`, `remoteCommands`, `remoteInfoMessage`, `remoteInitialState`, `isRemoteTuiEnabled`, `remoteSessionUrl` —— REPL 配置
- `deepLinkBanner`, `hookMessages`, `initialMessages`, `pendingHookMessages` —— 消息初始化
- `assistantInitialState`, `assistantAddendum`, `agentSystemPrompt`, `systemPrompt`, `addendum` —— system prompt 构造
- `picked`, `choice`, `hint`, `suppressed`, `results`, `matches`, `at`, `rest` —— UI 交互临时
- `renderingState`, `fpsMetrics`, `stats`, `initialState`, `root` —— React 渲染状态

**worktree/teammate 内部：**
- `teleport`, `teleportResult`, `currentBranch`, `installedDir`, `hadProgress`, `code` —— worktree/git 操作
- `teammateUtils`, `parsedAgents`, `agentDef`, `ids` —— agent 解析

**feature-gate 内部：**
- `briefVisibility`, `thinkingEnabled`, `thinkingConfig`, `userSpecifiedModel`, `userSpecifiedFallbackModel`, `advisorOption`, `normalizedAdvisorModel`, `customInstructions`, `typedConfig`, `uploaderReady`, `strictMcpConfig`, `disabledReason` —— feature flag 临时变量

**辅助一次性：**
- `result`, `sig`, `code`, `c`, `to`, `filePath`, `fullPath`, `configPath`, `config`, `hint`, `logOption`, `knownPaths`, `existingPaths`, `selectedPath`, `resolvedPath`, `nextCtx`, `nonPluginConfigs`, `scopedConfigs`, `getAccessTokenForRemote`, `claudeaiSigs`, `orgValidation`, `CLAUDE_AI_MCP_TIMEOUT_MS`

**结论：** ~55+ 个临时变量，分布合理。

## 跨阶段闭包依赖警告（Task 11 删除前必须解决）

以下变量在 `defaultAction` 内部跨"阶段"使用，若直接删除主体并拆分会破坏行为：

1. **`storedTeammateOpts` / `kairosEnabled` / `assistantTeamContext`**：在顶部初始化，但在 ~2500 行后的 system prompt 构造处使用。拆分时必须通过 `DispatcherContext` 或参数显式传递。
2. **`fileDownloadPromise`**：顶部启动 promise，在 REPL 启动前 await。必须通过 context 或 return-value 桥接异步生命周期。
3. **`toolPermissionContext`**：在 permissions 阶段构造，在 headless/repl 使用。已纳入 `DispatcherContext.permissionCtx`。
4. **`sessionConfig`**：session-restore 阶段填充，repl 阶段消费。需通过 context 传递（当前 19 字段已满，需评估是否替换某些字段）。
5. **`mcpConfig` / `agentsJson`**：从 options 解构，但被多处修改。规范化时应深拷贝避免共享可变状态。

## 风险评估

| 风险 | 严重度 | C6 阶段缓解 |
|------|--------|------------|
| 行号偏移（plan 假设 1434-4464，实际 1069-4083） | 中 | 本分析按实际行号，后续 task 按"语义边界"而非"行号"定位 |
| 288 个变量声明、~90+ 唯一变量 | 极高 | H2 分组严格筛选；DispatcherContext 19 字段 |
| 30+ 处 `process.exit` 散落各阶段 | 极高 | 每个 exit 必须迁到对应子模块；删除主体前必须验证 |
| `setup()` 返回值被多处闭包捕获 | 高 | 暂不拆 setup，C7 统一处理 |
| feature flag 分支（KAIROS/ULTRATHINK 等） | 高 | 保留 feature() 调用在子模块内部，不外提 |

**总结：** 闭包变量可按 H2 三组分类，`DispatcherContext` 19 字段符合 <=20 硬上限。
但 Task 11（删除 main.tsx 3014 行主体）需要逐行迁移 30+ 个 `process.exit` 与 ~15 个跨阶段闭包，
风险极高。建议 C6 先完成 Task 1-10（模块创建 + index 协调入口），
Task 11（主体删除）与 Task 12（行数断言测试）作为 C6 的"高风险尾段"单独验证或触发 Plan B。
