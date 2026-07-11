import { describe, test, expect } from 'bun:test'
import { normalizeOptions } from '../options-normalizer.js'

describe('normalizeOptions', () => {
  test('默认值正确', () => {
    const result = normalizeOptions({})
    expect(result.permissionMode).toBe('default')
    expect(result.sessionId).toBeDefined()
    expect(typeof result.sessionId).toBe('string')
    expect(result.cwd).toBe(process.cwd())
    expect(result.isContinue).toBe(false)
  })

  test('--resume 与 --continue 互斥', () => {
    expect(() => normalizeOptions({ resume: 'xxx', continue: true })).toThrow(
      /mutually exclusive/,
    )
  })

  test('--print 触发 headless 且与 --resume 互斥', () => {
    expect(() =>
      normalizeOptions({ print: 'hello' as unknown as boolean, resume: 'xxx' }),
    ).toThrow(/cannot be used with/)
  })

  test('--dangerously-skip-permissions 设 bypassPermissions', () => {
    const result = normalizeOptions({ dangerouslySkipPermissions: true })
    expect(result.permissionMode).toBe('bypassPermissions')
  })

  test('--print 触发 headless', () => {
    const result = normalizeOptions({ print: 'hello' as unknown as boolean })
    expect(result.isHeadless).toBe(true)
  })

  test('--permission-mode 合法值透传', () => {
    const result = normalizeOptions({ permissionMode: 'acceptEdits' })
    expect(result.permissionMode).toBe('acceptEdits')
  })

  test('--permission-mode 非法值回落为 default', () => {
    const result = normalizeOptions({ permissionMode: 'bogus-mode' })
    expect(result.permissionMode).toBe('default')
  })

  test('isResume 检测 resume 字段存在（字符串）', () => {
    const result = normalizeOptions({ resume: 'session-123' })
    expect(result.isResume).toBe(true)
    expect(result.isContinue).toBe(false)
  })

  test('isResume 检测 resume 字段存在（布尔 true）', () => {
    const result = normalizeOptions({ resume: true })
    expect(result.isResume).toBe(true)
  })

  test('显式 sessionId 透传', () => {
    const result = normalizeOptions({ sessionId: 'fixed-id' })
    expect(result.sessionId).toBe('fixed-id')
  })

  test('显式 cwd 透传', () => {
    const result = normalizeOptions({}, '/custom/path')
    expect(result.cwd).toBe('/custom/path')
  })
})
