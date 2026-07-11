/**
 * src/query.ts — C9 Plan B re-export shim.
 *
 * Production query() and queryLoop() now live in src/query/loop/production.ts.
 * This file preserves the public import path (`import { query, type QueryParams
 * } from '../query.js'`) used by 5+ external consumers:
 *   - src/screens/REPL.tsx
 *   - src/tasks/LocalMainSessionTask.ts  (also imports QueryParams)
 *   - src/QueryEngine.ts
 *   - src/utils/forkedAgent.ts
 *   - src/utils/hooks/execAgentHook.ts
 *   - src/__tests__/queryAutonomyProviderBoundary.test.ts
 *
 * The skeleton queryLoop in src/query/loop/index.ts (separate QueryLoopParams
 * signature) is preserved for H1 delegation-mode verification — see
 * tests/integration/query-split.test.ts.
 */

export { query } from './query/loop/production.js'
export type { QueryParams } from './query/params.js'
