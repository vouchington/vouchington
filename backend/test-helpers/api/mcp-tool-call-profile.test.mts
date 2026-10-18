import { EventEmitter } from 'node:events'
import type http from 'node:http'
import { describe, expect, it } from 'vitest'
import { recordRequestQueryTiming } from '@data-stores/psql/request-query-profile'
import { withBatchRequestMarker, withToolCallProfile } from './mcp-tool-call-profile.mts'
import { profileRequestQueries } from './request-query-profile.mts'
import { takeRequestQueryProfileViolations } from './request-query-profile-violations.mts'

const query = (annotation: string) => recordRequestQueryTiming({ annotation, durationMs: 0 })
const probe = 'mcpToolCallProfileProbe'

async function serve(handle: () => Promise<unknown>): Promise<string[]> {
  takeRequestQueryProfileViolations()
  const res = new EventEmitter()
  let done: Promise<unknown> = Promise.resolve()
  profileRequestQueries(
    { method: 'POST', url: '/api/v1/mcp' } as http.IncomingMessage,
    res as unknown as http.ServerResponse,
    () => {
      done = handle()
    },
  )
  await done
  res.emit('finish')
  return takeRequestQueryProfileViolations()
}

const callTool = withToolCallProfile(async toolName => {
  query(probe)
  if (toolName === 'repeats') query(probe)
  await Promise.resolve()
  return { content: [] }
})
const handleRequest = withBatchRequestMarker(() => Promise.resolve(undefined))
const toolCall = (id: number) => ({ jsonrpc: '2.0', id, method: 'tools/call' })

describe('MCP tool call query profiles', () => {
  it('profiles each tool call of a batch request as its own request', async () => {
    const violations = await serve(async () => {
      await handleRequest({ parsedBody: [toolCall(1), toolCall(2)] })
      await Promise.all([callTool('first'), callTool('second')])
    })
    expect(violations).toEqual([])
  })

  it('still fails a repeat inside one tool call of a batch', async () => {
    const violations = await serve(async () => {
      await handleRequest({ parsedBody: [toolCall(1), toolCall(2)] })
      await Promise.all([callTool('first'), callTool('repeats')])
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).toContain('tools/call repeats')
    expect(violations[0]).toContain(probe)
  })

  it('keeps a single tool call in the request profile', async () => {
    const violations = await serve(async () => {
      await handleRequest({ parsedBody: toolCall(1) })
      query(probe)
      await callTool('first')
    })
    expect(violations).toHaveLength(1)
    expect(violations[0]).not.toContain('tools/call')
  })
})
