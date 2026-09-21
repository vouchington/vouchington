/** Normalize guid from feedsmith (handles both object { value } and string formats) */
export function itemGuid(item: Record<string, unknown>): string | null {
  const guidValue = valueOrString(item.guid)
  if (guidValue != null) return guidValue
  const idValue = valueOrString(item.id)
  return idValue
}

/** Normalize link from feedsmith (string or Atom link object with href) */
export function itemLink(item: Record<string, unknown>): string | null {
  const link = item.link
  if (typeof link === 'string' && link.trim() !== '') return link
  const url = item.url
  if (typeof url === 'string' && url.trim() !== '') return url
  const links = item.links as Array<{ href?: string }> | undefined
  const href = links?.[0]?.href
  if (typeof href === 'string' && href.trim() !== '') return href
  return null
}

/** Get content/encoded from feedsmith content namespace or content:encoded key */
export function itemContentEncoded(item: Record<string, unknown>): string | undefined {
  const c = item.content
  if (
    typeof c === 'object' &&
    c !== null &&
    'encoded' in c &&
    typeof (c as { encoded: unknown }).encoded === 'string'
  ) {
    return (c as { encoded: string }).encoded
  }
  const raw = item['content:encoded']
  return typeof raw === 'string' ? raw : undefined
}

export function feedTextValue(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  return hasStringValue(value) ? value.value : undefined
}

/** Normalize categories to string[] (feedsmith uses { name } or string) */
export function itemCategories(item: Record<string, unknown>): string[] {
  const cat = item.categories
  if (!Array.isArray(cat) || cat.length === 0) return []
  return cat.flatMap(c => {
    const raw =
      typeof c === 'object' && c !== null && 'name' in c ? (c as { name: unknown }).name : c
    return typeof raw === 'string' && raw.trim() !== '' ? [raw] : []
  })
}

function valueOrString(input: unknown): string | null {
  if (hasStringValue(input)) {
    const value = input.value.trim()
    return value === '' ? null : value
  }
  if (input == null) return null
  const value = String(input).trim()
  return value === '' ? null : value
}

function hasStringValue(input: unknown): input is { value: string } {
  return (
    typeof input === 'object' &&
    input !== null &&
    'value' in input &&
    typeof (input as { value: unknown }).value === 'string'
  )
}
