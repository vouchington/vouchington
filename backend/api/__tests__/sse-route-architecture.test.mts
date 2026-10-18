import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CANONICAL_SSE_ROUTES = [
  'v1/admin/article-syncs.mts',
  'v1/admin/index-routes/snapshot-stream.mts',
  'v1/images/index-routes/images-by-imageid-state-stream-get.mts',
  'v1/mq/index-routes/mq-stream-get.mts',
  'v1/my/imports/stream.mts',
  'v1/users/data-request.mts',
] as const

const MCP_ACCEPT_EXCEPTIONS = new Set(['mcp-helpers.mts'])
const START_SSE_CALL_PATTERN = /\bstartSSE\s*\(\s*ctx\s*(?:,|\))/

describe('SSE route architecture', () => {
  it.each([
    ['spaces', 'startSSE( ctx )'],
    ['line breaks', 'startSSE(\n  ctx,\n  { cycleDurationMs: 60_000 },\n)'],
  ])('recognizes startSSE calls with %s', (_format, source) => {
    expect(START_SSE_CALL_PATTERN.test(source)).toBe(true)
  })

  it.each(['restartSSE(ctx)', 'startSSE(context)', 'startSSE(ctxValue)', 'startSSE(ctx.signal)'])(
    'does not conflate the near-miss %s',
    source => {
      expect(START_SSE_CALL_PATTERN.test(source)).toBe(false)
    },
  )

  it('keeps the MCP transport Accept exceptions request-only', () => {
    for (const path of MCP_ACCEPT_EXCEPTIONS) {
      const source = readFileSync(join('backend/api', path), 'utf8')
      expect(source.match(/text\/event-stream/g)).toHaveLength(1)
      expect(source).toContain("Accept: 'application/json, text/event-stream'")
    }
  })

  it('routes every canonical SSE response through startSSE', () => {
    for (const path of CANONICAL_SSE_ROUTES) {
      const source = readFileSync(join('backend/api', path), 'utf8')
      expect({ path, usesStartSSE: START_SSE_CALL_PATTERN.test(source) }).toEqual({
        path,
        usesStartSSE: true,
      })
    }
  })
})
