/**
 * Anspire AI Search adapter — calls the Anspire Search API
 * (https://plugin.anspire.cn/api/ntsearch/search) via GET with
 * Bearer token auth. Maps results to the unified SearchResult format.
 *
 * Used as a fallback when Tavily is rate-limited.
 * API key: ANSPIRE_API_KEY env var.
 */

import { AbortError } from 'src/utils/errors.js'
import type { SearchResult, SearchOptions, WebSearchAdapter } from './types.js'

const ANSPIRE_SEARCH_URL = 'https://plugin.anspire.cn/api/ntsearch/search'
const FETCH_TIMEOUT_MS = 30_000

interface AnspireSearchHit {
  title: string
  content: string
  url: string
  score: number
  date: string
}

interface AnspireSearchResponse {
  query: string
  Uuid: string
  results: AnspireSearchHit[]
}

export class AnspireSearchAdapter implements WebSearchAdapter {
  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const { signal, onProgress } = options

    if (signal?.aborted) {
      throw new AbortError()
    }

    onProgress?.({ type: 'query_update', query })

    const apiKey = process.env.ANSPIRE_API_KEY
    if (!apiKey) {
      throw new Error(
        'ANSPIRE_API_KEY is not set. Get one at https://open.anspire.cn/',
      )
    }

    const topK = Math.min(options.numResults ?? 10, 50)
    const params = new URLSearchParams({
      query,
      top_k: String(topK),
    })

    if (options.allowedDomains?.length) {
      params.set('Insite', options.allowedDomains.join(','))
    }

    const abortController = new AbortController()
    if (signal) {
      signal.addEventListener('abort', () => abortController.abort(), {
        once: true,
      })
    }

    const url = `${ANSPIRE_SEARCH_URL}?${params.toString()}`

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        signal: abortController.signal,
      })

      if (abortController.signal.aborted) {
        throw new AbortError()
      }

      if (!response.ok) {
        const body = await response.text().catch(() => '')
        throw new Error(
          `Anspire API returned ${response.status}: ${body.slice(0, 200)}`,
        )
      }

      const data = (await response.json()) as AnspireSearchResponse
      const results: SearchResult[] = (data.results ?? []).map(
        (hit: AnspireSearchHit) => ({
          title: hit.title,
          url: hit.url,
          snippet: hit.content,
        }),
      )

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
