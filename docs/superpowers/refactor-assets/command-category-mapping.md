# 命令分类映射（C3+C8 工作文档）

本表列出 src/commands/ 下所有命令目录/文件的分组决策。
规则：与现有 category 同名的命令保留在 category 根目录（depth-1，scanner 不捕获），
其余命令移入 `commands/<category>/<name>/`（depth-2，scanner 捕获）。

## session 分组（会话生命周期）
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| clear | commands/clear/ | commands/session/clear/ |
| resume | commands/resume/ | commands/session/resume/ |
| rewind | commands/rewind/ | commands/session/rewind/ |
| fork | commands/fork/ | commands/session/fork/ |
| rename | commands/rename/ | commands/session/rename/ |
| tag | commands/tag/ | commands/session/tag/ |
| compact | commands/compact/ | commands/session/compact/ |
| export | commands/export/ | commands/session/export/ |
| backfill-sessions | commands/backfill-sessions/ | commands/session/backfill-sessions/ |

## mcp 分组
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| mcp | commands/mcp/ | commands/mcp/（root，depth-1，不搬） |

## model 分组（模型与 provider）
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| model | commands/model/ | commands/model/（root，不搬） |
| login | commands/login/ | commands/model/login/ |
| logout | commands/logout/ | commands/model/logout/ |
| fast | commands/fast/ | commands/model/fast/ |
| effort | commands/effort/ | commands/model/effort/ |
| provider | commands/provider.ts | commands/model/provider.ts（loose file） |

## config 分组（配置与权限）
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| config | commands/config/ | commands/config/（root，不搬） |
| permissions | commands/permissions/ | commands/config/permissions/ |
| hooks | commands/hooks/ | commands/config/hooks/ |
| keybindings | commands/keybindings/ | commands/config/keybindings/ |
| theme | commands/theme/ | commands/config/theme/ |
| vim | commands/vim/ | commands/config/vim/ |
| privacy-settings | commands/privacy-settings/ | commands/config/privacy-settings/ |
| output-style | commands/output-style/ | commands/config/output-style/ |
| sandbox-toggle | commands/sandbox-toggle/ | commands/config/sandbox-toggle/ |

## memory 分组
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| memory | commands/memory/ | commands/memory/（root，不搬） |
| local-memory | commands/local-memory/ | commands/memory/local-memory/ |
| memory-stores | commands/memory-stores/ | commands/memory/memory-stores/ |
| vault | commands/vault/ | commands/memory/vault/ |
| local-vault | commands/local-vault/ | commands/memory/local-vault/ |

## skills 分组
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| skills | commands/skills/ | commands/skills/（root，不搬） |
| skill-search | commands/skill-search/ | commands/skills/skill-search/ |
| skill-store | commands/skill-store/ | commands/skills/skill-store/ |
| skill-learning | commands/skill-learning/ | commands/skills/skill-learning/ |

## plugins 分组
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| plugin | commands/plugin/ | commands/plugins/plugin/ |
| reload-plugins | commands/reload-plugins/ | commands/plugins/reload-plugins/ |
| install-github-app | commands/install-github-app/ | commands/plugins/install-github-app/ |
| install-slack-app | commands/install-slack-app/ | commands/plugins/install-slack-app/ |

## tasks 分组（任务与调度）
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| tasks | commands/tasks/ | commands/tasks/（root，不搬） |
| agents | commands/agents/ | commands/tasks/agents/ |
| agents-platform | commands/agents-platform/ | commands/tasks/agents-platform/ |
| job | commands/job/ | commands/tasks/job/ |
| schedule | commands/schedule/ | commands/tasks/schedule/ |

## ui 分组
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| color | commands/color/ | commands/ui/color/ |
| tui | commands/tui/ | commands/ui/tui/ |
| statusline | commands/statusline.tsx | commands/ui/statusline.tsx（loose） |
| stickers | commands/stickers/ | commands/ui/stickers/ |
| session-info | commands/session-info/ | commands/ui/session-info/ |
| chrome | commands/chrome/ | commands/ui/chrome/ |
| mobile | commands/mobile/ | commands/ui/mobile/ |
| desktop | commands/desktop/ | commands/ui/desktop/ |
| lang | commands/lang/ | commands/ui/lang/ |
| theme（已在 config） | — | — |

## debug 分组
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| doctor | commands/doctor/ | commands/debug/doctor/ |
| debug-tool-call | commands/debug-tool-call/ | commands/debug/debug-tool-call/ |
| perf-issue | commands/perf-issue/ | commands/debug/perf-issue/ |
| heapdump | commands/heapdump/ | commands/debug/heapdump/ |
| env | commands/env/ | commands/debug/env/ |
| mock-limits | commands/mock-limits/ | commands/debug/mock-limits/ |
| reset-limits | commands/reset-limits/ | commands/debug/reset-limits/ |
| break-cache | commands/break-cache/ | commands/debug/break-cache/ |
| ant-trace | commands/ant-trace/ | commands/debug/ant-trace/ |
| oauth-refresh | commands/oauth-refresh/ | commands/debug/oauth-refresh/ |
| ctx_viz | commands/ctx_viz/ | commands/debug/ctx_viz/ |
| passes | commands/passes/ | commands/debug/passes/ |
| extra-usage | commands/extra-usage/ | commands/debug/extra-usage/ |
| rate-limit-options | commands/rate-limit-options/ | commands/debug/rate-limit-options/ |

## review 分组
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| review | commands/review.ts | commands/review/review.ts（loose，root 占位） |
| security-review | commands/security-review.ts | commands/review/security-review.ts（loose） |
| autofix-pr | commands/autofix-pr/ | commands/review/autofix-pr/ |
| pr_comments | commands/pr_comments/ | commands/review/pr_comments/ |
| bughunter | commands/bughunter/ | commands/review/bughunter/ |

## version 分组
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| version | commands/version.ts | commands/version/version.ts（loose，root 占位） |
| upgrade | commands/upgrade/ | commands/version/upgrade/ |
| release-notes | commands/release-notes/ | commands/version/release-notes/ |

## files 分组
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| files | commands/files/ | commands/files/（root，不搬） |
| diff | commands/diff/ | commands/files/diff/ |
| add-dir | commands/add-dir/ | commands/files/add-dir/ |
| copy | commands/copy/ | commands/files/copy/ |

## bridge 分组
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| bridge | commands/bridge/ | commands/bridge/（root，不搬） |
| remoteControlServer | commands/remoteControlServer/ | commands/bridge/remoteControlServer/ |
| remote-env | commands/remote-env/ | commands/bridge/remote-env/ |
| remote-setup | commands/remote-setup/ | commands/bridge/remote-setup/ |

## daemon 分组
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| daemon | commands/daemon/ | commands/daemon/（root，不搬） |
| attach | commands/attach/ | commands/daemon/attach/ |
| detach | commands/detach/ | commands/daemon/detach/ |
| status | commands/status/ | commands/daemon/status/ |
| peers | commands/peers/ | commands/daemon/peers/ |
| send | commands/send/ | commands/daemon/send/ |
| pipes | commands/pipes/ | commands/daemon/pipes/ |
| pipe-status | commands/pipe-status/ | commands/daemon/pipe-status/ |
| history | commands/history/ | commands/daemon/history/ |
| claim-main | commands/claim-main/ | commands/daemon/claim-main/ |

## _misc 分组（兜底，未明确归类的）
| 命令名 | 当前路径 | 目标路径 |
|--------|---------|---------|
| btw | commands/btw/ | commands/_misc/btw/ |
| feedback | commands/feedback/ | commands/_misc/feedback/ |
| good-claude | commands/good-claude/ | commands/_misc/good-claude/ |
| issue | commands/issue/ | commands/_misc/issue/ |
| share | commands/share/ | commands/_misc/share/ |
| teleport | commands/teleport/ | commands/_misc/teleport/ |
| cost / stats / usage | commands/{cost,stats,usage}/ | commands/_misc/{cost,stats,usage}/ |
| summary | commands/summary/ | commands/_misc/summary/ |
| recap | commands/recap/ | commands/_misc/recap/ |
| branch | commands/branch/ | commands/_misc/branch/ |
| help | commands/help/ | commands/_misc/help/ |
| exit | commands/exit/ | commands/_misc/exit/ |
| onboarding | commands/onboarding/ | commands/_misc/onboarding/ |
| terminalSetup | commands/terminalSetup/ | commands/_misc/terminalSetup/ |
| artifacts | commands/artifacts/ | commands/_misc/artifacts/ |
| web-tools | commands/web-tools/ | commands/_misc/web-tools/ |
| voice | commands/voice/ | commands/_misc/voice/ |
| workflows | commands/workflows/ | commands/_misc/workflows/ |
| thinkback | commands/thinkback/ | commands/_misc/thinkback/ |
| thinkback-play | commands/thinkback-play/ | commands/_misc/thinkback-play/ |
| context | commands/context/ | commands/_misc/context/ |
| ide | commands/ide/ | commands/_misc/ide/ |
| plan | commands/plan/ | commands/_misc/plan/ |
| mode | commands/mode/ | commands/_misc/mode/ |
| init | commands/init.ts | commands/_misc/init.ts（loose） |
| buddy | commands/buddy/ | commands/_misc/buddy/ |
| poor | commands/poor/ | commands/_misc/poor/ |
| goal | commands/goal/ | commands/_misc/goal/ |
| advisor | commands/advisor.ts | commands/_misc/advisor.ts（loose） |
| autonomy | commands/autonomy.ts | commands/_misc/autonomy.ts（loose） |
| commit / commit-push-pr / bridge-kick / init-verifiers / proactive / brief / coordinator / monitor / force-snip / torch / ultraplan / subscribe-pr / assistant | loose files (.ts/.tsx) | commands/_misc/<name>.ts |

## 备注

- Loose files（.ts/.tsx 直接位于 commands/ 下）共 24 个，其中部分是 feature-gated。
- 由于 scanner 仅匹配 `commands/*/*/index.ts`（depth-2），loose files 与 root 命令（如 `commands/mcp/index.ts`）不会被 scanner 捕获，需保留在 commands.ts 中央数组（Plan B）。
