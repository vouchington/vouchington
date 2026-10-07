import { describe, expect, it } from 'vitest'
import { ALL_TOOLS } from '../registry/index.mts'

const readNames = [
  'list_copyright_email_intakes',
  'get_copyright_email_intake',
  'list_copyright_guest_capabilities',
  'get_copyright_case',
]
const newUntrustedFields = new Set(['summary', 'gap', 'rationale', 'structured_output'])

function propertyNames(value: unknown): Set<string> {
  const names = new Set<string>()
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    const record = node as Record<string, unknown>
    const properties = record['properties']
    if (properties && typeof properties === 'object' && !Array.isArray(properties))
      for (const key of Object.keys(properties)) names.add(key)
    Object.values(record).forEach(visit)
  }
  visit(value)
  return names
}

describe('copyright MCP read catalog', () => {
  it('registers four read-only exact-scope tools with output schemas', () => {
    for (const name of readNames) {
      const tool = ALL_TOOLS.find(item => item.schema.name === name)
      expect(tool?.meta?.requiredScopes?.admin_mcp).toContain('copyright-notices:read')
      expect(tool?.meta?.annotations?.readOnlyHint).toBe(true)
      expect(tool?.meta?.outputSchema).toMatchObject({ type: 'object' })
    }
  })

  it('keeps new untrusted output fields confined to copyright tool schemas', () => {
    const affected = ALL_TOOLS.filter(
      tool =>
        tool.meta?.surfaces?.includes('admin_mcp') &&
        [...propertyNames(tool.meta.outputSchema)].some(key => newUntrustedFields.has(key)),
    ).map(tool => tool.schema.name)
    expect(affected.toSorted()).toEqual(
      [
        'list_copyright_review_queue',
        'get_copyright_email_intake',
        'get_copyright_case',
      ].toSorted(),
    )
  })
})
