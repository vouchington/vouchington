import undici from 'undici'
import { callStructuredMcpTool } from '@voucha/test-helpers/mcp-tool-contract'
import { resetHttpDispatchersForTest } from '@modules/utils/http-dispatchers'
import { afterEach, describe, expect, it, vi } from 'vitest'

const caller = {
  __entity_type: 'user' as const,
  id: crypto.randomUUID(),
  roles: [],
  membership_plan: null,
}

// The Wikipedia tools have no REST twin, so their schemas are owned by the tools. Only the upstream
// HTTP call is replaced; the real tool, facade and output schema check run on each result.
describe('MCP output schema contract for the Wikipedia tools', () => {
  afterEach(async () => {
    vi.restoreAllMocks()
    await resetHttpDispatchersForTest()
  })

  it('returns a found get_wikipedia_summary with every field', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(
      undici.Response.json({
        pageid: 18923154,
        title: 'TypeScript',
        extract: 'A programming language.',
        description: 'programming language',
        thumbnail: { source: 'https://example.com/typescript.png' },
      }),
    )

    const result = await callStructuredMcpTool(
      caller,
      'get_wikipedia_summary',
      { title: 'TypeScript' },
      ['wikipedia:read'],
    )

    expect(result).toEqual({
      found: true,
      pageid: 18923154,
      title: 'TypeScript',
      url: 'https://en.wikipedia.org/wiki/TypeScript',
      extract: 'A programming language.',
      description: 'programming language',
      thumbnail_url: 'https://example.com/typescript.png',
    })
  })

  it('returns a found get_wikipedia_summary with null optional fields', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(
      undici.Response.json({ pageid: 7, title: 'Stub' }),
    )

    const result = await callStructuredMcpTool(caller, 'get_wikipedia_summary', { title: 'Stub' }, [
      'wikipedia:read',
    ])

    expect(result).toMatchObject({
      found: true,
      description: null,
      extract: null,
      thumbnail_url: null,
    })
  })

  it('returns the not-found result of get_wikipedia_summary', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(new undici.Response(null, { status: 404 }))

    const result = await callStructuredMcpTool(caller, 'get_wikipedia_summary', { title: 'Nope' }, [
      'wikipedia:read',
    ])

    expect(result).toEqual({ found: false, error: 'Wikipedia article not found' })
  })

  it('returns non-empty search_wikipedia results', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(
      undici.Response.json({
        pages: [
          { id: 18923154, title: 'TypeScript' },
          { id: 9845, title: 'Type system' },
        ],
      }),
    )

    const result = await callStructuredMcpTool(caller, 'search_wikipedia', { query: 'type' }, [
      'wikipedia:read',
    ])

    expect(result).toEqual({
      success: true,
      results: [
        { title: 'TypeScript', pageid: 18923154 },
        { title: 'Type system', pageid: 9845 },
      ],
      count: 2,
    })
  })

  it('returns an empty search_wikipedia result', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(undici.Response.json({ pages: [] }))

    const result = await callStructuredMcpTool(caller, 'search_wikipedia', { query: 'zzzz' }, [
      'wikipedia:read',
    ])

    expect(result).toEqual({ success: true, results: [], count: 0 })
  })

  it('returns the failure result of search_wikipedia when the upstream rejects the request', async () => {
    vi.spyOn(undici, 'fetch').mockResolvedValueOnce(new undici.Response(null, { status: 400 }))

    const result = await callStructuredMcpTool(caller, 'search_wikipedia', { query: 'bad' }, [
      'wikipedia:read',
    ])

    expect(result).toMatchObject({ success: false, error: expect.any(String) })
  })
})
