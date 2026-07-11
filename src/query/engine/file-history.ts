import type { EngineState } from '../types.js'
import type { Message } from '../../types/message.js'
import type { AppState } from '../../state/AppState.js'
import type { FileHistoryState } from '../../utils/fileHistory.js'
import {
  fileHistoryEnabled as _fileHistoryEnabled,
  fileHistoryMakeSnapshot as _fileHistoryMakeSnapshot,
} from '../../utils/fileHistory.js'

export interface FileSnapshot {
  path: string
  content: string
  timestamp: number
}

/**
 * 快照文件历史（模式 B：Promise）。
 * 替代 QueryEngine.ts submitMessage 中的 snapshotHistory 调用。
 *
 * 注：此为 C10 拆分的新骨架实现。生产 src/QueryEngine.ts 保留原样（Plan B）。
 */
export async function snapshotHistory(
  state: EngineState,
): Promise<FileSnapshot[]> {
  const snapshots: FileSnapshot[] = []
  const filesToSnapshot = extractFilePaths(state.messages)

  for (const filePath of filesToSnapshot) {
    try {
      const { readFile } = await import('node:fs/promises')
      const content = await readFile(filePath, 'utf8')
      const snapshot: FileSnapshot = {
        path: filePath,
        content,
        timestamp: Date.now(),
      }
      snapshots.push(snapshot)
      state.fileHistorySnapshots.set(filePath, snapshot)
    } catch {
      // 文件可能已删除，跳过
    }
  }
  return snapshots
}

function extractFilePaths(messages: EngineState['messages']): string[] {
  const paths = new Set<string>()
  for (const msg of messages) {
    const content = (msg as { content?: unknown[] }).content
    if (!Array.isArray(content)) continue
    for (const block of content) {
      const b = block as { type?: string; path?: string; file_path?: string }
      if (b.type === 'tool_result' && (b.path || b.file_path)) {
        paths.add(b.path ?? b.file_path!)
      }
    }
  }
  return Array.from(paths)
}

export function getHistorySnapshot(
  state: EngineState,
  filePath: string,
): FileSnapshot | undefined {
  return state.fileHistorySnapshots.get(filePath) as FileSnapshot | undefined
}

// ────────────────────────────────────────────────────────────────────────────
// 生产 helpers（C10.5 迁移自 src/QueryEngine.ts）
// ────────────────────────────────────────────────────────────────────────────

/**
 * 可选的 MessageSelector 过滤器（React/ink 边界，延迟 require）。
 */
interface MessageSelectorModule {
  selectableUserMessagesFilter(msg: unknown): boolean
}
const messageSelector = (): MessageSelectorModule | null => {
  try {
    return require('src/components/MessageSelector.js') as MessageSelectorModule
  } catch {
    return null
  }
}

/**
 * 用户输入消息的文件历史快照（原 submitMessage :657-672）。
 *
 * 仅在 fileHistoryEnabled() && persistSession 时触发。
 * fire-and-forget（void），updater 写回 AppState.fileHistory。
 */
export function snapshotUserInputHistory(
  messagesFromUserInput: readonly Message[],
  setAppState: (f: (prev: AppState) => AppState) => void,
  persistSession: boolean,
): void {
  if (!_fileHistoryEnabled() || !persistSession) return
  const _sel = messageSelector()
  const _filter =
    _sel?.selectableUserMessagesFilter ?? ((_msg: unknown) => true)
  messagesFromUserInput.filter(_filter).forEach(message => {
    void _fileHistoryMakeSnapshot(
      (updater: (prev: FileHistoryState) => FileHistoryState) => {
        setAppState(prev => ({
          ...prev,
          fileHistory: updater(prev.fileHistory),
        }))
      },
      message.uuid,
    )
  })
}
