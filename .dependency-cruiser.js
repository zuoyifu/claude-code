// dependency-cruiser 配置 — v2 架构 §3.2/§3.3/§7.6 边界规则。
//
// 命令（见 package.json）：
//   - lint:deps        本地诊断，--output-type err-long 显示规则 comment
//   - lint:deps:strict CI 阻断，默认 err 输出 + 非零退出码
//
// 两者规则集与 severity 完全相同（全部 error）。warning 级别无意义：
// CI 必须阻断违规，本地也应当看到相同的严格信号。差异只在输出可读性。
//
// 重要：depcruise 16.x 在本项目中必须用 glob 模式（在 package.json scripts 中）
// 显式列出 TS/TSX 文件 — 因为项目用的 TypeScript 6.x 不在 depcruise 16.x 原生
// 支持范围（<6.0.0），直接 depcruise src 只会扫描到 .js 文件（10 modules）。
// 见下方 options 注释，以及 package.json 的 lint:deps / lint:deps:strict 命令。
//
// 注意：本配置文件由 Bun 当作 TS 解析（项目 type:module + Bun 默认行为），
// 所以块注释（/-star star/）中不能出现某些 glob 字符序列 — Bun 的 TS 解析器
// 会把块注释里的 star-star-slash-star 误识别为类型运算符报错。因此本文件全部
// 使用行注释（//）。

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    // v2 spec §3.2 - query/ 三层强制单向依赖
    {
      name: 'query-loop-no-engine',
      severity: 'error',
      comment: 'v2 spec §7.6: query/loop 不得 import query/engine',
      from: { path: '^src/query/loop/' },
      to: { path: '^src/query/engine/' },
    },
    {
      name: 'query-api-no-loop',
      severity: 'error',
      comment: 'v2 spec §7.6: query/api 不得 import query/loop 或 query/engine',
      from: { path: '^src/query/api' },
      to: { path: '^src/query/(loop|engine)/' },
    },
    {
      name: 'query-engine-no-cli',
      severity: 'error',
      comment: 'v2 spec §7.6: query/engine 不得 import cli/',
      from: { path: '^src/query/engine/' },
      to: { path: '^src/cli/' },
    },
    // v2 spec §3.2 - tools 内部依赖方向
    {
      name: 'tools-core-no-registry',
      severity: 'error',
      comment: 'v2 spec §3.2: tools/core 是底层，不得依赖 tools/registry',
      from: { path: '^src/tools/core/' },
      to: {
        path: '^src/tools/(registry|execution|discovery|builtin)/',
      },
    },
    {
      name: 'tools-registry-no-execution',
      severity: 'error',
      comment: 'v2 spec §3.2: tools/registry 不得依赖 tools/execution',
      from: { path: '^src/tools/registry/' },
      to: { path: '^src/tools/(execution|discovery|builtin)/' },
    },
    // v2 spec §3.2 - cli 分层
    {
      name: 'cli-dispatcher-no-command-impl',
      severity: 'error',
      comment: 'v2 spec §3.2: cli/dispatcher 不得 import 具体 command 实现',
      from: { path: '^src/cli/dispatcher/' },
      to: {
        // 允许 import _registry；caches.ts 是 session 缓存清理工具（被 dispatcher
        // 和 command 共用），暂列豁免 — TODO 重构为 src/bootstrap/ 公共模块。
        path: '^src/commands/[^_]',
        pathNot: '^src/commands/session/clear/caches\\.ts$',
      },
    },
    // F2 边界：feature() 调用约束（C2 完成后激活）
    {
      name: 'feature-bundle-tool-boundary',
      severity: 'error',
      comment:
        'v2 spec §3.3: bun:bundle 在 tools/ 中只允许出现在 tools/registry/feature-gate.ts',
      // 注：depcruise 16.x 的 PROTOCOL_ONLY_BUILTINS 不含 bun:bundle，所以会把
      // `import 'bun:bundle'` 规范化为 module 名 'bundle'（剥掉 bun: 协议）。
      // 用 '^bundle$' 匹配规范化后的 to.path。
      from: { path: '^src/tools/(?!registry/feature-gate)' },
      to: { path: '^bundle$' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    moduleSystems: ['es6', 'cjs'],
    tsPreCompilationDeps: true,
    // depcruise 16.x 默认不解析目录下的 .ts/.tsx 文件，需要完整的 resolve 配置：
    //   - tsConfig: 提供 paths/baseUrl 等别名解析（项目用 src/* 别名）
    //   - enhancedResolveOptions.extensions: 让 enhanced-resolve 识别 .ts/.tsx
    //   - enhancedResolveOptions.exportsFields/conditionNames/mainFields: package.json 解析参数
    //   - builtInModules.add: 声明 Bun 运行时内置模块（bun, bun:ffi, bun:test 等）
    // 见 https://github.com/sverweij/dependency-cruiser/blob/main/doc/options-reference.md
    // 不加此项时 `depcruise src` 只 cruise 到 10 modules / 0 dependencies（仅 .js 入口）。
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      mainFields: ['module', 'main', 'types', 'typings'],
    },
    builtInModules: {
      add: [
        'bun',
        'bun:bundle',
        'bun:ffi',
        'bun:jsc',
        'bun:sqlite',
        'bun:test',
        'bun:wrap',
        'detect-libc',
        'undici',
        'ws',
      ],
    },
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
}
