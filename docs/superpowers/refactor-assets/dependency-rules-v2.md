# dependency-cruiser 规则与 v2 spec 对应

## 当前 baseline（P0 完成时）

- 跑 `bunx depcruise src --config` 输出约 0 条 warning
- 全部为预期：v2 目录结构尚未建立，规则引用的目录（`src/query/loop/`、`src/query/engine/`、`src/query/api`、`src/tools/core/`、`src/tools/registry/`、`src/tools/shared/`、`src/cli/dispatcher/`）暂不存在，因此规则不会触发

### 已知环境限制

- 项目使用 TypeScript 6.x，dependency-cruiser 16 的 TypeScript transpiler 声明的支持范围为 `>=2.0.0 <6.0.0`。当前 `.ts/.tsx` 解析在该约束下被标记为不可用，需通过 `src/**/*.ts` glob 显式扫描文件（depcruise 对目录参数不递归）。
- 后续 PR 在建立 v2 目录时，若需要 depcruise 解析 `.ts/.tsx` 内部依赖，可考虑：
  - 安装 `@swc/core` 并将 `parser` 设为 `swc`，或
  - 等待 dependency-cruiser 升级支持 TS 6.x，或
  - 在 CI 中以 glob 形式运行 `depcruise 'src/**/*.ts' --config`

## 当前 baseline（F4 完成时）

- 跑 `bun run lint:deps:strict` 退出码 0，零 warning，零 error。
- 所有 v2 架构边界规则以 `severity: 'error'` 级别生效。
- CI 在 Type check 后自动执行 `bun run lint:deps:strict`。
- `precheck` 已包含 `lint:deps:strict`，本地开发即可捕获架构违规。
- 任何 PR 引入违反 §3.2 分层约束的 import 都会被 CI 阻断。

## 规则演进计划

| PR | 启用规则 | 预期 warning 变化 |
|----|---------|-----------------|
| C1 完成 | tools-core-no-registry / tools-shared-isolation / tools-registry-no-execution | tools 相关 warning → 0 |
| C2 完成 | feature-bundle-tool-boundary | tools/ 中的 feature() warning → 0 |
| C7 完成 | cli-dispatcher-no-command-impl | cli 相关 warning → 0 |
| C10 完成 | query-loop-no-engine / query-api-no-loop / query-engine-no-cli | query 相关 warning → 0 |
| F4 | 全部 severity warn → error | 0 warning，违规即 CI fail | **已完成** — 所有规则收紧为 error，CI 已集成 `lint:deps:strict` 步骤。退出码 0 验证通过。 |
