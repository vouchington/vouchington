export function joinSearchParamValues(value: string | string[] | undefined): string | undefined {
  const values = (Array.isArray(value) ? value : [value]).flatMap(entry => {
    if (!entry) return []
    return entry.split(',').flatMap(part => (part.trim() ? [part.trim()] : []))
  })
  const joined = [...new Set(values)].slice(0, 10).join(',')
  return joined || undefined
}
