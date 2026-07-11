// src/cli/subcommands/task.ts
import type { Command } from '@commander-js/extra-typings'
import { TASK_STATUSES } from '../../utils/tasks.js'

/**
 * 注册 task（ANT-ONLY）及其子命令（create/list/get/update/dir）。
 * 替代 main.tsx 中 program.command('task')... 链（原行 4873-4940）。
 *
 * 只在 process.env.USER_TYPE === 'ant' 时注册。
 */
export function define(program: Command): void {
  if (process.env.USER_TYPE !== 'ant') {
    return
  }

  const taskCmd = program
    .command('task')
    .description('[ANT-ONLY] Manage task list tasks')

  taskCmd
    .command('create <subject>')
    .description('Create a new task')
    .option('-d, --description <text>', 'Task description')
    .option('-l, --list <id>', 'Task list ID (defaults to "tasklist")')
    .action(
      async (
        subject: string,
        opts: { description?: string; list?: string },
      ) => {
        const { taskCreateHandler } = await import('../handlers/ant.js')
        await taskCreateHandler(subject, opts)
      },
    )

  taskCmd
    .command('list')
    .description('List all tasks')
    .option('-l, --list <id>', 'Task list ID (defaults to "tasklist")')
    .option('--pending', 'Show only pending tasks')
    .option('--json', 'Output as JSON')
    .action(
      async (opts: { list?: string; pending?: boolean; json?: boolean }) => {
        const { taskListHandler } = await import('../handlers/ant.js')
        await taskListHandler(opts)
      },
    )

  taskCmd
    .command('get <id>')
    .description('Get details of a task')
    .option('-l, --list <id>', 'Task list ID (defaults to "tasklist")')
    .action(async (id: string, opts: { list?: string }) => {
      const { taskGetHandler } = await import('../handlers/ant.js')
      await taskGetHandler(id, opts)
    })

  taskCmd
    .command('update <id>')
    .description('Update a task')
    .option('-l, --list <id>', 'Task list ID (defaults to "tasklist")')
    .option('-s, --status <status>', `Set status (${TASK_STATUSES.join(', ')})`)
    .option('--subject <text>', 'Update subject')
    .option('-d, --description <text>', 'Update description')
    .option('--owner <agentId>', 'Set owner')
    .option('--clear-owner', 'Clear owner')
    .action(
      async (
        id: string,
        opts: {
          list?: string
          status?: string
          subject?: string
          description?: string
          owner?: string
          clearOwner?: boolean
        },
      ) => {
        const { taskUpdateHandler } = await import('../handlers/ant.js')
        await taskUpdateHandler(id, opts)
      },
    )

  taskCmd
    .command('dir')
    .description('Show the tasks directory path')
    .option('-l, --list <id>', 'Task list ID (defaults to "tasklist")')
    .action(async (opts: { list?: string }) => {
      const { taskDirHandler } = await import('../handlers/ant.js')
      await taskDirHandler(opts)
    })
}
