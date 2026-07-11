// scripts/refactor/fix-command-paths-v2.js
// Improved: for moved files, check if a relative import can be resolved to a
// real file with one extra '../'. If yes, the original intent was the deeper
// path. Apply only when it improves resolvability.
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('src/commands')

const CATEGORIES = new Set([
  'session',
  'mcp',
  'model',
  'config',
  'memory',
  'skills',
  'plugins',
  'tasks',
  'ui',
  'debug',
  'review',
  'version',
  'files',
  'bridge',
  'daemon',
  '_misc',
])

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.[jt]sx?$/.test(entry.name)) out.push(full)
  }
  return out
}

function depthBelowCommands(filePath) {
  const rel = path.relative(ROOT, filePath)
  return rel.split(path.sep).length - 1
}

/**
 * Try to resolve a module path to a real file. Handles extension additions.
 */
function tryResolve(baseDir, spec) {
  const candidates = [
    spec,
    spec.replace(/\.js$/, '.ts'),
    spec.replace(/\.js$/, '.tsx'),
    spec.replace(/\.js$/, '.jsx'),
    spec + '.ts',
    spec + '.tsx',
    spec + '.js',
    spec + '/index.ts',
    spec + '/index.js',
    spec + '/index.tsx',
  ]
  for (const c of candidates) {
    const full = path.resolve(baseDir, c)
    if (existsSync(full)) return full
  }
  return null
}

let totalChanged = 0
const files = walk(ROOT)
for (const file of files) {
  const depth = depthBelowCommands(file)
  if (depth < 1) continue
  const parts = path.relative(ROOT, file).split(path.sep)
  if (!CATEGORIES.has(parts[0])) continue

  const original = readFileSync(file, 'utf8')
  let changed = original
  const baseDir = path.dirname(file)

  const fixOne = (match, pre, q, spec, post) => {
    if (!spec.startsWith('.')) return match
    // Does the current spec resolve?
    if (tryResolve(baseDir, spec) !== null) return match
    // Try with one extra '../'
    let newSpec
    if (spec === '.') newSpec = '..'
    else if (spec === '..') newSpec = '../..'
    else if (spec.startsWith('./')) newSpec = '../' + spec
    else if (spec.startsWith('../')) newSpec = '../' + spec
    else return match
    if (tryResolve(baseDir, newSpec) !== null) {
      return `${pre}${q}${newSpec}${q}${post}`
    }
    return match
  }

  // from '...'
  changed = changed.replace(
    /(from\s+)(['"])(\.{1,2}[^'"]*)\2/g,
    (m, pre, q, spec) => fixOne(m, pre, q, spec, ''),
  )
  // require('...')
  changed = changed.replace(
    /(require\s*\(\s*)(['"])(\.{1,2}[^'"]*)\2(\s*\))/g,
    (m, pre, q, spec, post) => fixOne(m, pre, q, spec, post),
  )
  // import('...')
  changed = changed.replace(
    /(import\s*\(\s*)(['"])(\.{1,2}[^'"]*)\2(\s*\))/g,
    (m, pre, q, spec, post) => fixOne(m, pre, q, spec, post),
  )

  if (changed !== original) {
    writeFileSync(file, changed)
    totalChanged++
  }
}

console.log(`Fixed relative imports in ${totalChanged} files (v2)`)
