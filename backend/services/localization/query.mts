export function queryValues(value: unknown): string[] {
  if (value === undefined || value === null) return []
  const parts = Array.isArray(value) ? value : [value]
  return parts.flatMap(part =>
    String(part)
      .split(',')
      .map(item => item.trim())
      .filter(item => item.length > 0),
  )
}

export function headerValue(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined
  return Array.isArray(value) ? value.join(',') : value
}
