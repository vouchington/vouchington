import { createUniqueTestEmail } from './data.mts'
import type { Tool } from '../services/openai-agents/tool-types.mts'
import { validateToolArguments } from '../services/mcp-tools/validate-tool-arguments.mts'

const UUID = '00000000-0000-4000-8000-000000000001'

function sample(schema: Record<string, unknown>, root = schema, depth = 0): unknown {
  if (depth > 12) throw new Error('schema sampler recursion exceeded')
  if (typeof schema['$ref'] === 'string') {
    const ref = schema['$ref']
    if (!ref.startsWith('#/$defs/')) throw new Error(`Unsupported schema ref ${ref}`)
    const defs = root['$defs'] as Record<string, Record<string, unknown>>
    return sample(defs[ref.slice('#/$defs/'.length)]!, root, depth + 1)
  }
  if (schema['const'] !== undefined) return schema['const']
  if (Array.isArray(schema['enum'])) return schema['enum'][0]
  for (const key of ['oneOf', 'anyOf'] as const) {
    const branches = schema[key] as Record<string, unknown>[] | undefined
    if (branches) {
      const branch = branches.find(item => item['type'] !== 'null') ?? branches[0]!
      return sample(branch, root, depth + 1)
    }
  }
  if (Array.isArray(schema['allOf'])) {
    const entries = (schema['allOf'] as Record<string, unknown>[]).map(item =>
      sample(item, root, depth + 1),
    )
    return Object.assign({}, ...entries)
  }
  if (schema['type'] === 'string') {
    if (schema['format'] === 'uuid') return UUID
    if (schema['format'] === 'date-time') return '2026-01-01T00:00:00.000Z'
    if (schema['format'] === 'date') return '2026-01-01'
    if (schema['format'] === 'email') return createUniqueTestEmail('mcp-operation')
    if (schema['format'] === 'uri' || schema['format'] === 'url') return 'https://example.com/test'
    const min = typeof schema['minLength'] === 'number' ? schema['minLength'] : 1
    const max = typeof schema['maxLength'] === 'number' ? schema['maxLength'] : Math.max(min, 16)
    return 'synthetic'.slice(0, max).padEnd(Math.min(min, max), 'x')
  }
  if (schema['type'] === 'integer' || schema['type'] === 'number')
    return typeof schema['minimum'] === 'number' ? schema['minimum'] : 1
  if (schema['type'] === 'boolean') return true
  if (schema['type'] === 'array') {
    const count = typeof schema['minItems'] === 'number' ? schema['minItems'] : 0
    return Array.from({ length: count }, () =>
      sample(schema['items'] as Record<string, unknown>, root, depth + 1),
    )
  }
  const properties = (schema['properties'] ?? {}) as Record<string, Record<string, unknown>>
  const required = [...((schema['required'] ?? []) as string[])]
  const minimum = typeof schema['minProperties'] === 'number' ? schema['minProperties'] : 0
  for (const key of Object.keys(properties)) {
    if (required.length >= minimum) break
    if (!required.includes(key)) required.push(key)
  }
  return Object.fromEntries(required.map(key => [key, sample(properties[key]!, root, depth + 1)]))
}

export function sampleMcpToolArguments(tool: {
  schema: Pick<Tool['schema'], 'name' | 'parameters'>
}): Record<string, unknown> {
  const parameters = tool.schema.parameters as Record<string, unknown>
  const input =
    tool.schema.name === 'get_domain_ratings'
      ? { hostname: 'example.com' }
      : (sample(parameters) as Record<string, unknown>)
  const violation = validateToolArguments(parameters, input)
  if (violation) throw new Error(`${tool.schema.name}: generated sample invalid: ${violation}`)
  return input
}
