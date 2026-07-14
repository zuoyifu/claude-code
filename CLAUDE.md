# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) and other AI coding agents when working with code in this repository.

## 🔴 便携铁律（最高优先级，Section 0）

**CCB 是 U 盘便携系统。所有代码、配置、脚本必须盘符无关，换机器零修改直接可用。**

| 禁止 | 原因 |
|------|------|
| 硬编码盘符（`J:\` `D:\` `C:\` 等） | U 盘每次不同盘符 |
| `Path.home()` | Windows 解析到 `C:\Users\...` |
| `~/.claude/` `~/.config/` 等 Unix 家目录路径 | 写到 C 盘，破坏自包含 |
| 任何便携根之外的绝对路径 | 换机器即炸 |

**正确做法**：引用路径用 `${PORTABLE_ROOT}/` 前缀（`claude-code-portable/` 的父目录），vault 路径用 `OBSIDIAN_VAULT_PATH` env var，Bash 脚本扫描 A-Z 发现盘符。

> 此规则覆盖本项目所有其他规则。违规代码不得提交。

---

## 🟢 双星协作协议 — CCB Side

> Grok 和 CCB 左右分屏协作（`duo.bat` 一键启动），通过 `{DRV}:\grok-build\` 下的共享文件通讯。

**会话启动时必须：**

1. 扫描 A-Z 盘符，找到 `grok-build\MAILBOX.md`（和 Grok 在同一 U 盘）
2. 读 `MAILBOX.md` → 查找 `→ CCB` 且 `Status: unread` 的消息
3. 读 `TURNFILE.yaml` → 了解当前 `phase`、`lead`、文件锁
4. 向用户报告：Grok 留了什么消息、当前谁在操作什么文件、什么阶段

**任务完成后：**

- 在 `MAILBOX.md` 回复消息（`Status` 改为 `actioned`）
- 追加 Grok 任务时：`### MSG-YYYYMMDD-NNN` 格式，含 From/To/Priority/Status/Subject
- 更新 `TURNFILE.yaml` 的 `phase` 和 `lead`

**消息优先级处理：**
- P0 → 立即响应
- P1 → 本次会话内处理
- P2 → 方便时处理，不阻塞当前工作

> 详细格式见 `{DRV}:\grok-build\home\skills\dual-agent\SKILL.md`

---

## Project Overview

Reverse-engineered Claude Code CLI tool — restore core functionality, trim secondary capabilities. TypeScript strict mode enforced — **`bun run precheck` 必须零错误通过**（typecheck + lint fix + test）。

## U 盘项目路由

**CCB 是 U 盘上 10 个项目之一**。收到任务时先判断属于哪个项目：
- 读 `../portable-config/projects/INDEX.md` 获取完整项目清单、路由规则、依赖关系
- 如果任务不属于 CCB 源码本身，切换到对应项目目录操作
- INDEX.md 中有关键词→项目映射表

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
| 下载文件 | `.claude/rules/ref-download-tools.md` |
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
