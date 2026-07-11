import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('C4 cli/program', () => {
  test('createProgram 返回 Commander 实例', async () => {
    const { createProgram } = await import('../../src/cli/program/index.ts')
    const program = createProgram()
    expect(program).toBeDefined()
    expect(program.name()).toBe('claude')
  })

  test('program 含 --print option', async () => {
    const { createProgram } = await import('../../src/cli/program/index.ts')
    const program = createProgram()
    const { registerGlobalOptions } = await import(
      '../../src/cli/program/options.ts'
    )
    registerGlobalOptions(program)
    const options = program.options.map(o => o.flags)
    expect(options.some(f => f.includes('--print'))).toBe(true)
  })

  test('program 含 --resume option', async () => {
    const { createProgram } = await import('../../src/cli/program/index.ts')
    const program = createProgram()
    const { registerGlobalOptions } = await import(
      '../../src/cli/program/options.ts'
    )
    registerGlobalOptions(program)
    const options = program.options.map(o => o.flags)
    expect(options.some(f => f.includes('--resume'))).toBe(true)
  })

  test('registerGlobalOptions 注册至少 30 个 option', async () => {
    const { registerGlobalOptions } = await import(
      '../../src/cli/program/options.ts'
    )
    const { Command } = await import('@commander-js/extra-typings')
    const program = new Command()
    registerGlobalOptions(program)
    expect(program.options.length).toBeGreaterThan(30)
  })

  test('main.tsx 行数减少', () => {
    const content = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8')
    const lines = content.split('\n').length
    expect(lines).toBeLessThan(5200)
  })

  test('ProgramOptions 类型存在', async () => {
    const mod = await import('../../src/cli/program/types.ts')
    expect(mod).toBeDefined()
  })
})
