# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI coding agents when working with code in this repository.

## Project Overview

Reverse-engineered Claude Code CLI tool — restore core functionality, trim secondary capabilities. TypeScript strict mode enforced — **`bun run precheck` 必须零错误通过**（typecheck + lint fix + test）。

## 记忆与大脑闭环（硬规则）

**每个会话必须执行，不等用户提醒：**

1. **会话启动** → 读 `memory/MEMORY.md` 了解最近操作 + 读 Vault `大脑/北极星.md` 了解当前焦点
2. **任何代码改动后** → 即时更新 `memory/ccb/` 下的项目记忆文件
3. **任务完成前** → 更新 Vault `log.md`（操作日志）+ `每日/`（每日笔记）

> 记忆目录：`J:/claude-code-portable/portable-config/projects/J--claude-code-portable-claude-code-src/memory/`
> Vault 路径：`J:/claude-code-portable/zuo-vault/`

## Git Commit Convention

```
<type>: <描述>    # feat / fix / docs / chore / refactor / test / perf / ci
```

## 规则文件索引

| 你在做什么 | 查阅 |
|-----------|------|
| 构建/测试/Lint/开发 | `.claude/rules/ops-dev.md` |
| 了解代码架构 | `.claude/rules/ref-architecture.md` |
| 了解工具系统 | `.claude/rules/ref-architecture.md`（Tool System 段） |
| 了解 workspace 包 | `.claude/rules/ref-packages.md` |
| 使用 OpenAI/Gemini/Grok 兼容层 | `.claude/rules/ref-api-compat.md` |
| 添加/修改 Feature Flag | `.claude/rules/ref-features.md` |
| 写测试（Mock 规范） | `.claude/rules/testing-mocks.md`（条件加载） |
| 设计 Web UI | `.claude/rules/design.md`（条件加载）+ `.impeccable.md` |

## Feature Flag 关键规则

- `import { feature } from 'bun:bundle'` — Bun 内置模块，不要用自定义函数替代
- **`feature()` 只能用于 `if` 或三元表达式条件位置**（Bun 编译器限制）
  - ✅ `if (feature('X')) {}` 或 `feature('X') ? a : b`
  - ❌ `const x = feature('X')` / `() => feature('X')` / `feature('X') && doY()`
- 运行时默认全部 `false`，dev 全部启用，build 65+ 个默认启用
- 详见 `.claude/rules/ref-features.md`

## Working with This Codebase

- **precheck must pass** — 任何修改后运行 `bun run precheck`，不能引入类型/lint/测试错误
- **Biome 配置** — 42 条规则关闭（decompiled 代码），仅 `recommended` 基线。`.tsx` 120 行宽 + 强制分号，其他 80 行宽按需分号
- **`src/` path alias** — `import { ... } from 'src/utils/...'` 有效（tsconfig maps）
- **MACRO defines** — 集中管理在 `scripts/defines.ts`，版本号只改这个文件
- **Ink 框架在 `packages/@ant/ink/`** — 不是 `src/ink/`
- **React Compiler output** — 组件有 `_c(N)` memoization（decompiled 产物，正常）
- **`@ts-expect-error` 维护** — 只在下方确实有类型错误时保留，TS2578（unused directive）直接移除
- **tsc vs Biome 冲突** — 属性声明但只写不读时用 `// biome-ignore lint/correctness/noUnusedPrivateClassMembers`
- **禁止 `as any`**（生产代码），用 `as unknown as SpecificType` 或 `Record<string, unknown>`
- **构建产物兼容 Node.js** — `build.ts` 自动后处理 `import.meta.require`

## Testing

- 框架：`bun:test` | 单元测试：`src/**/__tests__/` | 集成测试：`tests/integration/`
- 共享 mock：`tests/mocks/`（`log.ts`、`debug.ts` 用共享 mock，不要内联定义）
- Mock 核心规则：只 mock 有副作用的依赖链，不 mock 纯函数；禁止 mock 被测模块的上层业务模块
- Mock 污染：Bun `mock.module` 进程全局（last-write-wins），不是 per-file 隔离
- 详见 `.claude/rules/testing-mocks.md`（条件加载，编辑测试文件时生效）

## 穷鬼模式（Budget Mode）

`/poor` 命令切换，持久化到 `settings.json`。启用后跳过 `extract_memories`、`prompt_suggestion`、`verification_agent`。

## 设计上下文

设计 Web UI 时参考 `.impeccable.md` 和 `.claude/rules/design.md`（条件加载）。
