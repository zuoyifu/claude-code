/**
 * 命令注册表生成器——通用脚本，被 build.ts 和 dev.ts 调用。
 *
 * 流程：
 * 1. 扫描 src/commands/<category>/<name>/index.ts
 * 2. 生成 src/commands/_registry/generated.ts（静态 import 数组）
 *
 * 此脚本不直接执行业务，只产生代码。
 * 失败时抛错（让 build/dev 立即失败，而不是运行时炸）。
 */
import {
  scanCommands,
  generateRegistryCode,
} from '../src/commands/_registry/scanner.js'
import { writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'

const REPO_ROOT = path.resolve(import.meta.dirname, '..')
const SRC_ROOT = path.resolve(REPO_ROOT, 'src')
const OUTPUT_PATH = path.resolve(SRC_ROOT, 'commands/_registry/generated.ts')

export async function generateCommandRegistry(): Promise<{
  commandCount: number
  outputPath: string
}> {
  const commands = scanCommands(SRC_ROOT)
  const code = generateRegistryCode(commands)

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true })
  await writeFile(OUTPUT_PATH, code, 'utf8')

  return {
    commandCount: commands.length,
    outputPath: OUTPUT_PATH,
  }
}

// 直接执行时（`bun run scripts/generate-command-registry.ts`）
if (import.meta.main) {
  const result = await generateCommandRegistry()
  console.log(
    `Generated ${result.commandCount} commands → ${path.relative(REPO_ROOT, result.outputPath)}`,
  )
}
