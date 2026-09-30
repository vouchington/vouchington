import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { MCP_PREFLIGHT, MCP_PREFLIGHT_FAILURE, withMcpPreflight } from './harness-mcp-preflight.mts'

describe('withMcpPreflight', () => {
  it('puts the gate first and leaves the task prompt byte-for-byte after it', () => {
    const task = '## Task\n\nFix the failing check.\n'
    const prompt = withMcpPreflight(task)

    expect(prompt.startsWith(MCP_PREFLIGHT)).toBe(true)
    expect(prompt.endsWith(task)).toBe(true)
  })

  it('names one cheap tool call and the exact failure line', () => {
    expect(MCP_PREFLIGHT).toContain('`outbox_status` tool of the `vouchington-tooling` MCP server')
    expect(MCP_PREFLIGHT.split('\n').at(-1)).toBe(MCP_PREFLIGHT_FAILURE)
    expect(MCP_PREFLIGHT_FAILURE).toBe(
      'PREFLIGHT FAILED: vouchington-tooling MCP server is not connected',
    )
  })

  it('fails on the same signals the SessionStart hook prints', () => {
    for (const signal of ['STOP WORK', 'NOT RESOLVED', 'Blackboard sessionId:']) {
      expect(MCP_PREFLIGHT).toContain(signal)
    }
  })

  it('is injected once at dispatch, never copied into a rendered template', () => {
    const templates = readdirSync('docs/prompts/automation').filter(
      file => file.endsWith('.md') && file !== 'README.md',
    )
    expect(templates.length).toBeGreaterThan(0)
    const copiers = templates.filter(file => {
      const text = readFileSync(join('docs/prompts/automation', file), 'utf8')
      return text.includes('Preflight: vouchington-tooling') || text.includes(MCP_PREFLIGHT_FAILURE)
    })
    expect(copiers).toEqual([])
  })
})
