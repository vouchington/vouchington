import { describe, expect, it } from 'vitest'
import type { McpCallAuditEvent } from '@services/mcp-tools'
import { createMcpMessageMeter } from './mcp-usage-helpers.mts'

const call = (outcome: McpCallAuditEvent['outcome']): McpCallAuditEvent => ({
  jsonrpcMethod: 'tools/call',
  toolName: 'withdraw_entity_relation_vote',
  outcome,
})

describe('MCP message usage meter', () => {
  it('settles only when every message index was refused, including a late refusal', () => {
    const meter = createMcpMessageMeter()
    meter.recordPlannedEvents([call('rate_limited'), call('accepted')])
    expect(meter.resolveUnits(200)).toBeUndefined()
    meter.markRateLimited(1)
    expect(meter.resolveUnits(200)).toBe(0)
    expect(meter.resolveUnits(429)).toBeUndefined()
  })

  it('keeps mixed messages charged even when a request id is reused', () => {
    const meter = createMcpMessageMeter()
    // The two calls may have the same JSON-RPC id; the meter tracks their positions.
    meter.recordPlannedEvents([call('accepted'), call('rate_limited')])
    expect(meter.resolveUnits(200)).toBeUndefined()
    meter.markRateLimited(1)
    expect(meter.resolveUnits(200)).toBeUndefined()
  })

  it('keeps a tools/list or notification message charged', () => {
    const meter = createMcpMessageMeter()
    meter.recordPlannedEvents([
      call('rate_limited'),
      { jsonrpcMethod: 'tools/list', toolName: null, outcome: 'accepted' },
      { jsonrpcMethod: 'notifications/initialized', toolName: null, outcome: 'accepted' },
    ])
    expect(meter.resolveUnits(200)).toBeUndefined()
  })

  it('does not treat an unplanned request as wholly refused', () => {
    expect(createMcpMessageMeter().resolveUnits(200)).toBeUndefined()
  })
})
