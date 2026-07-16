/**
 * Search adapter factory — selects the appropriate backend.
 *
 * Priority (highest first):
 *   1. WEB_SEARCH_ADAPTER environment variable (explicit override)
 *   2. settings.webSearchAdapter (user-configurable via /web-tools)
 *   3. Default: tavily
 *
 * Fallback chain (since 2026-07-16):
 *   When the primary adapter fails (rate limit, auth error, timeout),
 *   automatically try the next adapter in WEB_SEARCH_FALLBACK_ADAPTERS
 *   (comma-separated, e.g. "bing,brave,exa").
 *
 *   Tier 2 fallback: if no explicit fallback is configured, tries any
 *   adapter with valid-looking credentials (non-empty API key env var).
 */

import { getSettings_DEPRECATED } from 'src/utils/settings/settings.js'
import { ApiSearchAdapter } from './apiAdapter.js'
import { AnspireSearchAdapter } from './anspireAdapter.js'
import { BingSearchAdapter } from './bingAdapter.js'
import { BochaSearchAdapter } from './bochaAdapter.js'
import { BraveSearchAdapter } from './braveAdapter.js'
import { ExaSearchAdapter } from './exaAdapter.js'
import { TavilySearchAdapter } from './tavilyAdapter.js'
import type { WebSearchAdapter, SearchOptions, SearchResult } from './types.js'

export type {
  SearchResult,
  SearchOptions,
  SearchProgress,
  WebSearchAdapter,
} from './types.js'

export type SearchAdapterKey =
  | 'anspire'
  | 'api'
  | 'bing'
  | 'bocha'
  | 'brave'
  | 'exa'
  | 'tavily'

const ADAPTER_KEY_SET: ReadonlySet<string> = new Set([
  'anspire',
  'api',
  'bing',
  'bocha',
  'brave',
  'exa',
  'tavily',
])

function isValidAdapterKey(key: string): key is SearchAdapterKey {
  return ADAPTER_KEY_SET.has(key)
}

function buildAdapter(key: SearchAdapterKey): WebSearchAdapter {
  switch (key) {
    case 'anspire':
      return new AnspireSearchAdapter()
    case 'api':
      return new ApiSearchAdapter()
    case 'bing':
      return new BingSearchAdapter()
    case 'bocha':
      return new BochaSearchAdapter()
    case 'brave':
      return new BraveSearchAdapter()
    case 'exa':
      return new ExaSearchAdapter()
    case 'tavily':
    default:
      return new TavilySearchAdapter()
  }
}

// Per-adapter credential check — used for auto-fallback discovery
function hasCredentials(key: SearchAdapterKey): boolean {
  switch (key) {
    case 'anspire':
      return !!process.env.ANSPIRE_API_KEY
    case 'tavily':
      return !!process.env.TAVILY_API_KEY
    case 'bing':
      return !!(
        process.env.BING_API_KEY || process.env.AZURE_BING_SEARCH_API_KEY
      )
    case 'bocha':
      return !!process.env.BOCHA_WEB_SEARCH_API_KEY
    case 'brave':
      return !!(process.env.BRAVE_API_KEY || process.env.BRAVE_SEARCH_API_KEY)
    case 'exa':
      return !!process.env.EXA_API_KEY
    case 'api':
      // API adapter delegates to Anthropic server-side search;
      // only usable with Anthropic provider
      return (
        process.env.CLAUDE_CODE_USE_OPENAI !== '1' &&
        process.env.CLAUDE_CODE_USE_GEMINI !== '1' &&
        process.env.CLAUDE_CODE_USE_GROK !== '1'
      )
    default:
      return false
  }
}

let cachedAdapter: WebSearchAdapter | null = null
let cachedAdapterKey: SearchAdapterKey | null = null

export function createAdapter(): WebSearchAdapter {
  const adapterKey = resolvePrimaryAdapter()
  if (cachedAdapter && cachedAdapterKey === adapterKey) return cachedAdapter
  cachedAdapter = buildAdapter(adapterKey)
  cachedAdapterKey = adapterKey
  return cachedAdapter
}

function resolvePrimaryAdapter(): SearchAdapterKey {
  const envAdapter = process.env.WEB_SEARCH_ADAPTER
  if (envAdapter && isValidAdapterKey(envAdapter)) return envAdapter

  const settingsAdapter = getSettings_DEPRECATED().webSearchAdapter
  if (settingsAdapter && isValidAdapterKey(settingsAdapter as string))
    return settingsAdapter as SearchAdapterKey

  return 'tavily'
}

function resolveFallbackKeys(): SearchAdapterKey[] {
  // 1. Explicit fallback chain from env var
  const fallbackEnv = process.env.WEB_SEARCH_FALLBACK_ADAPTERS
  if (fallbackEnv) {
    return fallbackEnv
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(isValidAdapterKey)
  }

  // 2. Auto-discover: any adapter with credentials (excluding the primary)
  const primary = resolvePrimaryAdapter()
  const allKeys: SearchAdapterKey[] = [
    'anspire',
    'api',
    'bing',
    'bocha',
    'brave',
    'exa',
    'tavily',
  ]
  return allKeys.filter(k => k !== primary && hasCredentials(k))
}

/**
 * Composite adapter that tries the primary adapter first,
 * then falls back to alternates on failure.
 */
export class FallbackSearchAdapter implements WebSearchAdapter {
  constructor(private primary: SearchAdapterKey) {}

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const fallbacks = resolveFallbackKeys()
    const chain = [this.primary, ...fallbacks]
    const tried: string[] = []
    let lastError: Error | null = null

    for (const key of chain) {
      try {
        const adapter = buildAdapter(key)
        const results = await adapter.search(query, options)
        if (key !== this.primary) {
          options.onProgress?.({
            type: 'query_update',
            query: `[${key}] ${query}`,
          } as never)
        }
        return results
      } catch (e) {
        tried.push(key)
        lastError = e instanceof Error ? e : new Error(String(e))
        // Only continue to next fallback; don't rethrow yet
      }
    }

    throw new Error(
      `All search adapters failed (tried: ${tried.join(' → ')}). ` +
        `Last error: ${lastError?.message || 'unknown'}`,
    )
  }
}

/**
 * Resolve the primary adapter key (public for diagnostics).
 */
export { resolvePrimaryAdapter }

/**
 * Resolve the full fallback chain, with credentials auto-discovery
 * for adapters not explicitly listed in WEB_SEARCH_FALLBACK_ADAPTERS.
 */
export function resolveFallbackChain(): SearchAdapterKey[] {
  const primary = resolvePrimaryAdapter()
  return [primary, ...resolveFallbackKeys()]
}
