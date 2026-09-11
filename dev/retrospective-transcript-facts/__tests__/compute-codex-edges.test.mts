import { describe, expect, it } from 'vitest'

import { extractCodexChildEdges, readCodexRootIdentity } from '../compute.mts'

function line(record: unknown): string {
  return JSON.stringify(record)
}

function subAgentActivity(agentThreadId: string, agentPath?: string): string {
  return line({
    type: 'event_msg',
    payload: {
      type: 'sub_agent_activity',
      agent_thread_id: agentThreadId,
      ...(agentPath === undefined ? {} : { agent_path: agentPath }),
    },
  })
}

describe('extractCodexChildEdges', () => {
  it('follows an edge exactly one agent_path segment deeper than the owner', () => {
    const result = extractCodexChildEdges([subAgentActivity('child-id', '/root/child')], '/root')
    expect(result).toEqual({ edges: [{ threadId: 'child-id', agentPath: '/root/child' }] })
  })

  it('does not follow an edge naming the owner itself', () => {
    const result = extractCodexChildEdges([subAgentActivity('root-id', '/root')], '/root')
    expect(result).toEqual({ edges: [] })
  })

  it('does not follow an edge naming the owner itself with a trailing slash', () => {
    const result = extractCodexChildEdges([subAgentActivity('root-id', '/root/')], '/root')
    expect(result).toEqual({ edges: [] })
  })

  it('does not follow an edge naming the owner’s own parent', () => {
    const result = extractCodexChildEdges([subAgentActivity('parent-id', '/root')], '/root/child')
    expect(result).toEqual({ edges: [] })
  })

  it('does not follow an edge naming a sibling', () => {
    const result = extractCodexChildEdges(
      [subAgentActivity('sibling-id', '/root/child-b')],
      '/root/child-a',
    )
    expect(result).toEqual({ edges: [] })
  })

  it('follows a grandchild edge one segment below a non-root owner', () => {
    const result = extractCodexChildEdges(
      [subAgentActivity('grandchild-id', '/root/child/grandchild')],
      '/root/child',
    )
    expect(result).toEqual({
      edges: [{ threadId: 'grandchild-id', agentPath: '/root/child/grandchild' }],
    })
  })

  it('dedupes repeated activity for the same child thread', () => {
    const result = extractCodexChildEdges(
      [subAgentActivity('child-id', '/root/child'), subAgentActivity('child-id', '/root/child')],
      '/root',
    )
    expect(result).toEqual({ edges: [{ threadId: 'child-id', agentPath: '/root/child' }] })
  })

  it('ignores event_msg records of other kinds', () => {
    const result = extractCodexChildEdges(
      [line({ type: 'event_msg', payload: { type: 'user_message' } })],
      '/root',
    )
    expect(result).toEqual({ edges: [] })
  })

  it('fails closed when a sub_agent_activity record has no agent_path', () => {
    const result = extractCodexChildEdges([subAgentActivity('child-id')], '/root')
    expect(result).toEqual({
      error: 'Codex sub_agent_activity for thread child-id has no agent_path',
    })
  })
})

describe('readCodexRootIdentity', () => {
  it('reads a declared thread id and agent_path from session metadata', () => {
    expect(
      readCodexRootIdentity([
        line({ type: 'session_meta', payload: { id: 'root-id', agent_path: '/root/child' } }),
      ]),
    ).toEqual({ threadId: 'root-id', agentPath: '/root/child' })
  })

  it('defaults agent_path to /root and leaves the thread id undefined without metadata', () => {
    expect(readCodexRootIdentity([line({ type: 'event_msg', payload: {} })])).toEqual({
      threadId: undefined,
      agentPath: '/root',
    })
  })

  it('defaults agent_path to /root for a top-level session that omits the field', () => {
    expect(
      readCodexRootIdentity([line({ type: 'session_meta', payload: { id: 'root-id' } })]),
    ).toEqual({
      threadId: 'root-id',
      agentPath: '/root',
    })
  })
})
