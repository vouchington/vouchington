import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CANONICAL_SSE_ROUTES = [
  'v1/admin/article-syncs.mts',
  'v1/admin/index-routes/postgresql-stream-get.mts',
  'v1/admin/index-routes/valkey-stream-get.mts',
  'v1/agent-responses/index-routes/agent-responses-by-id-stream-get.mts',
  'v1/agent-responses/index-routes/agent-responses-post.mts',
  'v1/conversations/index-routes/conversations-by-conversationid-chat-post.mts',
  'v1/images/index-routes/images-by-imageid-state-stream-get.mts',
  'v1/mq/index-routes/mq-stream-get.mts',
  'v1/my/imports/stream.mts',
  'v1/users/data-request.mts',
] as const

const MCP_ACCEPT_EXCEPTIONS = new Set(['v1/admin/mcp.mts', 'v1/mcp/index.mts'])
const START_SSE_CALL_PATTERN = /\bstartSSE\s*\(\s*ctx\s*(?:,|\))/

function productionModules(): string[] {
  const root = 'backend/api'
  const pendingDirectories = ['']
  const modules: string[] = []

  while (pendingDirectories.length > 0) {
    const relativeDirectory = pendingDirectories.pop()!
    for (const entry of readdirSync(join(root, relativeDirectory), { withFileTypes: true })) {
      const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        pendingDirectories.push(relativePath)
      } else if (
        entry.isFile() &&
        relativePath.endsWith('.mts') &&
        !relativePath.includes('__tests__') &&
        !relativePath.endsWith('.test.mts')
      ) {
        modules.push(relativePath)
      }
    }
  }

  return modules.sort()
}

function productionStartSSERoutes(): string[] {
  return productionModules()
    .filter(path => path !== 'sse-helpers.mts')
    .filter(path => START_SSE_CALL_PATTERN.test(readFileSync(join('backend/api', path), 'utf8')))
}

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

  it('makes startSSE the response-header owner regardless of header API spelling', () => {
    const offenders = productionModules()
      .filter(path => path !== 'sse-helpers.mts' && !MCP_ACCEPT_EXCEPTIONS.has(path))
      .filter(path => readFileSync(join('backend/api', path), 'utf8').includes('text/event-stream'))

    expect(offenders).toEqual([])
  })

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

  it('keeps the canonical SSE route inventory complete', () => {
    expect(productionStartSSERoutes()).toEqual([...CANONICAL_SSE_ROUTES].sort())
  })
})
