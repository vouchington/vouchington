export function scopedSchema(schema: Record<string, unknown>, index: number) {
  const prefix = `Option${index}_`
  const definitions = schema['$defs'] as Record<string, unknown> | undefined
  function rewrite(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(rewrite)
    if (value === null || typeof value !== 'object') return value
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        key === '$ref' && typeof item === 'string' && item.startsWith('#/$defs/')
          ? `#/$defs/${prefix}${item.slice('#/$defs/'.length)}`
          : rewrite(item),
      ]),
    )
  }
  const { $defs: _definitions, ...body } = schema
  return {
    body: rewrite(body) as Record<string, unknown>,
    definitions: Object.fromEntries(
      Object.entries(definitions ?? {}).map(([key, value]) => [`${prefix}${key}`, rewrite(value)]),
    ),
  }
}
