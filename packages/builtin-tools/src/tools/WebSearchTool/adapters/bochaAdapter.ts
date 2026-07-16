/**
 * Bocha AI Search adapter — calls the Bocha AI Search API
 * (https://api.bocha.cn/v1/ai-search) via POST with Bearer token auth.
 * Maps results to the unified SearchResult format.
 *
 * Note: despite the env var name BOCHA_WEB_SEARCH_API_KEY, the actual
 * endpoint is the AI Search API (not the Web Search API at api.bochaai.com).
 */

import { AbortError } from 'src/utils/errors.js'
import type { SearchResult, SearchOptions, WebSearchAdapter } from './types.js'

const BOCHA_SEARCH_URL = 'https://api.bocha.cn/v1/ai-search'

interface BochaWebResult {
  name: string
  url: string
  displayUrl: string
  snippet: string
  summary?: string
  siteName?: string
  siteIcon?: string
  datePublished?: string
  dateLastCrawled?: string
}

interface BochaWebpageContent {
  webSearchUrl: string
  value: BochaWebResult[]
  someResultsRemoved?: boolean
}

interface BochaMessage {
  role: string
  type: string
  content_type: string
  content: string
}

interface BochaSearchResponse {
  code: number
  log_id: string
  conversation_id: string
  messages: BochaMessage[]
}

export class BochaSearchAdapter implements WebSearchAdapter {
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const { signal, onProgress } = options

    if (signal?.aborted) {
      throw new AbortError()
    }

    onProgress?.({ type: 'query_update', query })

    const apiKey = process.env.BOCHA_WEB_SEARCH_API_KEY
    if (!apiKey) {
      throw new Error(
        'BOCHA_WEB_SEARCH_API_KEY is not set. Get one at https://open.bochaai.com/',
      )
    }

    const abortController = new AbortController()
    if (signal) {
      signal.addEventListener('abort', () => abortController.abort(), {
        once: true,
      })
    }

    const body: Record<string, unknown> = {
      query,
      count: options.numResults ?? 10,
    }

    try {
      const response = await fetch(BOCHA_SEARCH_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      })

      if (abortController.signal.aborted) {
        throw new AbortError()
      }

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        throw new Error(
          `Bocha API returned ${response.status}: ${text.slice(0, 200)}`,
        )
      }

      const data = (await response.json()) as BochaSearchResponse

      if (data.code !== 200) {
        throw new Error(
          `Bocha API error code ${data.code}: ${JSON.stringify(data).slice(0, 200)}`,
        )
      }

      // Extract webpage results from the AI Search response
      const results: SearchResult[] = []
      for (const msg of data.messages ?? []) {
        if (msg.type === 'source' && msg.content_type === 'webpage') {
          try {
            const parsed: BochaWebpageContent = JSON.parse(msg.content)
            for (const hit of parsed.value ?? []) {
              results.push({
                title: hit.name,
                url: hit.url,
                snippet: hit.summary || hit.snippet,
              })
            }
          } catch {
            // Skip unparseable content blocks
          }
        }
      }

      onProgress?.({
        type: 'search_results_received',
        resultCount: results.length,
        query,
      })

      return results
    } catch (e) {
      if (
        e instanceof DOMException &&
        (e.name === 'AbortError' || abortController.signal.aborted)
      ) {
        throw new AbortError()
      }
      throw e
    }
  }
}
