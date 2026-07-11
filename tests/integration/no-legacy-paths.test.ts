import { describe, test, expect } from 'bun:test'
import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'

const REPO_ROOT = path.resolve(import.meta.dir, '..', '..')

describe('F1: old architecture paths have been cleaned up (Plan A complete)', () => {
  describe('deleted old god files', () => {
    // All 6 legacy god files have been fully deleted.
    // - src/Tool.ts, src/tools.ts, src/constants/tools.ts: deleted in C1/C2/C4/C5
    // - src/query.ts, src/QueryEngine.ts, src/commands.ts: shims removed after
    //   refactor/huge-split completed the migration to src/query/, src/query/engine/,
    //   and src/commands/_registry/ (Plan A final state).
    const deletedFiles = [
      'src/Tool.ts',
      'src/tools.ts',
      'src/constants/tools.ts',
      'src/query.ts',
      'src/QueryEngine.ts',
      'src/commands.ts',
    ]

    for (const file of deletedFiles) {
      test(`${file} does not exist (DELETED)`, () => {
        const fullPath = path.resolve(REPO_ROOT, file)
        expect(existsSync(fullPath)).toBe(false)
      })
    }
  })

  describe('permanently retained entry files', () => {
    // src/main.tsx: PERMANENTLY RETAINED (spec §6.6 / Plan C, decision 2026-07-12).
    //   Not a temporary shim — cli.tsx lazy-loads main.jsx as the runtime entry by design.
    //   ~1615 lines: subcommands + Commander + defaultAction migrated out, bootstrap + main() kept.
    const permanentFiles = ['src/main.tsx']

    for (const file of permanentFiles) {
      test(`${file} exists (permanently retained runtime entry)`, () => {
        const fullPath = path.resolve(REPO_ROOT, file)
        expect(existsSync(fullPath)).toBe(true)
      })
    }
  })

  describe('deleted old service directories', () => {
    const legacyDirs = ['src/services/tools', 'src/services/searchExtraTools']

    for (const dir of legacyDirs) {
      test(`${dir}/ does not exist (DELETED)`, () => {
        const fullPath = path.resolve(REPO_ROOT, dir)
        expect(existsSync(fullPath)).toBe(false)
      })
    }
  })

  describe('new architecture directories exist', () => {
    const newPaths = [
      'src/tools/core',
      'src/tools/registry',
      'src/tools/execution',
      'src/cli/program',
      'src/cli/dispatcher',
      'src/cli/subcommands',
      'src/commands/_registry',
      'src/query/loop',
      'src/query/engine',
    ]

    for (const p of newPaths) {
      test(`${p} exists`, () => {
        const fullPath = path.resolve(REPO_ROOT, p)
        expect(existsSync(fullPath)).toBe(true)
      })
    }
  })

  describe('new architecture files exist', () => {
    const newFiles = ['src/query/api.ts']

    for (const f of newFiles) {
      test(`${f} exists`, () => {
        const fullPath = path.resolve(REPO_ROOT, f)
        expect(existsSync(fullPath)).toBe(true)
      })
    }
  })

  describe('no residual imports to DELETED old paths in source tree', () => {
    test('rg grep for deleted-path imports returns 0 matches in src/', () => {
      // Only search for paths that were DELETED (not Plan B retained files)
      const patterns = [
        'from\\s+["\']src/Tool["\']',
        'from\\s+["\']src/Tool\\.ts["\']',
        'from\\s+["\']src/Tool\\.js["\']',
        'from\\s+["\']\\.\\.\\/Tool["\']',
        'from\\s+["\']\\.\\/Tool["\']',
        'from\\s+["\']src/tools["\']',
        'from\\s+["\']src/tools\\.ts["\']',
        'from\\s+["\']src/tools\\.js["\']',
        'from\\s+["\']src/constants/tools["\']',
        'from\\s+["\']src/constants/tools\\.ts["\']',
        'from\\s+["\']src/constants/tools\\.js["\']',
      ].join('|')

      let output: string
      try {
        output = execSync(
          `rg --no-heading --line-number -e '${patterns}' src/ 2>&1 || true`,
          {
            cwd: REPO_ROOT,
          },
        ).toString()
      } catch {
        output = ''
      }

      const lines = output
        .split('\n')
        .filter(l => l.trim().length > 0)
        .filter(l => !l.includes('node_modules'))

      expect(lines).toEqual([])
    })

    test('rg grep for deleted-path imports returns 0 matches in packages/', () => {
      const patterns = [
        'from\\s+["\'].*src/Tool["\']',
        'from\\s+["\'].*src/Tool\\.ts["\']',
        'from\\s+["\'].*src/Tool\\.js["\']',
        'from\\s+["\'].*src/tools["\']',
        'from\\s+["\'].*src/tools\\.ts["\']',
        'from\\s+["\'].*src/tools\\.js["\']',
        'from\\s+["\'].*src/constants/tools["\']',
        'from\\s+["\'].*src/constants/tools\\.ts["\']',
        'from\\s+["\'].*src/constants/tools\\.js["\']',
        'from\\s+["\'].*src/services/tools["\']',
        'from\\s+["\'].*src/services/searchExtraTools["\']',
      ].join('|')

      let output: string
      try {
        output = execSync(
          `rg --no-heading --line-number -e '${patterns}' packages/ 2>&1 || true`,
          {
            cwd: REPO_ROOT,
          },
        ).toString()
      } catch {
        output = ''
      }

      const lines = output
        .split('\n')
        .filter(l => l.trim().length > 0)
        .filter(l => !l.includes('node_modules'))

      expect(lines).toEqual([])
    })

    test('rg grep for deleted-path imports returns 0 matches in tests/ + scripts/', () => {
      const patterns = [
        'from\\s+["\'].*src/Tool["\']',
        'from\\s+["\'].*src/Tool\\.ts["\']',
        'from\\s+["\'].*src/Tool\\.js["\']',
        'from\\s+["\'].*src/tools["\']',
        'from\\s+["\'].*src/tools\\.ts["\']',
        'from\\s+["\'].*src/tools\\.js["\']',
        'from\\s+["\'].*src/constants/tools["\']',
        'from\\s+["\'].*src/constants/tools\\.ts["\']',
        'from\\s+["\'].*src/constants/tools\\.js["\']',
        'from\\s+["\'].*src/services/tools["\']',
        'from\\s+["\'].*src/services/searchExtraTools["\']',
      ].join('|')

      let output: string
      try {
        output = execSync(
          `rg --no-heading --line-number -e '${patterns}' tests/ scripts/ 2>&1 || true`,
          {
            cwd: REPO_ROOT,
          },
        ).toString()
      } catch {
        output = ''
      }

      const lines = output
        .split('\n')
        .filter(l => l.trim().length > 0)
        .filter(l => !l.includes('node_modules'))

      expect(lines).toEqual([])
    })
  })
})
