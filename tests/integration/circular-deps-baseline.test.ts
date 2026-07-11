import { describe, test, expect } from 'bun:test'
import { execSync } from 'node:child_process'
import { readFileSync, mkdtempSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

describe('循环依赖基线', () => {
  test('基线文档存在', () => {
    const p = path.resolve(
      process.cwd(),
      'docs/superpowers/refactor-assets/circular-deps-baseline.md',
    )
    expect(readFileSync(p, 'utf8')).toContain('## 分类')
  })

  test(
    'madge 可执行',
    () => {
      // madge 在发现循环依赖时退出码为 1（非 0），但 JSON 输出仍有效。
      // madge JSON 输出约 3.8MB（2282 个循环），execSync 默认 buffer 会被截断，
      // 改为写入临时文件后读取，避免 buffer 溢出。
      // madge 全量扫描 src/ 在冷启动时需要 ~10s（解析 + TS 编译），默认 5s timeout 不够。
      const tmp = mkdtempSync(path.join(tmpdir(), 'madge-'))
      const outPath = path.join(tmp, 'circular.json')
      // 使用 `|| true` 吞掉 madge 因发现循环而返回的非 0 退出码
      execSync(
        `bunx madge --circular --extensions ts,tsx --ts-config tsconfig.json --json src/ > ${outPath} 2>/dev/null || true`,
        {
          cwd: process.cwd(),
          shell: '/bin/zsh',
          timeout: 60_000,
        },
      )
      expect(existsSync(outPath)).toBe(true)
      const output = readFileSync(outPath, 'utf8')
      expect(() => JSON.parse(output)).not.toThrow()
    },
    { timeout: 60_000 },
  )

  test('A 类循环数已记录', () => {
    const p = path.resolve(
      process.cwd(),
      'docs/superpowers/refactor-assets/circular-deps-baseline.md',
    )
    const content = readFileSync(p, 'utf8')
    // 至少识别到 0 个或更多 A 类循环，文档必须明确给出
    expect(content).toMatch(/### 类型 A[\s\S]*?\| # \| 循环/)
  })
})
