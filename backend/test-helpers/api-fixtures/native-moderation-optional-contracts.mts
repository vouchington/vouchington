export function requiredFlagsForProperty(value: unknown, propertyName: string): boolean[] {
  if (value === null || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const flags: boolean[] = []
  const properties = record.properties
  if (properties !== null && typeof properties === 'object') {
    const property = (properties as Record<string, unknown>)[propertyName]
    if (property !== null && typeof property === 'object') {
      const required = (property as Record<string, unknown>).required
      if (typeof required === 'boolean') flags.push(required)
    }
  }
  for (const child of Object.values(record)) {
    flags.push(...requiredFlagsForProperty(child, propertyName))
  }
  return flags
}
