const relationPatterns = new Map<string, RegExp>()
const createdAtPredicatePatterns = new Map<string, RegExp>()
const SQL_ALIAS_KEYWORD_RE = /^(?:where|set|join|on|order|group|limit|returning)$/i

function cachedPattern(cache: Map<string, RegExp>, key: string, source: string): RegExp {
  const existing = cache.get(key)
  if (existing) return existing
  const pattern = new RegExp(source, 'i')
  cache.set(key, pattern)
  return pattern
}

export function findUuidv7CreatedAtPredicate(
  text: string,
  uuidv7Tables: Set<string>,
): string | null {
  for (const table of uuidv7Tables) {
    const relation = cachedPattern(
      relationPatterns,
      table,
      String.raw`\b(?:FROM|JOIN|UPDATE|INTO)\s+${table}\b(?:\s+(?:AS\s+)?([a-z_][a-z0-9_]*))?`,
    ).exec(text)
    if (!relation) continue
    const candidateAlias = relation[1]
    const alias =
      candidateAlias && !SQL_ALIAS_KEYWORD_RE.test(candidateAlias) ? candidateAlias : table
    const predicate = cachedPattern(
      createdAtPredicatePatterns,
      alias,
      String.raw`\b${alias}\.created_at\s*(?:=|<|>|<=|>=|BETWEEN\b)`,
    )
    if (predicate.test(text)) return table
  }
  return null
}
