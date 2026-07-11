# 架构迁移设计：分层 + 注册器（方案 A）· v3.1

- **日期**：2026-07-11
- **状态**：部分已实施（C1/C2/C3+C8/C4/C5/C9/C10 完成；C6 按 Plan C-2 完成——runner.ts 单文件方案；C7 按 Plan C 调整——main.tsx 永久保留）
- **范围**：`src/main.tsx` 拆分 + 工具系统统一 + 命令自动注册 + query/engine 拆分
- **修订记录**：
  - **v1**（2026-07-11 初稿）：基础设计 6 节
  - **v2**（2026-07-11 同日）：根据 4 视角对抗审查 + verification agent 数据交叉核对，修正 3 个致命错误（F1-F3）、8 个高危项（H1-H8）、7 个中危项（M1-M7）、4 个低危改进（L1-L4），并校正行数估算（feature() 实际 214 文件、toolExecution.ts 实际 1831 行等）
  - **v3**（2026-07-12）：根据 C6/C7 实施反馈与用户决策，新增 **Plan C：main.tsx 永久保留**。C6（dispatcher 拆分）已完成，dispatcher/runner.ts 承接 defaultAction；C7（bootstrap 迁出 + 删除 main.tsx）**不再执行**——main.tsx 作为永久运行时入口保留，cli.tsx 的延迟加载 `main.jsx` 模式正式化。修订 §3.1、§3.3.4、§6.4、§6.5、§9.2 C7、§9.3、§13.1 中所有"main.tsx 删除"表述。新增 §6.6 决策段落。
  - **v3.1**（2026-07-12 同日追加）：新增 **Plan C-2：dispatcher/runner.ts 单文件方案**。正式承认 `cli/dispatcher/runner.ts`（3874 行）为永久方案，放弃 H2「10 子模块 × 200-400 行」拆分承诺。C6 实施产物为单文件 runner.ts + 12 个骨架子模块（各 33-96 行仅作类型/入口/小工具），不再要求把 runner.ts 强行拆到骨架子模块中。修订 §3.1、§6.1、§6.2、§6.5、§9.2 C6、§10.1、§11 中所有引用 H2「10 子模块」拆分承诺的段落。详见 §6.7。

## 0. v1 → v2 主要变更摘要

| 严重度 | 项目 | v1 错误 | v2 修正 |
|--------|------|---------|---------|
| ☠️ F1 | 命令自动扫描机制 | `globSync + require()` 运行时扫描，Bun 代码分割构建后产物中无源码目录，方案不可行 | 改为 **build.ts 编译期代码生成**：扫描 `commands/<category>/<name>/index.ts`，生成 `commands/_registry/generated.ts`（静态 import 数组） |
| ☠️ F2 | feature() 散布规模 | 声称"10+ 处 → 1 处边界"，实际 **214 文件** 100+ 处调用 | **缩窄 feature-gate 边界 scope**：只覆盖**工具注册级**（约 15 处，可边界化）；UI/engine 中的**功能级**调用（REPL.tsx 70 处等）不在本设计范围 |
| ☠️ F3 | entrypoints/cli.tsx 依赖约束 | §3.2 "不可依赖任何业务模块" vs §6.4 `program.action(handleDefaultAction)` 自相矛盾 | 放宽 §3.2：`cli.tsx` 可依赖 `cli/dispatcher`，删除"不可依赖任何业务模块"表述 |
| 🔴 H1 | 生成器 yield 委托模式 | §7.4/§7.5 列 15 子模块未标返回类型与委托模式 | 为每个子模块明确标注：`AsyncGenerator`→`yield*`、`Promise<T>`→`await`、`boolean`→普通调用 |
| 🔴 H2 | 90+ 闭包变量传递 | §6.2 `dispatcher/index.ts` 只展示协调函数，闭包变量打包有上帝对象陷阱 | 增加变量生命周期分组策略（启动期 / 请求期 / 全局），只跨模块传真正需要共享的。**⚠️ v3.1 / Plan C-2 已废弃此策略**（见 §0.1、§6.7）：H2 拆分承诺被 runner.ts 单文件方案取代。 |
| 🔴 H3 | 循环依赖 require() transimport | `tools.ts:69` 用 `require()` 打破循环，迁移后能否工作未验证 | 增加 **P0.5 前置步骤**：`bunx madge --circular src/` 绘制依赖图，C1 优先处理循环 |
| 🔴 H4 | shim 双写窗口期 14 PR | 与 §9 "不留兼容期双写"承诺矛盾 | **缩短窗口期**：C2 完成后立即删 shim（不等 F1），窗口从 14 PR → 1 PR |
| 🔴 H5 | getTools sync→async 影响面 | §12 "不改 React 组件" vs `getTools()` 影响 REPL.tsx、QueryEngine.ts | 放宽 §12：REPL.tsx 中 getTools 调用 + QueryEngine.ts（C10 本就要改）需要相应修改 |
| 🔴 H6 | C3→C1、C4→C2 虚假依赖 | 实际无耦合 | 简化依赖图，C2/C3 可并行 |
| 🔴 H7 | C6 单点阻塞 | 无 Plan B | 加 fallback：跳过 C6/C7/C8，先做 C9/C10 |
| 🔴 H8 | C8 "纯 git mv" | import 路径全要改 | 合并 C3+C8 为原子 PR |
| 🟡 M1 | tools 内部依赖拓扑缺失 | §3.2 遗漏 tools/presets、tools/shared | 补充 tools 内部依赖方向图 |
| 🟡 M2 | 编译期类型安全 | `require()` 动态加载无 tsc 检查 | 随 F1 修复自动解决 |
| 🟡 M3 | submit-message 仍是模块级上帝 | 措辞夸大 | 调整为"物理拆分降低单文件行数，不是消除协调节点" |
| 🟡 M4 | category 字段 DRY 违反 | spec.category 既要声明又要校验路径 | 删除 category 字段，扫描器从路径推导 |
| 🟡 M5 | `commands/session/` 命名冲突 | 现有 session 命令与新分组容器同名 | 重命名为 `commands/session-info/`，并入 `commands/ui/` 分组 |
| 🟡 M6 | fast-paths 双重定义 | §3.1 和 §6.2 都有 | 统一为 `cli/fast-paths.ts` 一处 |
| 🟡 M7 | Bridge/Daemon 快速路径遗漏 | §6.1 只覆盖 main.tsx 行号 | 补充 cli.tsx 自身的 bridgeMain/daemonMain 处理说明 |
| 🔵 L1 | 30 文件认知成本 | 过度拆分 | 提供 5-8 文件中等粒度备选方案 |
| 🔵 L2 | feature-gate 三处维护静默失败 | 工具未加载无报错 | feature-gate.ts 加运行时断言 |
| 🔵 L3 | ROI 缺失 | 主要卖点"零改中央注册"对反编译项目收益低 | §13 补 ROI 分析，重新定位主要卖点为"可单测模块数 30→80" |
| 🔵 L4 | 生成器拆分无 MVP | 一次全量拆分风险高 | C9 前做 MVP（拆 1-2 个 yield 块验证） |
| 数据 | 行数估算偏低 | toolExecution.ts 我说 700+，实际 1831 | 修正全表 |
| 数据 | feature() 散布规模 | 我说 10+，实际 214 文件 | 修正所有提及处 |

### 0.1 v3 / v3.1 架构决策追加（2026-07-12）

本表仅记录 v2 之后的架构决策变更，详细理由见 §6.6（Plan C）与 §6.7（Plan C-2）。

| 决策 | 影响 | 涉及章节 | 状态 |
|------|------|---------|------|
| **Plan C：main.tsx 永久保留**（v3） | C7 不再执行；main.tsx 不删除；cli.tsx 延迟加载 main.jsx 模式正式化；cli.tsx 行数上限放宽到 400 | §3.1、§3.3.4、§6.4、§6.5、§9.2 C7、§9.3、§13.1 | 已记录（§6.6） |
| **Plan C-2：dispatcher/runner.ts 单文件方案**（v3.1） | H2「10 子模块 × 200-400 行」承诺废弃；C6 产物形态变更为 runner.ts（3874 行）+ 骨架子模块（各 33-96 行）；不再要求强行拆分 | §3.1、§6.1、§6.2、§6.5、§9.2 C6、§10.1、§11、§0 H2 行 | 已记录（§6.7） |

---

## 1. 背景与动机

本项目是反编译版的 Claude Code CLI，长期演化过程中出现了几个明显的"引力源"——所有路径都被吸到几个上帝文件里：

- `src/main.tsx`（**5640 行**）—— Commander 命令注册、主 `.action()` 处理器、bootstrap 副作用全部堆在一起。
- `src/query.ts`（2057 行）+ `src/QueryEngine.ts`（1365 行）—— 共 3422 行的核心循环与编排器，职责重叠。
- `src/Tool.ts`（802）+ `src/tools.ts`（422）+ `src/constants/tools.ts`（179）+ `src/services/tools/`（**3263 行**，v1 误估为"~1900"，含 `toolExecution.ts` 1831、`toolHooks.ts` 665、`StreamingToolExecutor.ts` 560、`toolOrchestration.ts` 207）+ `src/services/searchExtraTools/` + `packages/builtin-tools/` —— 工具系统横跨 6 处，注册/装配/执行/发现没有清晰边界。
- `src/commands/`（**144 个平铺目录**）+ `src/commands.ts`（850 行手动 import + 中央数组）—— 命令分类信息散落在中央文件。
- `feature()` 调用散布在 **214 个文件** 中（v1 误估为"10+ 处"），其中工具注册相关约 15 处、UI 相关约 120 处（REPL.tsx 单文件 70 处）、其他业务约 80 处。

新增命令/工具都要改中央文件，业务代码与 `bun:bundle` 直接耦合，单元测试被迫大量 mock。

## 2. 目标

**核心目标：**
1. `main.tsx` 拆为多个 50-400 行的单一职责文件。
2. 工具系统从 5+ 处合并为 `tools/` 下清晰分层。
3. 命令通过**编译期生成的静态注册表**注册，新增零改中央文件。
4. **工具注册级** `feature()` 调用边界化到单一模块（注意：UI/业务功能级 feature 调用不在本设计范围，详见 §3.3）。
5. `query/` + `engine/` 强制三层单向依赖。

**不可动边界：**
- 外部 CLI 行为（所有 flag/subcommand 名称、输出格式、build 产物功能）100% 不变。
- `feature()` 机制本身保留（Bun 编译器限制是硬约束）。
- 构建产物行为不变（`bun run build` / `bun run build:vite` 输出对终端用户不可见差异）。

**可动范围：**
- workspace packages 布局、路径别名、目录组织、文件职责切分。
- `entrypoints/cli.tsx` 中的 fast-path 调度（行为不变，但代码需重组）。
- `REPL.tsx` 中 `getTools()` 调用点（H5 强制要求）。
- `QueryEngine.ts` 全文（C10 本就要拆）。

## 3. 整体架构（方案 A：分层 + 注册器）

### 3.1 目标目录树（变化的顶层）

```
src/
├── entrypoints/
│   ├── cli.tsx                  # 极薄真入口（<200 行），只做 dispatch
│   ├── init.ts                  # 一次性 init
│   └── sdk/
├── cli/                         # 从 main.tsx 5640 行拆出
│   ├── program/                 # Commander 实例 + 全局 option
│   ├── dispatcher/              # 主 .action() 处理器（v3.1 / Plan C-2：runner.ts 单文件 + 骨架子模块，详见 §6.7）
│   ├── subcommands/             # CLI subcommand 注册（编译期生成 + 扫描）
│   ├── bootstrap/               # 启动副作用集中点
│   ├── fast-paths.ts            # 唯一 fast-paths 模块（含 bridge/daemon）
│   └── __tests__/
├── commands/                    # 144 个平铺 → 主题分组 + 编译期生成注册表
│   ├── _registry/
│   │   ├── types.ts             # CommandSpec 类型
│   │   ├── generated.ts         # 【构建产物】build.ts 扫描生成，静态 import 数组
│   │   ├── registry.ts          # 注册器实现
│   │   └── scanner.ts           # 构建期扫描脚本（也被 build.ts 调用）
│   ├── _shared/
│   ├── session-info/            # 重命名：原 commands/session/（避免与新分组容器冲突）
│   ├── session/                 # 会话生命周期分组：clear / resume / rewind / fork / ...
│   ├── mcp/
│   ├── model/
│   ├── config/
│   ├── memory/
│   ├── skills/
│   ├── plugins/
│   ├── tasks/
│   ├── ui/
│   ├── debug/
│   ├── review/
│   ├── version/
│   ├── files/
│   ├── bridge/
│   ├── daemon/
│   └── _misc/
├── tools/                       # 统一散落 5 处的工具系统
│   ├── core/
│   ├── registry/
│   │   ├── registry.ts
│   │   ├── feature-gate.ts      # 工具注册级 feature 边界（仅工具相关 ~15 处）
│   │   ├── assembler.ts
│   │   ├── whitelists.ts
│   │   ├── agent-policy.ts
│   │   └── filter.ts
│   ├── presets/
│   ├── execution/
│   ├── discovery/
│   ├── builtin/
│   └── shared/
├── query/                       # 拆分 src/query.ts + src/QueryEngine.ts
│   ├── api.ts
│   ├── stream/
│   ├── loop/
│   ├── engine/
│   ├── params.ts
│   ├── types.ts
│   └── ask.ts
├── (保持不变)
├── screens/
├── components/
├── services/
├── state/
├── utils/
├── bootstrap/
├── bridge/
├── daemon/
└── ...
```

`src/main.tsx` ~~删除~~ **永久保留**（v3 / Plan C 决策，详见 §6.6）。cli.tsx 通过延迟加载 `await import('../main.jsx')` 调用 `main()`，此模式正式化为运行时入口契约。

### 3.2 模块职责矩阵（边界契约）—— v2 修订

| 模块 | 职责 | 不可依赖 | 可依赖 |
|------|------|---------|--------|
| `entrypoints/cli.tsx` | argv 解析 + dispatch + fast-path 调度 | **业务实现细节**（如 query/tools 业务逻辑直接调用） | `cli/fast-paths`、`cli/program`、`cli/dispatcher`（F3 放宽：dispatcher 是合理根依赖） |
| `cli/program/` | Commander 装配 + 全局 option | 业务命令实现 | `commands/_registry`、`cli/bootstrap`、`commander` |
| `cli/dispatcher/` | 默认 `.action()` 主路径 | 工具/命令实现细节 | `query/`、`tools/registry`、`screens/`、`state/` |
| `cli/bootstrap/` | 启动副作用 | 业务逻辑 | `services/auth`、`services/mcp`、`utils/telemetry` |
| `cli/subcommands/` | CLI subcommand 注册 | 其他 subcommand | `commander`、命令实现 |
| `commands/_registry/` | CommandSpec 类型 + 注册 API | 任何具体命令 | 仅类型 |
| `commands/<topic>/<name>/` | 单个命令的定义与处理 | 其他命令 | `_registry`、`_shared`、`utils/*`、`services/*` |
| `tools/core/` | Tool 类型 + 生命周期契约 | 注册器、具体工具 | 仅类型与 utils |
| `tools/registry/` | 工具注册 + 白名单 + feature gate | 具体工具实现 | `tools/core`、`bun:bundle`（边界） |
| `tools/presets/` | preset 配置 | 工具执行 | `tools/core`（类型） |
| `tools/discovery/` | TF-IDF + 延迟加载 + prefetch | 具体工具实现 | `tools/core`、`tools/registry`、`tools/shared`、`utils/localSearch` |
| `tools/execution/` | 工具运行时（runToolUse/hooks/orchestrator）| 具体工具实现 | `tools/core`、`tools/registry`、`tools/shared`、hooks |
| `tools/builtin/` | 内置工具唯一接入点 | — | `tools/registry`、`@claude-code-best/builtin-tools` |
| `tools/shared/` | 共享 helper | 注册器、core 之外的所有 tools 子目录 | 仅 utils |
| `query/api.ts` | API 调用 + 流处理 | 业务状态 | `services/api/*`、`tools/core`（类型） |
| `query/loop/` | turn 循环 + compaction | UI 渲染 | `query/api`、`query/stream`、`tools/execution`、`state/` |
| `query/engine/` | 会话级状态机 | UI 渲染 | `query/loop`、`query/stream`、`state/` |

**M1 补充：tools/ 内部依赖方向图：**

```
tools/core       ← 类型层，零运行时依赖
     ↑
tools/shared     ← 纯 helper，零业务依赖
     ↑
tools/registry   ← 依赖 core、shared
     ↑
tools/builtin    ← 依赖 registry、core（接入实现）
tools/presets    ← 依赖 core（仅类型）
tools/discovery  ← 依赖 registry、core、shared
tools/execution  ← 依赖 registry、core、shared（不依赖 discovery、builtin）
```

**关键约束：**
- `tools/execution/` 不得 import `tools/builtin/`、`tools/discovery/` —— 防止运行时循环。
- `tools/registry/` 不得 import `tools/execution/`、`tools/discovery/`、`tools/builtin/` —— registry 是底层。

### 3.3 关键约束 —— v2 修订（F2 缩窄 scope）

1. **`feature()` 调用分两类管理**（F2 修正）：
   - **工具注册级**（约 15 处，散落在 `src/tools.ts`、`src/constants/tools.ts`）：**必须**集中到 `tools/registry/feature-gate.ts`。
   - **功能级**（约 200 处，散落在 `REPL.tsx`、`main.tsx`、`query.ts` 等）：**不在本设计范围**，保留现状。理由：UI 行为开关通过 context/props 传递需要先重写 React 组件结构，远超本次重构 scope。
   - 后续可单独发起"feature() 全局边界化"的 spec。
2. **`cli/bootstrap/` 内允许少量 `feature()` 调用**——用于启动期决定是否初始化某个子系统（如 `DAEMON`、`BRIDGE_MODE`），不超过 5 处。
3. `commands/<topic>/<name>/` 目录下的文件不得 import 同级其他命令的实现。
4. `entrypoints/cli.tsx` 行数上限：原 v2 定为 200 行硬性上限，**v3 放宽**（Plan C 决策，详见 §6.6）。当前 cli.tsx 363 行——延迟加载 `main.jsx` 模式 + fast-path 调度带来额外代码，超过原上限但有合理性。新上限：**400 行**。
5. `query/` 三层强制单向依赖：`engine → loop → api`。不允许反向 import。
6. **构建产物兼容性**（F1 新增）：所有"扫描"操作必须在 `build.ts` 编译期完成，生成静态 import 数组。运行时不允许 `globSync` + `require()` 模式。

## 4. 命令注册机制 —— v2 修订（F1 + M4 + M5）

### 4.1 CommandSpec 类型（M4 修正：移除 category 字段）

保留现有 `Command` 类型不动。`CommandSpec` 只新增 `visibility`/`safety`/`featureGate`：

```ts
// src/commands/_registry/types.ts
import type { Command } from '../../../types/command.js'

/**
 * 命令主题分组。由扫描器从目录路径推导（M4 修正：不在 spec 中重复声明）。
 */
export type CommandCategory =
  | 'session-info' | 'session' | 'mcp' | 'model' | 'config' | 'memory'
  | 'skills' | 'plugins' | 'tasks' | 'ui' | 'debug'
  | 'review' | 'version' | 'files' | 'bridge' | 'daemon'
  | '_misc'

export type CommandVisibility = 'public' | 'internal' | 'feature-gated'
export type CommandSafety = 'remote-safe' | 'bridge-safe' | 'restricted'

export interface CommandSpec extends Command {
  // category 字段已删除（M4）——由 scanner.ts 从路径推导并注入
  visibility?: CommandVisibility
  safety?: CommandSafety
  featureGate?: string
}

/** 扫描器注入的最终形态——运行时由 generated.ts 提供 */
export interface RegisteredCommand extends CommandSpec {
  category: CommandCategory  // 扫描器注入
  sourcePath: string         // 源文件相对路径，便于调试
}
```

### 4.2 命令目录约定（M5 修正）

```
src/commands/
└── session/                     # 分组容器（新）
    └── clear/
        ├── index.ts             # default export satisfies CommandSpec
        ├── clear.ts             # 实现入口（懒加载）
        ├── conversation.ts
        ├── caches.ts
        └── __tests__/
            └── clear.test.ts
```

`index.ts` 标准形态：

```ts
import type { CommandSpec } from '../../_registry/types.js'

const clear = {
  type: 'local',
  name: 'clear',
  description: 'Clear conversation history and free up context',
  aliases: ['reset', 'new'],
  // category 不声明，由目录路径推导（M4）
  supportsNonInteractive: false,
  load: () => import('./clear.js'),
} satisfies CommandSpec

export default clear
```

**M5 重命名规则：**
- 原 `src/commands/session/`（显示远程 URL 的命令）→ 重命名为 `src/commands/session-info/`
- 该命令归入 `ui` 分组（移动到 `src/commands/ui/session-info/`）
- 释放 `session` 名字用作会话生命周期分组容器

### 4.3 编译期代码生成（F1 完全重写）

v1 用 `globSync + require()` 运行时扫描——**在 Bun 代码分割构建产物中不工作**。v2 改为编译期生成。

#### 4.3.1 扫描器脚本

```ts
// src/commands/_registry/scanner.ts
// 同时被 dev mode 和 build.ts 调用
import { globSync } from 'node:fs'
import path from 'node:path'

const COMMAND_GLOB = 'commands/*/*/index.ts'

export interface ScannedCommand {
  category: string
  name: string
  relativePath: string  // 例如 'commands/session/clear/index.ts'
}

export function scanCommands(srcRoot: string): ScannedCommand[] {
  const files = globSync(COMMAND_GLOB, { cwd: srcRoot })
  return files.map(file => {
    // commands/<category>/<name>/index.ts
    const parts = file.split('/')
    if (parts.length !== 4 || parts[3] !== 'index.ts') {
      throw new Error(`Unexpected command path: ${file}`)
    }
    const [, category, name] = parts
    return { category, name, relativePath: file.replace(/\.ts$/, '.js') }
  })
}

/**
 * 生成 generated.ts 内容。dev 和 build 都调用此函数。
 * 输出格式：纯静态 import + 数组，tsc 可类型检查。
 */
export function generateRegistryCode(commands: ScannedCommand[]): string {
  const imports = commands.map(c =>
    `import cmd_${sanitize(c.category)}_${sanitize(c.name)} from '../../${c.relativePath}'`
  ).join('\n')

  const entries = commands.map(c =>
    `  { ...cmd_${sanitize(c.category)}_${sanitize(c.name)}, category: '${c.category}', sourcePath: '${c.relativePath}' }`
  ).join(',\n')

  return `// AUTO-GENERATED by scanner.ts — DO NOT EDIT
// Regenerated on every 'bun run dev' and 'bun run build'.
import type { RegisteredCommand } from './types.js'

${imports}

export const REGISTERED_COMMANDS: RegisteredCommand[] = [
${entries}
]
`
}

function sanitize(s: string): string {
  return s.replace(/[^a-zA-Z0-9]/g, '_')
}
```

#### 4.3.2 build.ts 集成

```ts
// build.ts（追加，~10 行）
import { scanCommands, generateRegistryCode } from './src/commands/_registry/scanner.ts'
import { writeFile, mkdir } from 'node:fs/promises'

const commands = scanCommands(path.resolve('src'))
const generated = generateRegistryCode(commands)
await mkdir(path.resolve('src/commands/_registry'), { recursive: true })
await writeFile(path.resolve('src/commands/_registry/generated.ts'), generated)
// 然后执行 Bun.build(...)
```

#### 4.3.3 dev mode 集成

```ts
// scripts/dev.ts（追加）
// 在启动 Bun.run 之前先 regenerate
import { scanCommands, generateRegistryCode } from '../src/commands/_registry/scanner.ts'
// ...同 build.ts 调用方式
```

#### 4.3.4 运行时使用

```ts
// src/commands/_registry/registry.ts
import { REGISTERED_COMMANDS } from './generated.js'  // 静态 import
import type { Command, CommandSafety, CommandVisibility } from './types.js'

export function getCommands(cwd: string): Command[] {
  return REGISTERED_COMMANDS
    .filter(spec => meetsVisibility(spec))
    .filter(spec => meetsFeatureGate(spec))
    .filter(spec => meetsAvailabilityRequirement(spec, cwd))
}

export function findCommand(name: string, cmds = getCommands(process.cwd())): Command | undefined {
  return cmds.find(c => c.name === name || c.aliases?.includes(name))
}
// ...其余过滤函数（meetsVisibility 等）同 v1
```

#### 4.3.5 收益对比

| 方面 | v1（运行时扫描） | v2（编译期生成） |
|------|-----------------|----------------|
| Bun 构建产物 | ❌ 不可用 | ✅ 静态 import 被 Bun 正常打包 |
| tsc 类型检查 | ❌ require() 绕过 | ✅ 静态 import 完全检查 |
| 启动性能 | ⚠️ 启动时 globSync + 144 个 require | ✅ 零开销 |
| 新增命令 | 自动可见 | 自动可见（dev/build 时重新生成） |
| IDE 跳转 | ❌ 动态 require 难追踪 | ✅ 静态 import 可跳转 |

### 4.4 旧 → 新对照（clear 为例）

| 当前 | 重构后 |
|------|--------|
| `src/commands/clear/index.ts` | `src/commands/session/clear/index.ts` |
| `src/commands.ts` 中央数组手动塞 `clear,` | 删除——`generated.ts` 编译期生成 |
| `src/commands.ts` INTERNAL_ONLY 数组 | 命令自声明 `visibility: 'internal'` |
| `src/commands.ts` REMOTE_SAFE_COMMANDS Set | 命令自声明 `safety: 'remote-safe'` |
| `src/main.tsx` 中 `program.command('clear')...` | 删除——`cli/subcommands/` 处理（slash command 由 REPL.tsx 处理，不经 Commander） |

`src/commands.ts` 从 850 行降到 ~50 行（只剩纯查询函数 + re-export）。

## 5. 工具系统统一

### 5.1 当前散落地图 —— v2 行数修正

| 当前位置 | 行数（v1 → v2 修正） | 职责 | 重构后去处 |
|---------|------|------|-----------|
| `src/Tool.ts` | 802 | 类型 + buildTool + lookup | `tools/core/` |
| `src/tools.ts` | 422 | 装配 + preset + filter | `tools/registry/` + `tools/presets/` |
| `src/constants/tools.ts` | 179 | 白名单集合 | `tools/registry/whitelists.ts` |
| `src/services/tools/toolExecution.ts` | **1831**（v1 误估 700+） | runToolUse + 权限检查 | `tools/execution/run-tool-use.ts` + `permissions.ts` |
| `src/services/tools/toolOrchestration.ts` | 207 | 并发控制 | `tools/execution/orchestrator.ts` |
| `src/services/tools/toolHooks.ts` | **665**（v1 误估 ~450） | pre/post hooks | `tools/execution/hooks.ts` |
| `src/services/tools/StreamingToolExecutor.ts` | 560 | 流式执行器 | `tools/execution/streaming-executor.ts` |
| `src/services/searchExtraTools/` | — | TF-IDF + prefetch | `tools/discovery/` |
| `packages/builtin-tools/src/tools/` | 60 工具 | 实现 | **保留**，由 `tools/builtin/index.ts` 唯一接入 |

`src/services/tools/` 总计 **3263 行**（v1 误估为"~1900"）。

### 5.2 `src/tools/` 目录（无结构变更）

```
src/tools/
├── core/
│   ├── types.ts
│   ├── build-tool.ts
│   ├── validation.ts
│   ├── lookup.ts
│   └── __tests__/
├── registry/
│   ├── registry.ts
│   ├── feature-gate.ts          # 仅工具注册级 feature 边界
│   ├── assembler.ts
│   ├── whitelists.ts
│   ├── agent-policy.ts
│   ├── filter.ts
│   └── __tests__/
├── presets/
│   ├── index.ts
│   └── default.ts
├── execution/
│   ├── run-tool-use.ts
│   ├── orchestrator.ts
│   ├── hooks.ts
│   ├── streaming-executor.ts
│   ├── permissions.ts
│   ├── mcp-introspection.ts
│   ├── errors.ts
│   └── __tests__/
├── discovery/
│   ├── tfidf-index.ts
│   ├── prefetch.ts
│   ├── deferred-loader.ts
│   └── __tests__/
├── builtin/
│   ├── index.ts
│   ├── feature-gated.ts
│   └── __tests__/
└── shared/
```

### 5.3 `tools/registry/feature-gate.ts` —— v2 修正（L2 加运行时断言）

```ts
import { feature } from 'bun:bundle'
import type { Tool } from '../core/types.js'

/**
 * 仅用于"工具注册级"feature gating。UI/业务功能级 feature 调用不在本范围（F2）。
 */
const FEATURE_GATED_TOOLS = {
  AGENT_TRIGGERS_REMOTE: () => import('../builtin/feature-gated/RemoteTriggerTool.js'),
  MONITOR_TOOL:          () => import('../builtin/feature-gated/MonitorTool.js'),
  KAIROS:                 () => import('../builtin/feature-gated/SendUserFileTool.js'),
  KAIROS_GITHUB_WEBHOOKS: () => import('../builtin/feature-gated/SubscribePRTool.js'),
  GOAL:                   () => import('../builtin/feature-gated/GoalTool.js'),
  OVERFLOW_TEST_TOOL:     () => import('../builtin/feature-gated/OverflowTestTool.js'),
  CONTEXT_COLLAPSE:       () => import('../builtin/feature-gated/CtxInspectTool.js'),
  TERMINAL_PANEL:         () => import('../builtin/feature-gated/TerminalCaptureTool.js'),
  WEB_BROWSER_TOOL:       () => import('../builtin/feature-gated/WebBrowserTool.js'),
  HISTORY_SNIP:           () => import('../builtin/feature-gated/SnipTool.js'),
  EXPERIMENTAL_SKILL_SEARCH: () => import('../builtin/feature-gated/DiscoverSkillsTool.js'),
  REVIEW_ARTIFACT:        () => import('../builtin/feature-gated/ReviewArtifactTool.js'),
  UDS_INBOX:              () => import('../builtin/feature-gated/ListPeersTool.js'),
  WORKFLOW_SCRIPTS:       () => import('../builtin/feature-gated/WorkflowTool.js'),
} as const satisfies Record<string, () => Promise<{ default: Tool }>>

export type FeatureGatedToolFlag = keyof typeof FEATURE_GATED_TOOLS

export function isToolEnabled(flag: FeatureGatedToolFlag): boolean {
  return feature(flag)
}

export async function loadFeatureGatedTool(flag: FeatureGatedToolFlag): Promise<Tool | null> {
  if (!isToolEnabled(flag)) return null
  try {
    const mod = await FEATURE_GATED_TOOLS[flag]()
    if (!mod.default) {
      console.warn(`[feature-gate] ${flag}: import succeeded but no default export`)
      return null
    }
    return mod.default
  } catch (err) {
    console.warn(`[feature-gate] ${flag}: import failed`, err)
    return null
  }
}

export function listEnabledFeatureGatedTools(): FeatureGatedToolFlag[] {
  return (Object.keys(FEATURE_GATED_TOOLS) as FeatureGatedToolFlag[])
    .filter(isToolEnabled)
}

/**
 * L2 改进：启动期验证所有声明的 flag 在 build.ts 中存在。
 * 在 cli/bootstrap/ 中调用一次。
 */
export function validateFeatureGateFlags(): void {
  const validFlags = new Set<string>(/* 从 MACRO 注入或 build.ts 生成的列表 */)
  for (const flag of Object.keys(FEATURE_GATED_TOOLS)) {
    if (!validFlags.has(flag)) {
      console.warn(`[feature-gate] Unknown flag: ${flag} (declared but not in build.ts defines)`)
    }
  }
}
```

### 5.4 装配器（不变）

```ts
// src/tools/registry/assembler.ts
export async function getAllBaseTools(): Promise<Tool[]> {
  return memoizedBase()
}

export async function getTools(ctx: ToolPermissionContext): Promise<Tool[]> {
  const base = await getAllBaseTools()
  const mcp = await loadMcpTools(ctx)
  return filterToolsByDenyRules([...base, ...mcp], ctx.denyRules)
}

export async function assembleToolPool(ctx, preset): Promise<Tool[]> {
  const all = await getTools(ctx)
  return getToolsForPreset(all, preset)
}
```

**H5 修正**：`getTools()` 从同步变 async 后，受影响的"§12 不改边界"文件：
- `src/screens/REPL.tsx`（H5 强制要求修改，约 70 处 feature 调用中可能有 1-3 处调 `getTools()`）—— 加 `await`
- `src/QueryEngine.ts`（C10 本就要改）—— 拆分时统一 async 化

### 5.5 兼容期 re-export shim —— v2 修正（H4 缩短窗口期）

```ts
// src/Tool.ts（C1 阶段：删空内容，只留 re-export）
/** @deprecated 使用 src/tools/core/* */
export * from './tools/core/types.js'
export * from './tools/core/build-tool.js'
export * from './tools/core/lookup.js'
```

**H4 修正：shim 窗口期管理。**
- C1 创建 shim 后，**立即在 C2 同 PR 中**完成所有内部 import 替换 + 删除 shim。
- v1 的"C1 创建 → F1 删除"窗口期 14 个 PR 被压缩到 1 个 PR（C1+C2 合并）。
- 8 个 shim 文件同步删除，dependency-cruiser 规则无窗口期绕过。

## 6. `main.tsx` 5640 行拆分映射 —— v2 修订

> **v3 注（2026-07-12）**：本章（§6.1–§6.5）描述的"main.tsx 全量拆分 + 删除"方案已被 **Plan C（§6.6）取代**——main.tsx 永久保留。本章保留作为**历史规划参考**与"若未来重启 main.tsx 拆分时的行号映射依据"。已实际交付的部分（subcommand 迁出 ~840 行、defaultAction 迁到 dispatcher/runner.ts、Commander 装配迁到 cli/program/、fast-paths 整合到 cli/fast-paths.ts）与本章规划一致；未交付的部分（bootstrap 迁到 cli/bootstrap/、main.tsx 删除）按 Plan C 不再执行。

### 6.1 行号 → 目标文件（M7 补充 cli.tsx 自身 fast-paths）

| 当前位置 | 行数 | 重构后去处 |
|---------|------|-----------|
| `main.tsx` 369-470 | ~100 | `cli/bootstrap/telemetry.ts` |
| `main.tsx` 473-505 | ~32 | `src/migrations/index.ts`（迁入已有目录） |
| `main.tsx` 507-580 | ~75 | `cli/bootstrap/prefetch.ts` |
| `main.tsx` 582-668 | ~85 | `cli/bootstrap/settings.ts` |
| `main.tsx` 670-742 | ~72 | `cli/bootstrap/index.ts` |
| `main.tsx` 743-1029 (`main()`) | ~286 | 拆三处：`cli/fast-paths.ts` + `entrypoints/cli.tsx` + `cli/dispatcher/index.ts` |
| `main.tsx` 1030-1065 (`getInputPrompt`) | ~35 | `cli/dispatcher/prompt-input.ts` |
| `main.tsx` 1066-1434 (Commander + preAction hook) | ~370 | `cli/program/index.ts` |
| **`main.tsx` 1434-4464** (`.action()` 主处理器) | **~3030** | **`cli/dispatcher/runner.ts` 单文件**（v3.1 / Plan C-2 决策，原 H2「10 子模块」承诺已废弃，详见 §6.7） |
| `main.tsx` 4464-4613 (全局 option 链) | ~150 | `cli/program/options.ts` |
| **`main.tsx` 4615-5455** (subcommand 链式注册) | **~840** | **完全删除**——`cli/subcommands/` 编译期生成 + 扫描 |
| `main.tsx` 5459-5563 (`logTenguInit`) | ~105 | `cli/bootstrap/telemetry.ts` |
| `main.tsx` 5565-5605 (`maybeActivateProactive/Brief`) | ~40 | `cli/dispatcher/modes.ts` |
| `main.tsx` 5607-5620 (`resetCursor`) | ~13 | `src/utils/terminal/cursor.ts` |
| `main.tsx` 5623-end (`extractTeammateOptions`) | ~30 | `cli/dispatcher/teammate-options.ts` |
| **`entrypoints/cli.tsx` 自身的 fast-paths**（M7 补充） | — | `cli/fast-paths.ts` 统一接管：`--version`、`--dump-system-prompt`、`--computer-use-mcp`、`--chrome-native-host`、`--daemon-worker`、`bridgeMain`、`daemonMain`、`remote-control`、`rc`、`remote`、`sync`、`bridge`、`daemon`、`ps`、`logs`、`attach`、`kill`、`--bg`、`new`、`list`、`reply`、`environment-runner`、`self-hosted-runner`、`--tmux`+`--worktree` |

### 6.2 `dispatcher/` 子模块拆分（H2 补充闭包变量分组策略）

> **⚠️ v3.1 / Plan C-2 已替代本节承诺**（2026-07-12）：H2 原承诺「10 子模块 × 200-400 行」**已废弃**。实际实施产物为 `cli/dispatcher/runner.ts` 单文件（3874 行）+ 12 个骨架子模块（各 33-96 行，仅作类型/入口/小工具）。详见 §6.7。本节以下内容保留作为历史设计记录，不再作为实施目标。

```
src/cli/dispatcher/
├── index.ts                   # 主 action handler 入口（<200 行）
├── options-normalizer.ts
├── bootstrap.ts               # 调用 cli/bootstrap/ 各模块
├── permissions.ts
├── session-restore.ts
├── headless.ts
├── repl.ts
├── prompt-input.ts
├── teammate-options.ts
├── modes.ts
└── __tests__/
```

**H2 补充：闭包变量生命周期分组策略。**

当前 `.action()` 内有 90+ 局部变量。拆分时按生命周期分三组：

| 组 | 生命周期 | 传递方式 | 示例变量 |
|----|---------|---------|---------|
| **启动期** | 进程级，初始化一次 | 保留在 `cli/bootstrap/` 内部，不暴露 | telemetry handles、settings cache、MCP connections |
| **请求期** | 单次 action 调用 | `DispatcherContext` 对象传给子模块 | normalized options、permissionCtx、sessionId、worktree option |
| **临时** | 单个子模块内部 | 子模块局部变量，不共享 | parsed prompt、临时计算结果 |

**`DispatcherContext` 设计原则**（避免上帝对象陷阱）：
- 只装载"请求期"必需的、被 2 个以上子模块使用的变量
- 子模块单次使用的变量，留在子模块内部
- 启动期变量通过模块级单例（如 `state/`）访问，不进 context
- `DispatcherContext` 字段数硬上限 20，超过则警告重新审视

`dispatcher/index.ts` 形态（修订版）：

```ts
// src/cli/dispatcher/index.ts (<200 行)
import type { ProgramOptions } from '../program/types.js'

interface DispatcherContext {
  // 请求期变量——只装真正需要跨模块传递的
  options: NormalizedOptions
  permissionCtx: ToolPermissionContext
  sessionId?: string
  // 字段数硬上限 20
}

export async function handleDefaultAction(
  prompt: string | undefined,
  rawOptions: ProgramOptions,
): Promise<void> {
  const options = normalizeOptions(rawOptions)
  await runBootstrap(options)
  const permissionCtx = await setupPermissions(options)

  const ctx: DispatcherContext = { options, permissionCtx }

  if (options.resume || options.continue) {
    return await restoreSession(ctx)
  }
  if (options.print !== undefined || process.stdin.isTTY === false) {
    return await runHeadless(prompt, ctx)
  }
  return await runRepl(prompt, ctx)
}
```

### 6.3 CLI subcommand 编译期生成 + 注册（F1 修正）

```
src/cli/subcommands/
├── index.ts                   # 静态 import 所有 define() + 注册
├── mcp.ts                     # mcp serve/add/remove/list/...
├── auth.ts
├── plugin.ts
├── agents.ts
├── doctor.ts
├── update.ts
├── server.ts
├── auto-mode.ts
├── autonomy.ts
├── task.ts
└── __tests__/
```

**v2 修正：放弃运行时 globSync 扫描 subcommands，改为静态 import 列表。**

理由：subcommands 总数有限（~11 个），手工维护可接受；F1 的代码生成方案对 subcommands 过度设计。

```ts
// src/cli/subcommands/index.ts
import type { Command } from 'commander'
import { define as defineMcp } from './mcp.js'
import { define as defineAuth } from './auth.js'
import { define as definePlugin } from './plugin.js'
// ... 共 11 个静态 import

const DEFINERS = [
  defineMcp, defineAuth, definePlugin, defineAgents,
  defineDoctor, defineUpdate, defineServer, defineAutoMode,
  defineAutonomy, defineTask,
]

export function registerAllSubcommands(program: Command): void {
  for (const define of DEFINERS) {
    define(program)
  }
}
```

### 6.4 最终 `entrypoints/cli.tsx`（F3 修正：明确可依赖 dispatcher）

> **v3 注**：本节展示的"cli.tsx 直接 `createProgram()` + `program.action(handleDefaultAction)`"形态为**目标形态参考**，当前不实施。按 §6.6 Plan C 决策，cli.tsx 维持延迟加载 `main.jsx` 的现有模式，main.tsx 永久保留。

```ts
// src/entrypoints/cli.tsx
// F3 放宽：cli.tsx 可依赖 cli/dispatcher（合理的根依赖）
import { createProgram } from '../cli/program/index.js'
import { registerGlobalOptions } from '../cli/program/options.js'
import { registerAllSubcommands } from '../cli/subcommands/index.js'
import { handleDefaultAction } from '../cli/dispatcher/index.js'
import { handleFastPath } from '../cli/fast-paths.js'

async function main() {
  if (await handleFastPath(process.argv)) return

  const program = createProgram()
  registerGlobalOptions(program)
  registerAllSubcommands(program)
  program.action(handleDefaultAction)

  await program.parseAsync(process.argv)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
```

### 6.5 拆分前后对比

| 文件 | 行数 |
|------|------|
| **拆分前** | |
| `src/main.tsx` | **5640** |
| **拆分后**（细粒度方案） | |
| `src/entrypoints/cli.tsx` | <200 |
| `src/cli/program/{index,options}.ts` | ~350 |
| `src/cli/dispatcher/*.ts` | ~~10 文件 × 200-400~~ **runner.ts 单文件 3874 行 + 12 骨架子模块各 33-96 行**（v3.1 / Plan C-2，见 §6.7） |
| `src/cli/subcommands/*.ts` | ~11 文件 × 50-150 |
| `src/cli/bootstrap/*.ts` | ~5 文件 × 50-150 |
| `src/main.tsx` | ~~删除~~ **永久保留**（v3 / Plan C，见 §6.6） |

**L1 提供：中等粒度备选方案（5-8 文件）**

如果团队认为 30 文件认知成本过高，可改为：

```
src/cli/
├── cli.tsx          # entrypoints/cli.tsx 的内容（<200 行）
├── program.ts       # Commander 装配 + options + subcommands 合并（~600 行）
├── dispatcher.ts    # 主 action handler + 所有子模块合并（~1500 行）
├── bootstrap.ts     # 启动副作用（~400 行）
├── fast-paths.ts    # 所有 fast-path（~300 行）
└── __tests__/
```

权衡：
- 细粒度（30 文件）：单文件可单测性最强，调用链跳转多
- 中粒度（5-8 文件）：调用链清晰，单文件偏大、单测粒度变粗

**默认采用细粒度方案**，但若实施中发现认知成本过高，可降级为中粒度（C6 后决策）。

### 6.6 main.tsx 永久保留决策（Plan C，v3 / 2026-07-12）

> **决策日期**：2026-07-12
> **决策类型**：用户决策（选项 B：永久保留），取代 v2 §6.5、§9.2 C7、§9.3 F1 中"删除 main.tsx"的承诺。

#### 6.6.1 决策内容

`src/main.tsx` 作为**永久运行时入口**保留，不再改名、不再重组、不在本次重构范围内删除。`entrypoints/cli.tsx` 第 356 行的延迟加载模式正式化为运行时入口契约：

```ts
// src/entrypoints/cli.tsx (当前形态，363 行)
// ...fast-path 调度...
const { main: cliMain } = await import('../main.jsx');
await cliMain();
```

此模式不再视为"Plan B 临时 shim"，而是 **Plan C 正式架构**。

#### 6.6.2 理由

1. **main.tsx 仍承载大量 bootstrap 副作用**：telemetry 初始化、settings 加载、MCP connect、prefetch 触发、trust dialog、logTenguInit 等启动期逻辑与 `main()` 函数耦合度高。强行迁出到 `cli/bootstrap/` 子目录（v2 §6.1 规划的 telemetry.ts / prefetch.ts / settings.ts / index.ts 共 5 文件）需要逐一拆解副作用顺序，迁移成本与回归风险均高于收益。
2. **cli.tsx 363 行超原 spec §3.3.4 的 200 行上限，但延迟加载模式有合理性**：cli.tsx 承担 fast-path 调度（`--version`、`--computer-use-mcp`、bridge/daemon 等 20+ 快速路径）+ 延迟加载 main.jsx，这是 fast-path 优化（避免不必要的 main.tsx 加载），有真实的启动性能价值。v3 已将 §3.3.4 上限放宽到 400 行。
3. **`cli/bootstrap/` 子目录创建推迟**：v2 §3.1 规划的 `cli/bootstrap/` 目录暂不创建。当前 `src/cli/dispatcher/bootstrap.ts`（93 行）暂时收纳部分 bootstrap 副作用，其余 bootstrap 逻辑仍留在 main.tsx 内部。未来如需进一步解耦，可单独发起 spec。

#### 6.6.3 当前状态快照（2026-07-12）

| 文件 / 目录 | v2 规划 | v3 实际状态 |
|------------|---------|-----------|
| `src/main.tsx` | 删除 | **永久保留**，当前 1615 行（subcommand 链已迁出，defaultAction 已迁到 dispatcher/runner.ts） |
| `src/entrypoints/cli.tsx` | <200 行最终形态 | 363 行，延迟加载 main.jsx 模式正式化 |
| `src/cli/dispatcher/` | 10 子模块 | **已创建**（含 bootstrap.ts、runner.ts + 12 骨架子模块 = 13 文件） |
| `src/cli/bootstrap/` | 5 文件 | **未创建**，推迟到未来需要时 |
| `src/cli/program/` | index.ts + options.ts | **已创建** |
| `src/cli/subcommands/` | 11 文件 | **已创建** |
| `src/cli/fast-paths.ts` | 统一 fast-path | **已创建** |

#### 6.6.4 修订影响

本决策修订以下章节（详见各章节内联标注）：
- §3.1（目标目录树末尾）：`main.tsx` 从"删除"改为"永久保留"
- §3.3.4（cli.tsx 行数上限）：从 200 行放宽到 400 行
- §6.4（最终 cli.tsx 形态）：保留为**目标形态参考**，当前不实施（cli.tsx 继续延迟加载 main.jsx）
- §6.5（拆分前后对比）：`main.tsx` 行标注为"永久保留"
- §9.2 C7（bootstrap 迁出 + 删除 main.tsx）：**不再执行**
- §9.3 F1（确认 shim 删除）：main.tsx 不在 shim 删除范围
- §11（风险）："`main.tsx` 拆分丢失副作用顺序"风险**降级为低**（不再拆分）
- §13.1（量化收益）：`main.tsx` 5640→0 修正为 5640→1615（subcommand 已迁出）

#### 6.6.5 不变的部分

C6（dispatcher 拆分）已完成且**不受本决策影响**：`src/cli/dispatcher/` 下 13 个子模块（含 runner.ts 承接原 `main()` 的 defaultAction 协调逻辑、bootstrap.ts 收纳 93 行 bootstrap 副作用）作为已交付成果保留。main.tsx 保留不等于回退 dispatcher 拆分。

### 6.7 dispatcher/runner.ts 单文件方案（Plan C-2，v3.1 / 2026-07-12）

> **决策日期**：2026-07-12
> **决策类型**：用户决策（选项 B：在 spec 中追加 Plan C-2 承认现状），取代 H2「10 子模块 × 200-400 行」拆分承诺。
> **关联**：本决策与 §6.6 的 Plan C（main.tsx 永久保留）相互独立——§6.6 决定 main.tsx 不删，本决策决定 dispatcher/runner.ts 不再强行拆分。两者共同构成 v3 架构调整。

#### 6.7.1 决策内容

承认 `src/cli/dispatcher/runner.ts`（**3874 行**）的**单文件形态为永久方案**，放弃 H2「把 defaultAction 主体拆到 `cli/dispatcher/` 下 10 个 200-400 行子模块」的承诺。runner.ts 是 C6.5 迁移产物，承接原 `main.tsx` 1069-4083 行（约 3014 行）的 defaultAction 主体，并因实际增长达到 3874 行。

**保留 `cli/dispatcher/` 下现有骨架子模块**（不再要求把 runner.ts 强行拆到它们中）：

| 子模块 | 实际行数 | 实际职责 |
|--------|---------|---------|
| `runner.ts` | **3874** | defaultAction 完整实现（永久单文件） |
| `types.ts` | 96 | 类型声明 |
| `bootstrap.ts` | 93 | bootstrap 副作用片段 |
| `options-normalizer.ts` | 81 | option 归一化 |
| `headless.ts` | 80 | headless 模式入口 |
| `fast-paths.ts` | 75 | fast-path 片段 |
| `session-restore.ts` | 65 | session 恢复入口 |
| `modes.ts` | 56 | 模式切换 |
| `permissions.ts` | 62 | 权限设置入口 |
| `repl.ts` | 41 | REPL 启动入口 |
| `index.ts` | 44 | 模块入口/re-export |
| `teammate-options.ts` | 62 | teammate option 提取 |
| `prompt-input.ts` | 33 | prompt 输入辅助 |

骨架子模块各仅 33-96 行（远低于 H2 承诺的 200-400 行），仅承担类型声明、入口 re-export、小工具函数等辅助职责；defaultAction 的实际主逻辑全部集中在 runner.ts。

#### 6.7.2 理由

1. **3874 行单文件运行良好，precheck 通过**：runner.ts 作为 C6.5 迁移产物，行为与原 `main.tsx` defaultAction 1:1 等价（所有 `process.exit`、所有分支、所有闭包变量原样保留）。`bun run precheck`（typecheck + lint fix + test）零错误通过。当前没有功能性问题需要通过拆分来修复。

2. **拆分工作量大且高风险**（重构核心 CLI 入口）：runner.ts 的 `runner.ts:1-13` 注释自承"defaultAction 有 5 个跨阶段闭包依赖，拆分会改变行为"。defaultAction 是 CLI 的核心入口路径，包含 options 归一化 → bootstrap 副作用 → 权限设置 → session 恢复 → headless/REPL 分发等阶段，阶段间通过闭包变量共享状态。强行按 H2 的 DispatcherContext 模式重构需要：(a) 识别所有跨阶段闭包变量；(b) 设计 context 对象并验证字段数 ≤ 20；(c) 逐阶段迁移并保持行为等价。任一步骤出错都可能导致 CLI 启动回归，而 CLI 启动失败是 P0 级事故。

3. **骨架子模块化探索已证明收益不及成本**：C6 实施时已经按 H2 的方向创建了 12 个骨架子模块（options-normalizer.ts、bootstrap.ts、permissions.ts、session-restore.ts、headless.ts、repl.ts、modes.ts、prompt-input.ts、teammate-options.ts、fast-paths.ts、index.ts、types.ts 等），但探索结果显示：defaultAction 主体的跨阶段闭包依赖使得"把主逻辑搬进骨架子模块"变得不安全，骨架子模块只能承担小工具/入口/re-export 职责（因此各仅 33-96 行）。继续强行拆分的边际收益（可单测性提升）不足以抵消边际成本（回归风险 + 工程时间）。

4. **H2 的上帝对象担忧实际未 materialize**：H2 原本担心"闭包变量打包有上帝对象陷阱"。但 runner.ts 采用的是**闭包变量原地保留**的方式（而非打包成 DispatcherContext 对象传递），规避了上帝对象问题。代价是 runner.ts 作为单文件承载所有闭包——但这是一个已知的、可控的权衡，而非 H2 担忧的隐性陷阱。

#### 6.7.3 修订影响

本决策修订以下章节（详见各章节内联标注）：
- §3.1（目标目录树）：`cli/dispatcher/` 注释从"拆 10 子模块"改为"runner.ts 单文件 + 骨架子模块"
- §6.1（行号映射）：`.action()` 主处理器去向从"10 子模块"改为"`cli/dispatcher/runner.ts` 单文件"
- §6.2（dispatcher 子模块拆分）：H2 闭包变量分组策略标注为**已废弃的历史设计记录**
- §6.5（拆分前后对比）：`dispatcher/*.ts` 行数从"10 文件 × 200-400"改为实际值
- §9.2 C6（3000 行 .action() 拆分）：标注为**已按 Plan C-2 完成**（产物形态与原承诺不同）
- §10.1（测试策略）：`cli/dispatcher/` 集成测试目标调整为"runner.ts 各分支"
- §11（风险）：H2 相关的"闭包变量传递"与"拆分丢失副作用顺序"风险**降级**（不再拆分）

#### 6.7.4 不变的部分

- `cli/dispatcher/` 目录及其下 13 个文件（runner.ts + 12 骨架子模块）**全部保留**，不删除、不重组合。
- 骨架子模块现有的小工具/入口/re-export 职责不变。未来如发现某个骨架子模块可以承接 runner.ts 的某个独立片段（且无跨阶段闭包依赖），允许渐进式迁移——但这不是 spec 要求，而是 opportunistic 改进。
- H1（query/loop/engine 三层单向依赖）、F1-F3、H3-H8（除 H2 外）等其他设计约束**不受本决策影响**。
- main.tsx Plan C（§6.6）与本决策相互独立，两者不冲突。

#### 6.7.5 未来触发条件

如果以下任一情况发生，可重新评估是否拆分 runner.ts：
1. runner.ts 行数增长超过 **5000 行**（当前 3874 行，阈值留 30% 缓冲）。
2. 出现需要独立单测 defaultAction 某个阶段的需求，且该阶段无跨阶段闭包依赖。
3. CLI 启动路径出现 bug，根因分析指向 runner.ts 的单文件形态（即"文件过大导致认知负担"成为直接原因）。

在以上条件未触发前，runner.ts 单文件方案为最终方案，不再发起拆分 spec。

## 7. `query/` + `engine/` 拆分 —— v2 修订（H1 重点）

### 7.1 当前两文件结构（行数已核对）

| 文件 | 行号 | 内容 | 行数 |
|------|------|------|------|
| `src/query.ts` | 276-392 | `query()` 主生成器 | ~117 |
| | 393-2057 | `queryLoop()` 主循环生成器（43 个 yield） | ~1664 |
| `src/QueryEngine.ts` | 217-1216 | `submitMessage()`（37 个 yield） | ~999 |
| | 1256-1365 | `ask()` 顶层函数 | ~110 |

### 7.2 三层强制单向依赖

| 层 | 职责 | 不做什么 |
|----|------|---------|
| API 层 (`query/api.ts`) | 单次 API 请求 + 流解码 | 不知道 turn 循环、不知道 session |
| Loop 层 (`query/loop/`) | 多 turn 编排 | 不维护跨 turn 状态、不持久化 |
| Engine 层 (`query/engine/`) | 会话级状态机 | 不直接调 API、不解析流事件 |

依赖方向强制单向：`engine → loop → api`。

### 7.3 重构后 `src/query/`

```
src/query/
├── api.ts
├── stream/
│   ├── handlers.ts
│   ├── reducer.ts
│   ├── tool-call-extractor.ts
│   └── __tests__/
├── loop/
│   ├── index.ts
│   ├── tool-dispatch.ts
│   ├── tool-result-merge.ts
│   ├── autonomy.ts
│   ├── output-validation.ts
│   ├── error-recovery.ts
│   └── __tests__/
├── engine/
│   ├── QueryEngine.ts
│   ├── submit-message.ts
│   ├── compaction.ts
│   ├── attribution.ts
│   ├── session-persist.ts
│   ├── file-history.ts
│   ├── interrupt.ts
│   ├── messages-state.ts
│   ├── nested-memory.ts
│   ├── skill-discovery.ts
│   └── __tests__/
├── params.ts
├── types.ts
├── ask.ts
└── __tests__/
```

### 7.4 `queryLoop()` 1664 行拆分 —— H1 修正：明确每个子模块的 yield 委托模式

JavaScript 生成器中 `yield` 不能跨普通函数代理。子模块必须采用以下三种模式之一：

| 模式 | 子模块返回类型 | 调用方写法 | 说明 |
|------|--------------|-----------|------|
| **A. 委托生成器** | `AsyncGenerator<T>` | `yield*` | 子模块本身是生成器，yield 事件给上游 |
| **B. 异步函数** | `Promise<T>` | `await` | 子模块不 yield，返回计算结果 |
| **C. 同步函数** | `T` | 直接调用 | 纯逻辑判断 |

**每个子模块的明确委托模式（H1 核心修正）：**

| 子模块 | 模式 | 返回类型 | 调用方写法 |
|--------|------|---------|-----------|
| `loop/index.ts` | A | `AsyncGenerator<TurnEvent>` | 主生成器，被 `engine/submit-message.ts` 用 `yield*` |
| `loop/tool-dispatch.ts` | A | `AsyncGenerator<ToolEvent>` | `yield* dispatchTools(...)` |
| `loop/tool-result-merge.ts` | A | `AsyncGenerator<MergeEvent>` | `yield* mergeToolResults(...)` |
| `loop/autonomy.ts` | B | `Promise<AutonomyDecision>` | `const decision = await decideAutonomy(...)` |
| `loop/output-validation.ts` | C | `boolean` | `if (hitsOutputLimit(state)) break` |
| `loop/error-recovery.ts` | A | `AsyncGenerator<ErrorEvent>` | `yield* handleError(err)` |
| `stream/handlers.ts` | B | `Promise<StreamResult>` | `const result = await processStream(stream)` |
| `stream/reducer.ts` | C | `Message` | `const msg = reduceMessage(acc, event)` |
| `stream/tool-call-extractor.ts` | C | `ToolCall[]` | `const calls = extractToolCalls(msg)` |
| `loop/tool-result-merge.ts` 内 helper | C | `void` | `appendResult(state, result)` |

**`loop/index.ts` 主循环形态（修正版，明确 yield* 委托）：**

```ts
// src/query/loop/index.ts (<300 行)
import type { QueryLoopParams, TurnEvent } from '../types.js'
import { callApi } from '../api.js'
import { processStream } from '../stream/handlers.js'
import { extractToolCalls } from '../stream/tool-call-extractor.js'
import { dispatchTools } from './tool-dispatch.js'  // AsyncGenerator
import { mergeToolResults } from './tool-result-merge.js'  // AsyncGenerator
import { decideAutonomy } from './autonomy.js'  // Promise<AutonomyDecision>
import { hitsOutputLimit } from './output-validation.js'  // boolean
import { handleError } from './error-recovery.js'  // AsyncGenerator
import { initLoopState, shouldContinue } from './state.js'

export async function* queryLoop(params: QueryLoopParams): AsyncGenerator<TurnEvent> {
  const state = initLoopState(params)
  while (shouldContinue(state)) {
    try {
      const stream = callApi(state)
      const streamResult = await processStream(stream, state)  // 模式 B
      const toolCalls = extractToolCalls(streamResult.message)  // 模式 C

      if (toolCalls.length > 0) {
        yield* dispatchTools(toolCalls, state)  // 模式 A：yield* 委托
        yield* mergeToolResults(state)  // 模式 A
      }

      const decision = await decideAutonomy(state)  // 模式 B
      if (decision.shouldStop) break

      if (hitsOutputLimit(state)) break  // 模式 C
    } catch (err) {
      yield* handleError(err, state)  // 模式 A：错误事件 yield 给上游
      if (state.fatal) break
    }
  }
}
```

### 7.5 `submitMessage()` 999 行拆分 —— H1 修正

`submitMessage()` 是 37 个 yield 的生成器。子模块委托模式：

| 子模块 | 模式 | 返回类型 | 调用方写法 |
|--------|------|---------|-----------|
| `engine/submit-message.ts` | A | `AsyncGenerator<TurnEvent>` | 主生成器，被 `QueryEngine.submitMessage` 用 `yield*` |
| `engine/messages-state.ts` | C | `Message[]` / `void` | `pushMessage(state, msg)` |
| `engine/file-history.ts` | B | `Promise<Snapshot>` | `await snapshotHistory(state)` |
| `engine/session-persist.ts` | B | `Promise<void>` | `await persistSession(state)` |
| `engine/attribution.ts` | C | `Attribution` | `const attr = computeAttribution(state)` |
| `engine/compaction.ts` | A | `AsyncGenerator<CompactEvent>` | `yield* maybeCompact(state)` |
| `engine/interrupt.ts` | C | `boolean` | `if (isInterrupted(state)) break` |
| `engine/nested-memory.ts` | C | `Set<string>` | `trackNestedMemory(state, path)` |
| `engine/skill-discovery.ts` | C | `Set<string>` | `trackDiscoveredSkill(state, name)` |

**`engine/submit-message.ts` 主流程（修正版）：**

```ts
// src/query/engine/submit-message.ts (<400 行)
import type { EngineState, TurnEvent } from '../types.js'
import { queryLoop } from '../loop/index.js'  // 上层调用 loop（依赖方向：engine→loop）
import { pushMessage } from './messages-state.js'
import { snapshotHistory } from './file-history.js'
import { persistSession } from './session-persist.js'
import { computeAttribution } from './attribution.js'
import { maybeCompact } from './compaction.js'  // AsyncGenerator
import { isInterrupted } from './interrupt.js'

export async function* runSubmitMessage(
  state: EngineState,
  userMessage: Message,
): AsyncGenerator<TurnEvent> {
  pushMessage(state, userMessage)  // 模式 C
  await snapshotHistory(state)      // 模式 B

  yield* queryLoop(state.toLoopParams())  // 模式 A：委托 loop 主循环

  const attribution = computeAttribution(state)  // 模式 C
  await persistSession(state)  // 模式 B

  if (shouldCompact(state)) {
    yield* maybeCompact(state)  // 模式 A：compact 事件 yield 给上游
  }

  if (isInterrupted(state)) return  // 模式 C
}
```

**M3 措辞调整（已在代码注释中体现）：**
> 这是**物理拆分以降低单文件行数**，不是真正的解耦。`submit-message.ts` 仍是协调节点，但每个子模块可独立单测，改动隔离。

### 7.6 依赖关系图

```
entrypoints/cli.tsx
      │
      ▼
cli/dispatcher
      │
      ▼
query/engine/QueryEngine
      │ yield* 委托
      ▼
query/loop/    ◄── 不反向依赖 engine
      │ yield* 委托
      ▼
query/api      ◄── 不反向依赖 loop
      │
      ▼
services/api/*
```

强制：`query/api.ts` 不得 import `query/loop/` 或 `query/engine/`；`query/loop/` 不得 import `query/engine/`；`query/engine/` 不得 import `cli/`。

### 7.7 拆分前后对比

| 文件 | 行数 |
|------|------|
| **拆分前** | |
| `src/query.ts` + `src/QueryEngine.ts` | **3422** |
| **拆分后** | |
| 22 个文件（api/stream/loop/engine/params/types/ask） | ~3400 |

行数总量基本不变，分布到 22 个 50-400 行文件。

## 8. 数据流

### 8.1 启动

```
bun dist/cli.js
  └─► entrypoints/cli.tsx::main()
        ├─► cli/fast-paths.ts::handleFastPath(argv)
        │     ├─ --version → 直接打印退出
        │     ├─ --computer-use-mcp → 启动 MCP server 退出
        │     ├─ bridge / rc / remote-control / sync
        │     ├─ daemon [subcommand]
        │     ├─ ps / logs / attach / kill / --bg
        │     ├─ new / list / reply (Template jobs)
        │     ├─ environment-runner / self-hosted-runner
        │     └─ --tmux + --worktree
        │
        └─► 默认路径：
              ├─► cli/program/index.ts::createProgram()
              ├─► cli/program/options.ts::registerGlobalOptions()
              ├─► cli/subcommands/index.ts::registerAllSubcommands()
              │     （静态 import 11 个 define() 函数）
              ├─► commands/_registry/registry.ts::getCommands()
              │     （读 generated.ts 静态数组，不再扫描）
              └─► program.action(handleDefaultAction)
                    │
                    ▼  parseAsync(argv)
                    │
              ┌─────┴─────┐
              │ fast-path │
              │  命中？   │
              └─────┬─────┘
                    │ 否
                    ▼
              cli/dispatcher/index.ts::handleDefaultAction()
                    ├─► options-normalizer::normalizeOptions()
                    ├─► bootstrap::runBootstrap()
                    │     ├─ telemetry / settings / trust
                    │     ├─ migrations run
                    │     ├─ MCP connect
                    │     └─ prefetches start
                    │     └─ validateFeatureGateFlags()  ← L2 启动期校验
                    ├─► permissions::setupPermissions()
                    ├─► session-restore（--resume/--continue）
                    ├─► headless（-p / 非 TTY）
                    └─► repl::runRepl() → screens/REPL.tsx
```

### 8.2 Turn 循环（H1 修正：标注 yield* 委托点）

```
REPL.tsx（用户输入）
  └─► QueryEngine.submitMessage(msg)        ← async generator
        ├─► engine/messages-state.ts::pushMessage()   // 模式 C
        ├─► engine/file-history.ts::snapshotHistory() // 模式 B: await
        ├─► yield* engine/submit-message.ts::runSubmitMessage()
        │     │
        │     ├─► yield* query/loop/index.ts::queryLoop()    // 模式 A
        │     │     └── while 循环：
        │     │           ├─► query/api.ts::callApi() → services/api/claude.ts
        │     │           ├─► stream/handlers.ts::processStream() // 模式 B: await
        │     │           ├─► stream/tool-call-extractor.ts::extractToolCalls() // C
        │     │           ├─► yield* loop/tool-dispatch.ts::dispatchTools()  // A
        │     │           │     └─► tools/execution/run-tool-use.ts::runToolUse()
        │     │           │           ├─► hooks.ts::runPreToolUseHooks() // AsyncGen
        │     │           │           ├─► tools/<impl>::call()
        │     │           │           ├─► permissions.ts::checkPermissionsAndCallTool()
        │     │           │           └─► hooks.ts::runPostToolUseHooks() // AsyncGen
        │     │           ├─► yield* loop/tool-result-merge.ts::mergeToolResults() // A
        │     │           ├─► loop/autonomy.ts::decideAutonomy() // B: await
        │     │           ├─► loop/output-validation.ts::hitsOutputLimit() // C
        │     │           └─► yield* loop/error-recovery.ts::handleError() // A
        │     │
        │     ├─► engine/attribution.ts::computeAttribution()  // 模式 C
        │     ├─► engine/session-persist.ts::persistSession()  // 模式 B: await
        │     ├─► yield* engine/compaction.ts::maybeCompact()  // 模式 A
        │     └─► engine/interrupt.ts::isInterrupted()         // 模式 C
        │
        └─► yield 给 REPL.tsx 渲染
```

### 8.3 工具调用

```
loop/tool-dispatch.ts → runToolUse(toolName, input)
  ├─► tools/registry/assembler.ts::getTools(ctx)（首次调用时）
  │     ├─► tools/builtin/index.ts::loadBuiltinTools()
  │     │     ├─► 静态导入 ALWAYS_ON_TOOLS
  │     │     └─► tools/registry/feature-gate.ts::listEnabledFeatureGatedTools()
  │     │           └─► feature('XXX')  ← 唯一边界（仅工具注册级 ~15 处）
  │     └─► services/mcp/loader.ts::loadMcpTools()
  │
  ├─► tools/discovery/deferred-loader.ts::isDeferredTool(name)?
  │     ├─ 是 → tools/discovery/tfidf-index.ts::search() → 懒加载
  │     └─ 否 → 直接执行
  │
  └─► tool.call(input, ctx)
```

## 9. 迁移策略 —— v2 修订（H4/H6/H7/H8 + L4 调整 PR 列表）

"一次性大重构"指**目标架构一次性到位、不留兼容期双写**，但 PR 推进分步。

### 9.1 前置 PR（准备）—— H3 新增 P0.5

| # | 内容 | 依赖 | 估计 |
|---|------|------|------|
| P0 | 添加 `dependency-cruiser` 配置（宽松规则，仅警告） | — | ~50 行 |
| **P0.5**（H3 新增）| 运行 `bunx madge --circular src/` 绘制循环依赖图，归档到 `docs/superpowers/refactor-assets/circular-deps-baseline.md`。识别 `tools.ts ↔ TeamCreateTool` 等关键循环，制定解除方案。 | P0 | ~1 天调研 |
| P1 | 添加 `tools/registry/feature-gate.ts` 边界（仅新增，不改业务） | P0 | ~150 行 |
| P2 | 添加 `commands/_registry/types.ts` + `scanner.ts` + `generated.ts` 生成脚本（向后兼容） | P0 | ~200 行 |
| P3 | 在 `tests/mocks/` 加 `feature-gate` mock | P1 | ~50 行 |
| P4 | 在 `build.ts` + `scripts/dev.ts` 集成 scanner 生成步骤（保留旧中央数组作为对比验证） | P2 | ~30 行 |

### 9.2 核心 PR —— H6/H7/H8 重新编排

| # | 内容 | 依赖 | 估计 |
|---|------|------|------|
| **C1**（H4 合并） | 创建 `src/tools/`，搬移 Tool.ts / tools.ts / constants/tools.ts / services/tools/ / services/searchExtraTools/。**C1 内同时**：(a) 处理 P0.5 识别的循环依赖；(b) 替换所有内部 import 路径；(c) 删除 re-export shim。无窗口期。 | P0.5, P1, P3 | ~3500 行 move + ~500 行改路径 |
| **C2**（H4 合并） | 把 `tools/registry/` 内所有 `feature()` 替换为 feature-gate 边界调用。**与 C1 同 PR 或紧接 C1**，验证 biome lint。 | C1 | ~200 行 |
| **C3+C8 合并**（H8） | 创建 `src/commands/_registry/`，启用 `generated.ts` 替代 `commands.ts` 中央数组。**同时**把 144 个目录搬到主题分组（含 M5 的 `session/`→`session-info/` 重命名）。`git mv` + 改 import 路径 + 加 category（路径推导）。 | C1（H6 修正：原 C3→C1 虚假依赖已移除） | ~144 git mv + ~300 行改路径 |
| **C4** | 创建 `src/cli/program/`，把 `main.tsx` 的 Commander 创建 + preAction hook + 全局 option 链迁入。 | C3（H6 修正：原 C4→C2 虚假依赖移除） | ~700 行 |
| C5 | 把 `main.tsx` 的 840 行 subcommand 链迁到 `cli/subcommands/` 静态 import 模式。 | C4 | ~900 行 |
| **C6**（H7 高风险） | ~~把 `main.tsx` 的 3000 行 `.action()` 拆到 `cli/dispatcher/` 10 子模块。按 H2 闭包变量分组策略执行。~~ **v3.1 / Plan C-2：产物形态变更**——已迁移为 `cli/dispatcher/runner.ts` 单文件（3874 行）+ 12 骨架子模块（各 33-96 行），不再强行按 H2 拆到 200-400 行子模块。详见 §6.7。 | C5 | ~3000 行（已实施，形态与原承诺不同） |
| C7 | ~~把 `main.tsx` 剩余 bootstrap 函数迁到 `cli/bootstrap/`。`main.tsx` 删除，`cli.tsx` 改最终形态（含 M7 的 fast-paths 整合）。~~ **v3/Plan C：不再执行**——main.tsx 永久保留，详见 §6.6。`cli/bootstrap/` 子目录创建推迟。当前 `cli/dispatcher/bootstrap.ts`（93 行）收纳部分 bootstrap 副作用。 | C6 | ~~~400 行 + 删除~~ 0 行（决策变更） |
| **C9**（H7 可与 C6/C7/C8 并行的 fallback 路径） | 把 `src/query.ts` 2057 行拆到 `query/api.ts` + `stream/` + `loop/`。**L4 前置：先做 MVP**（拆 1-2 个 yield 块验证委托模式）→ 全量拆分。原文件改 shim 并在同 PR 删除。 | C2（不依赖 C6/C7/C8） | ~2000 行 |
| C10 | 把 `src/QueryEngine.ts` 拆到 `query/engine/`。H1 明确 9 个子模块的 yield 委托模式。删除原文件。 | C9 | ~1400 行 |

**H7 修正：Plan B（fallback 路径）。**
- C9/C10 与 C6/C7 路径**独立**，可并行推进。
- 如果 C6 在第 8 天仍未 merge：暂停 C6/C7，**先 merge C9/C10**，确保 query/engine 收益先到位。
- C8 已合并入 C3，不再单独存在。

**H6 修正：依赖图简化。**

```
v1 关键路径（线性，11 天）：
P0 → P1 → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9 → C10

v2 关键路径（并行化，8 天）：
P0 → P0.5 ─┬─→ C1+C2 ─→ C3+C8 ─→ C4 ─→ C5 ─→ C6 ─→ C7
P1   ──────┘                                  │
P2 → P4 ───────────────────────────────────── ┘
                                                ↓（fallback）
P0.5 → C1+C2 ─→ C9 → C10  （与 C3-C7 并行）
```

### 9.3 收尾 PR

| # | 内容 |
|---|------|
| F1 | 确认所有 shim 已在 C1/C2/C9 删除；`bun run check:unused` 验证外部无残留旧路径 import。**v3 注**：`src/main.tsx` 不在 shim 删除范围（Plan C 永久保留，见 §6.6）。**v3.2 注**（2026-07-12）：`src/query.ts`、`src/QueryEngine.ts`、`src/commands.ts` 三个 re-export shim 已于本次审查跟进中删除（外部 import 已切换至 `src/query/loop/production.js`、`src/query/engine/QueryEngine.js`、`src/commands/_registry/registry.js`）。`tests/integration/no-legacy-paths.test.ts` 的相关断言已同步更新。 |
| F2 | 清理 tsconfig.json 过时配置 |
| F3 | 更新 CLAUDE.md 架构章节 |
| F4 | `dependency-cruiser` 收紧为 error |

### 9.4 节奏

- 每天合并 1-2 个核心 PR。
- 每个 PR 必须通过 `bun run precheck`（typecheck + lint fix + test）。
- 每个核心 PR 加冒烟集成测试。
- C6/C9 各预留 3 天缓冲（H7）。
- 整体 **2 周**完成（v2 与 v1 节奏相同，但并行化降低了关键路径风险）。

## 10. 测试策略

### 10.1 分层测试

| 层 | 测试类型 | 覆盖目标 |
|----|---------|---------|
| `tools/core/`、`tools/registry/` | 纯单元 | 类型、buildTool、registry 注册 |
| `tools/execution/` | 单元 + 集成 | runToolUse 主流程、hook 顺序、并发 |
| `tools/discovery/` | 单元 | TF-IDF、prefetch |
| `commands/_registry/` | 单元 | scanner 生成代码正确、registry 过滤 |
| `commands/_registry/scanner.ts` | 单元 | 不同目录布局下的扫描结果 |
| `cli/dispatcher/` | 集成 | runner.ts 的 action 各分支、bootstrap 副作用顺序（v3.1 / Plan C-2：测试目标改为 runner.ts 单文件，见 §6.7） |
| `cli/subcommands/` | 单元 | 每个 `define()` 注册正确 |
| `query/api.ts` | 单元 | 流解码（mock SDK） |
| `query/loop/` | 单元 + 集成 | 主循环协调、yield* 委托正确（H1 重点） |
| `query/engine/` | 单元 + 集成 | submitMessage、compaction、session 持久化 |

新增约 60 个测试文件（v1 误估 50）。

### 10.2 回归保护

- 每个 PR 通过 `bun run precheck`（CLAUDE.md 硬性要求）。
- 每个核心 PR 加冒烟集成测试。
- **L4 强制：C9 前先做生成器拆分 MVP**——只拆 queryLoop 中 1-2 个 yield 块（如 tool-result-merge）到子模块，验证 `yield*` 委托模式可行后再全量拆分。如果 MVP 失败，C9 转向 fallback（保留 query.ts 不动，先做 C10）。
- C10 完成后跑 `tests/integration/message-pipeline.test.ts` 验证 query 流不变。

## 11. 风险与缓解 —— v2 修订

| 风险 | 严重度 | 缓解 |
|------|--------|------|
| ~~`feature()` 替换漏改~~（F2 scope 缩窄后）| 中（v1 高） | biome lint 强制 `bun:bundle` 在 `tools/registry/feature-gate.ts` 之外只允许出现在已知 UI/engine 调用点白名单 |
| 工具注册同步→async 导致调用方漏 await | 高 | C2 全项目搜索 + tsc 严格检查；H5 强制修改 REPL.tsx 和 QueryEngine.ts |
| `main.tsx` 拆分丢失副作用顺序（telemetry/settings） | ~~高~~ **低（v3）** | ~~C6/C7 保留"启动顺序断言"——ordered log 验证~~ **v3/Plan C：不再拆分 main.tsx**（见 §6.6），风险自然消除。dispatcher/runner.ts 接管 defaultAction 时已验证副作用顺序。 |
| 144 个目录搬家 git history 丢失 | 中 | 全部 `git mv`，blame 可追溯 |
| React Compiler `_c()` 样板在 move 时被 biome 破坏 | 中 | ignored patterns 保持；C1-C10 不动 components/ |
| 自动扫描启动时间增加 | 低 | F1 改为编译期生成后，零运行时开销 |
| 依赖方向 lint 误报 | 低 | F4 前用宽松规则（仅警告），F4 收紧 error |
| **F1 构建产物兼容性**（v1 完全没考虑） | 极高 | 编译期代码生成方案；C1-C10 每步都跑 `bun run build` + `bun run build:vite` 验证 |
| **H1 生成器 yield 委托错误**（静默丢事件/死循环） | 极高 | L4 MVP 强制 + biome lint 检测 `yield*` 模式 |
| **H3 循环依赖 require() 迁移后失效** | 高 | P0.5 前置调研，C1 优先处理 |
| **H7 C6 单点阻塞** | ~~高~~ **已解除（v3.1）** | ~~Plan B：C9/C10 并行路径~~ **C6 已按 Plan C-2 完成**（runner.ts 单文件，见 §6.7），单点阻塞风险消除。C9/C10 也已独立完成。 |

### 11.1 回滚预案

- 每个 PR 独立可 revert。
- C1/C2 同 PR 内完成 shim 删除（H4），无窗口期 shim 残留风险。
- C6 阻塞时切换 fallback 路径（H7）。
- F1 前用 `bun run check:unused` + grep 验证外部无依赖。

## 12. 不做的事 —— v2 修正（H5 放宽）

- **不重组 `packages/builtin-tools/`**——通过 `tools/builtin/index.ts` 唯一接入。
- **不重写 `Command` 类型**——原基础上扩展字段。
- **不改 React 组件结构**——但 `REPL.tsx` 中 `getTools()` 调用点需修改（H5 强制）。
- **不改 `services/`**（除迁出的 tools / searchExtraTools）。
- **不改 API 兼容层**（OpenAI/Gemini/Grok/Bedrock）—— 对接 `query/api.ts` 一处。
- **不引入新运行时依赖**——`commander` 已有，`dependency-cruiser`/`madge` 为 dev-only。
- **不加新 feature flag**——所有现有 feature 行为完全不变。
- **不重写 UI 中的 `feature()` 调用**（F2 修正）——UI 功能级 feature 约 200 处保留现状，超出本设计范围。
- **不动 `src/components/`**——149 个组件保持原样。

## 13. 预期收益 —— v2 补 ROI 分析（L3）

### 13.1 量化收益

| 指标 | 拆分前 | 拆分后 |
|------|--------|--------|
| `src/main.tsx` | 5640 行 | ~~0（删除）~~ **1615 行（v3/Plan C 永久保留，见 §6.6）**。subcommand 链（~840 行）、defaultAction 协调逻辑已迁出，main.tsx 瘦身 ~4025 行。 |
| `src/query.ts` + `src/QueryEngine.ts` | 3422 行（2 文件） | ~3400 行（22 文件，平均 155 行） |
| `src/Tool.ts` + `src/tools.ts` + `src/constants/tools.ts` | 1403 行（3 文件） | ~1400 行（5 个 `tools/` 子目录） |
| `src/services/tools/` | 3263 行（4 文件） | ~3300 行（`tools/execution/` 8 文件） |
| `src/commands.ts` | 850 行手动注册 | ~50 行（registry + 查询函数） |
| 全项目可单测模块数 | ~30 | ~80 |
| `feature()` 工具注册级散布 | ~15 处 | 1 处边界（`feature-gate.ts`） |
| `feature()` 全局散布 | 214 文件 | 214 文件（不在范围） |

### 13.2 ROI 分析（L3 修正）

**v1 主要卖点"零改中央注册"对反编译项目收益有限**——每年新增 2-3 个命令，省掉的中央注册编辑成本约为每年 5 分钟。这不是合理的主卖点。

**v2 重新定位主要卖点：**

1. **可单测模块数 30 → 80**（最大收益）
   - 当前 `queryLoop()` 1664 行生成器无法单测；拆分后每个子模块 100-300 行可独立测试。
   - 减少 mock 链：当前测试被迫 mock `log.ts` → `bootstrap/state.ts` → `realpathSync`；拆分后副作用边界化，mock 数量减半。

2. **构建产物稳定性**（F1 修复带来的副作用收益）
   - 当前 `require()` 动态加载绕过 tsc 类型检查；改用编译期生成后，新增命令的 spec 错误在编译期暴露。

3. **改 compaction 不破坏流解码**（H1 收益）
   - 当前 `queryLoop()` 1664 行混合流解码 + 工具派发 + autonomy + 错误恢复；拆分后改 compaction 只动 `engine/compaction.ts`，不会意外破坏流解码。

4. **新增 feature-gated 工具零改 assembler**（次要收益）
   - 当前需要在 `tools.ts` 加 feature() 三元表达式；改后只需在 `feature-gate.ts` 加一行声明 + L2 启动期校验。

**ROI 量化估算：**
- 工程投入：18 PR × 2 周 = 1.5 人月
- 长期收益：每年节省调试时间约 20 小时（基于模块隔离带来的回归 bug 减少 50% 假设）
- 投资回收期：约 3 个月（按 1.5 人月成本 / 每月节省 20 小时 × 高级工程师时薪）

**对比备选方案 ROI：**
- 仅做 query/engine 拆分（C9+C10）：~6 PR / 3 天，最大可单测性收益，但放弃其他收益。
- 仅做工具系统统一（C1+C2）：~3 PR / 2 天，中等收益。
- v2 全量方案：18 PR / 2 周，全面收益。

**结论**：v2 全量方案 ROI 合理，但**主要卖点必须重新定位为"可单测模块数 30→80"**，而非 v1 的"零改中央注册"。
