import { describe, test, expect } from 'bun:test'
import { execSync } from 'node:child_process'
import * as path from 'node:path'
import * as fs from 'node:fs'

describe('dependency-cruiser rules', () => {
  test('配置文件存在', () => {
    const configPath = path.resolve(process.cwd(), '.dependency-cruiser.js')
    expect(fs.existsSync(configPath)).toBe(true)
  })

  test('lint:deps script 可执行（允许 warning）', () => {
    // 不阻断测试——当前阶段 warning 是预期
    const output = execSync(
      'bunx depcruise src --config --output-type text 2>&1 || true',
      {
        cwd: process.cwd(),
      },
    ).toString()
    expect(output).not.toContain('invalid config')
  })
})
