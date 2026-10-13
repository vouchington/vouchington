/** Assert that a standalone MCP schema resolves every reference within its own `$defs`. */
export function assertMcpLocalSchemaRefs(schema: unknown): void {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    throw new Error('Expected an object schema')
  const defs = (schema as Record<string, unknown>)['$defs']
  const definitions =
    defs && typeof defs === 'object' && !Array.isArray(defs)
      ? (defs as Record<string, unknown>)
      : {}
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return
    const node = value as Record<string, unknown>
    if ('$ref' in node) {
      const ref = node['$ref']
      if (typeof ref !== 'string' || !/^#\/\$defs\/[^/]+$/.test(ref))
        throw new Error(`Non-local MCP schema reference: ${String(ref)}`)
      if (!(ref.slice('#/$defs/'.length) in definitions))
        throw new Error(`Dangling MCP schema reference: ${ref}`)
    }
    for (const keyword of ['properties', 'patternProperties', '$defs', 'definitions']) {
      const children = node[keyword]
      if (children && typeof children === 'object' && !Array.isArray(children))
        for (const child of Object.values(children)) visit(child)
    }
    for (const keyword of [
      'items',
      'additionalProperties',
      'not',
      'if',
      'then',
      'else',
      'contains',
      'propertyNames',
    ])
      visit(node[keyword])
    for (const keyword of ['oneOf', 'anyOf', 'allOf', 'prefixItems']) {
      const children = node[keyword]
      if (Array.isArray(children)) for (const child of children) visit(child)
    }
  }
  visit(schema)
}
