export interface ClientIntentParityParseResult {
  diagnostics: string[]
  ids?: Set<string>
}

export function parseClientIntentParityIds(content: string): ClientIntentParityParseResult {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { diagnostics: [`$ contains invalid JSON: ${message}`] }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { diagnostics: ['$ must be an object'] }
  }
  const record = value as Record<string, unknown>
  if (record.version !== 1) return { diagnostics: ['$.version must be 1'] }
  const intents = record.intents
  if (!Array.isArray(intents)) return { diagnostics: ['$.intents must be an array'] }

  const diagnostics: string[] = []
  const ids = new Set<string>()
  intents.forEach((intent, index) => {
    const id =
      typeof intent === 'object' && intent !== null && !Array.isArray(intent)
        ? (intent as Record<string, unknown>).id
        : undefined
    if (typeof id !== 'string' || id.trim().length === 0) {
      diagnostics.push(`$.intents[${index}].id must be a non-empty string`)
      return
    }
    if (ids.has(id)) diagnostics.push(`$.intents[${index}].id duplicates intent "${id}"`)
    ids.add(id)
  })
  return diagnostics.length > 0 ? { diagnostics } : { diagnostics, ids }
}
