/** @type {import('dependency-cruiser').IConfiguration} */
export default {
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
      to: {
        path: '^src/tools/(registry|execution|discovery|builtin|presets)/',
      },
    },
    {
      name: 'tools-shared-isolation',
      severity: 'warn',
      comment:
        'v2 spec §3.2: tools/shared 是底层 helper，不得依赖其他 tools 子目录',
      from: { path: '^src/tools/shared/' },
      to: {
        path: '^src/tools/(registry|execution|discovery|builtin|presets|core)/',
      },
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
      to: { path: '^src/commands/[^_]' }, // 允许 import _registry
    },
    // F2 边界：feature() 调用约束（C2 完成后激活）
    {
      name: 'feature-bundle-tool-boundary',
      severity: 'warn', // F4 才会改为 error
      comment:
        'v2 spec §3.3: bun:bundle 在 tools/ 中只允许出现在 tools/registry/feature-gate.ts',
      from: { path: '^src/tools/(?!registry/feature-gate)' },
      to: { path: 'bun:bundle' },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    moduleSystems: ['es6', 'cjs'],
    tsPreCompilationDeps: true,
    reporterOptions: {
      text: {
        highlightFocused: true,
      },
    },
  },
}
