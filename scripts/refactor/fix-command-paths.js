// scripts/refactor/fix-command-paths.js
// One-shot script: for every .ts/.tsx file under src/commands/<category>/...,
// adjust relative imports that point outside the commands/ tree.
//
// Rule: a file at depth D below src/commands/ (where src/commands/ itself is depth 0)
// used to be at depth D-1. Its relative imports of the form '../...' that cross
// out of commands/ need one additional '../'.
//
// Concretely we walk each file, parse its location, and for each relative import
// (from '...') / require('...') that resolves outside src/commands/, we insert
// one extra '../' segment.
//
// We avoid touching imports that stay within commands/ (e.g. './foo.js' or
// '../sibling/index.js' inside the same category).
//
// Run once after the bulk git mv.
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve('src/commands')
const SRC_ROOT = path.resolve('src')

// Categories we moved INTO (depth-1 under commands/).
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

/**
 * Walk a directory recursively, returning all .ts/.tsx files.
 */
function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(full))
    else if (/\.[jt]sx?$/.test(entry.name)) out.push(full)
  }
  return out
}

/**
 * Compute the file's depth relative to src/commands/ (0 = directly in commands/).
 * E.g. src/commands/_misc/advisor.ts → 1
 *      src/commands/_misc/assistant/index.ts → 2
 */
function depthBelowCommands(filePath) {
  const rel = path.relative(ROOT, filePath)
  return rel.split(path.sep).length - 1 // subtract filename
}

/**
 * Does a resolved import path land outside src/commands/?
 */
function resolvesOutsideCommands(fromFile, importPath) {
  // Only consider relative paths
  if (!importPath.startsWith('.')) return false
  const baseDir = path.dirname(fromFile)
  const resolved = path.resolve(baseDir, importPath)
  const relToCommands = path.relative(ROOT, resolved)
  // If the relative path starts with '..', it's outside commands/
  return relToCommands.startsWith('..')
}

let totalChanged = 0
const files = walk(ROOT)
for (const file of files) {
  // Only touch files inside a category dir (depth >= 1)
  const depth = depthBelowCommands(file)
  if (depth < 1) continue
  const parts = path.relative(ROOT, file).split(path.sep)
  if (!CATEGORIES.has(parts[0])) continue

  const original = readFileSync(file, 'utf8')
  let changed = original

  // Match: from '....'  or  require('....')  or  import('....')
  // We add one '../' prefix to the relative spec when it resolves outside commands.
  const replaceImport = (match, specifier) => {
    if (!resolvesOutsideCommands(file, specifier)) return match
    // Add one '../' to the specifier
    let newSpec
    if (specifier === '.') newSpec = '..'
    else if (specifier === '..') newSpec = '../..'
    else if (specifier.startsWith('./')) newSpec = '../' + specifier
    else if (specifier.startsWith('../')) newSpec = '../' + specifier
    else return match
    return match.replace(specifier, newSpec)
  }

  // from '...'  (covers ES import & dynamic import('...'))
  changed = changed.replace(
    /(from\s+)(['"])(\.{1,2}[^'"]*)\2/g,
    (m, pre, q, spec) => {
      if (!resolvesOutsideCommands(file, spec)) return m
      let newSpec
      if (spec === '.') newSpec = '..'
      else if (spec === '..') newSpec = '../..'
      else if (spec.startsWith('./')) newSpec = '../' + spec
      else if (spec.startsWith('../')) newSpec = '../' + spec
      else return m
      return `${pre}${q}${newSpec}${q}`
    },
  )

  // require('...')
  changed = changed.replace(
    /(require\s*\(\s*)(['"])(\.{1,2}[^'"]*)\2(\s*\))/g,
    (m, pre, q, spec, post) => {
      if (!resolvesOutsideCommands(file, spec)) return m
      let newSpec
      if (spec === '.') newSpec = '..'
      else if (spec === '..') newSpec = '../..'
      else if (spec.startsWith('./')) newSpec = '../' + spec
      else if (spec.startsWith('../')) newSpec = '../' + spec
      else return m
      return `${pre}${q}${newSpec}${q}${post}`
    },
  )

  // import('...') dynamic — also covered by `from` regex? No, dynamic import uses import('...') not from.
  changed = changed.replace(
    /(import\s*\(\s*)(['"])(\.{1,2}[^'"]*)\2(\s*\))/g,
    (m, pre, q, spec, post) => {
      if (!resolvesOutsideCommands(file, spec)) return m
      let newSpec
      if (spec === '.') newSpec = '..'
      else if (spec === '..') newSpec = '../..'
      else if (spec.startsWith('./')) newSpec = '../' + spec
      else if (spec.startsWith('../')) newSpec = '../' + spec
      else return m
      return `${pre}${q}${newSpec}${q}${post}`
    },
  )

  if (changed !== original) {
    writeFileSync(file, changed)
    totalChanged++
  }
}

console.log(`Fixed relative imports in ${totalChanged} files`)
