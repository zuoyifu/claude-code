import { describe, test, expect } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

describe('命令注册表生成（build 集成）', () => {
  test('generated.ts 文件存在', () => {
    const p = path.resolve(process.cwd(), 'src/commands/_registry/generated.ts')
    expect(existsSync(p)).toBe(true)
  })

  test('generated.ts 包含 AUTO-GENERATED 标记', () => {
    const p = path.resolve(process.cwd(), 'src/commands/_registry/generated.ts')
    const content = readFileSync(p, 'utf8')
    expect(content).toContain('AUTO-GENERATED')
    expect(content).toContain('DO NOT EDIT')
    expect(content).toContain('REGISTERED_COMMANDS')
  })

  test('生成脚本可独立运行', () => {
    const output = execSync('bun run scripts/generate-command-registry.ts', {
      cwd: process.cwd(),
    }).toString()
    expect(output).toMatch(/Generated \d+ commands/)
  })

  test('build 流程正常完成', () => {
    // 跑 build 而非 build:vite（更快）
    const output = execSync('bun run build 2>&1', {
      cwd: process.cwd(),
    }).toString()
    expect(output).not.toContain('Build failed')
    expect(output).toMatch(/command registry generated|Generated \d+ commands/)
  })

  test('生成结果 commit 在仓库中（非 gitignore）', () => {
    const output = execSync(
      'git check-ignore src/commands/_registry/generated.ts || echo NOT_IGNORED',
      {
        cwd: process.cwd(),
      },
    ).toString()
    expect(output.trim()).toBe('NOT_IGNORED')
  })
})
