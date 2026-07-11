import { describe, test, expect } from 'bun:test'
import { execSync, type ExecSyncOptions } from 'node:child_process'
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs'
import path from 'node:path'

const REPO_ROOT = path.resolve(process.cwd())
const CONFIG_PATH = path.resolve(REPO_ROOT, '.dependency-cruiser.js')

const EXEC_OPTS: ExecSyncOptions = {
  cwd: REPO_ROOT,
  stdio: 'pipe',
  encoding: 'utf8',
  // 给 depcruise 足够时间（3711 modules 需要数秒）
  timeout: 60_000,
  env: { ...process.env, FORCE_COLOR: '0' },
}

/**
 * 在指定目录下创建临时违规文件，跑 depcruise（仅 cruise 该文件 + 依赖），
 * 断言退出码非 0 + 输出包含预期规则名。
 *
 * 关键加速：用 `--include-only` 限制 cruise 范围到相关子树，避免递归
 * 扫描整个 3711 模块的代码库（>5s 默认 timeout）。这样每次测试只 cruise
 * 数十到数百个模块（<1s），仍然能检测到违规。
 *
 * 这是真正的回归测试（不是只查配置文本），确保 depcruise 护栏真的能拦截违规。
 */
function expectViolation(opts: {
  ruleName: string
  violationFile: string
  violationContent: string
  includeOnly: string
}): void {
  const { ruleName, violationFile, violationContent, includeOnly } = opts
  const fullPath = path.resolve(REPO_ROOT, violationFile)

  mkdirSync(path.dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, violationContent)

  try {
    let combinedOutput = ''
    let exitCode = 0
    try {
      const out = execSync(
        `bunx depcruise ${violationFile} --config --output-type err --include-only '${includeOnly}'`,
        EXEC_OPTS,
      )
      combinedOutput = typeof out === 'string' ? out : out.toString()
    } catch (err) {
      const e = err as {
        status?: number
        stdout?: string | Buffer
        stderr?: string | Buffer
      }
      exitCode = e.status ?? 1
      combinedOutput =
        (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '')
    }

    expect(exitCode, `期望退出码非 0，实际 ${exitCode}`).not.toBe(0)
    expect(
      combinedOutput,
      `期望输出包含规则名 "${ruleName}"，实际输出:\n${combinedOutput}`,
    ).toContain(ruleName)
  } finally {
    if (existsSync(fullPath)) rmSync(fullPath, { force: true })
  }
}

describe('F4: dependency-cruiser 严格模式 — 真实违规拦截', () => {
  describe('配置完整性', () => {
    test('所有规则 severity 为 error（CI 必须阻断）', () => {
      const content = readFileSync(CONFIG_PATH, 'utf8')
      const severities = content.match(/severity:\s*['"](\w+)['"]/g) || []
      const warnCount = severities.filter(s => s.includes('warn')).length
      const errorCount = severities.filter(s => s.includes('error')).length

      expect(warnCount).toBe(0)
      expect(errorCount).toBeGreaterThan(0)
    })

    test('核心架构边界规则存在', () => {
      const content = readFileSync(CONFIG_PATH, 'utf8')
      const expectedRules = [
        'query-loop-no-engine',
        'query-api-no-loop',
        'query-engine-no-cli',
        'tools-core-no-registry',
        'tools-registry-no-execution',
        'cli-dispatcher-no-command-impl',
        'feature-bundle-tool-boundary',
      ]
      for (const rule of expectedRules) {
        expect(content).toContain(`name: '${rule}'`)
      }
    })

    test('配置包含 tsConfig（别名解析必需）', () => {
      const content = readFileSync(CONFIG_PATH, 'utf8')
      expect(content).toMatch(/tsConfig:\s*\{[^}]*fileName/)
    })

    test('配置包含 enhancedResolveOptions.extensions（TS 扩展名识别）', () => {
      const content = readFileSync(CONFIG_PATH, 'utf8')
      expect(content).toMatch(/extensions:\s*\[/)
      expect(content).toMatch(/'\.ts'/)
      expect(content).toMatch(/'\.tsx'/)
    })
  })

  describe('package.json / CI 集成', () => {
    test('lint:deps:strict 用 glob 模式扫描 TS 文件', () => {
      const pkg = JSON.parse(
        readFileSync(path.resolve(REPO_ROOT, 'package.json'), 'utf8'),
      )
      // 必须用 glob 模式 - 直接 'depcruise src' 在 TS 6 项目下会漏 99% 模块
      expect(pkg.scripts['lint:deps:strict']).toMatch(
        /depcruise\s+['"]?src\/\*\*\/\*\.\{ts,tsx/,
      )
    })

    test('lint:deps 用 glob 模式扫描 TS 文件（与 strict 相同）', () => {
      const pkg = JSON.parse(
        readFileSync(path.resolve(REPO_ROOT, 'package.json'), 'utf8'),
      )
      expect(pkg.scripts['lint:deps']).toMatch(
        /depcruise\s+['"]?src\/\*\*\/\*\.\{ts,tsx/,
      )
    })

    test('precheck 包含 lint:deps:strict', () => {
      const pkg = JSON.parse(
        readFileSync(path.resolve(REPO_ROOT, 'package.json'), 'utf8'),
      )
      expect(pkg.scripts.precheck).toContain('lint:deps:strict')
    })

    test('ci.yml 包含 dependency-cruiser 步骤', () => {
      const ciPath = path.resolve(REPO_ROOT, '.github/workflows/ci.yml')
      const content = readFileSync(ciPath, 'utf8')
      expect(content).toContain('lint:deps:strict')
    })
  })

  describe('规则真实触发（注入违规 → 断言拦截）', () => {
    test('query-loop-no-engine: loop import engine 被拦截', () => {
      expectViolation({
        ruleName: 'query-loop-no-engine',
        violationFile: 'src/query/loop/__test_violation__.ts',
        violationContent:
          "import { QueryEngine } from '../engine/QueryEngine.js'\n",
        includeOnly: 'src/query',
      })
    })

    test('query-api-no-loop: api.ts 前缀文件 import loop 被拦截', () => {
      // 文件名需匹配 from.path '^src/query/api'（src/query/api.ts 是文件不是目录）
      // 所以违规文件名也必须以 'api' 开头
      expectViolation({
        ruleName: 'query-api-no-loop',
        violationFile: 'src/query/api_violation__.ts',
        violationContent: "import { x } from './loop/index.js'\n",
        includeOnly: 'src/query',
      })
    })

    test('query-engine-no-cli: engine import cli 被拦截', () => {
      expectViolation({
        ruleName: 'query-engine-no-cli',
        violationFile: 'src/query/engine/__test_violation__.ts',
        violationContent:
          "import { x } from '../../cli/dispatcher/runner.js'\n",
        // 必须包含 cli/ 让违规被检测到
        includeOnly: 'src/(query|cli)',
      })
    })

    test('tools-core-no-registry: core import registry 被拦截', () => {
      expectViolation({
        ruleName: 'tools-core-no-registry',
        violationFile: 'src/tools/core/__test_violation__.ts',
        violationContent: "import { x } from '../registry/index.js'\n",
        includeOnly: 'src/tools',
      })
    })

    test('tools-registry-no-execution: registry import execution 被拦截', () => {
      expectViolation({
        ruleName: 'tools-registry-no-execution',
        violationFile: 'src/tools/registry/__test_violation__.ts',
        violationContent: "import { x } from '../execution/index.js'\n",
        includeOnly: 'src/tools',
      })
    })

    test('cli-dispatcher-no-command-impl: dispatcher import command 被拦截', () => {
      expectViolation({
        ruleName: 'cli-dispatcher-no-command-impl',
        violationFile: 'src/cli/dispatcher/__test_violation__.ts',
        violationContent:
          "import { x } from '../../commands/session/clear/clear.js'\n",
        includeOnly: 'src/(cli|commands)',
      })
    })

    test('feature-bundle-tool-boundary: tools/core import bun:bundle 被拦截', () => {
      expectViolation({
        ruleName: 'feature-bundle-tool-boundary',
        violationFile: 'src/tools/core/__test_violation__.ts',
        violationContent:
          "import { feature } from 'bun:bundle'\nexport const f = feature('X')\n",
        // 必须包含 '^bundle$' — bun:bundle 被 depcruise 规范化为 'bundle'，
        // 用 include-only 过滤时需要把它包括进来，否则违规 to 模块被过滤掉
        includeOnly: '(src/tools|^bundle$)',
      })
    })
  })

  describe('当前代码库合规性（完整 cruise）', () => {
    // 完整 cruise ~5s，单独给 timeout
    test(
      'lint:deps:strict 退出码 0（零架构违规）',
      () => {
        expect(() => {
          execSync('bun run lint:deps:strict', EXEC_OPTS)
        }).not.toThrow()
      },
      { timeout: 60_000 },
    )

    test(
      'depcruise cruise 出 >1000 个模块（验证扫描覆盖范围）',
      () => {
        let output = ''
        try {
          output = execSync(
            "bunx depcruise 'src/**/*.{ts,tsx,js,jsx}' --config --output-type err",
            EXEC_OPTS,
          ) as string
        } catch (err) {
          const e = err as { stdout?: string | Buffer }
          output = e.stdout?.toString() ?? ''
        }
        const match = output.match(/(\d+)\s+modules,\s+(\d+)\s+dependencies/)
        expect(
          match,
          `期望匹配 "N modules, M dependencies"，输出:\n${output}`,
        ).not.toBeNull()
        const moduleCount = Number.parseInt(match![1], 10)
        // 修复前只有 10 modules / 0 dependencies，修复后应 >1000
        expect(moduleCount).toBeGreaterThan(1000)
      },
      { timeout: 60_000 },
    )
  })
})
