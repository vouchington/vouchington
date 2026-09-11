/* v8 ignore start -- test support module exercised by schema-static-analysis.test.mts */
export type NamedCatalogObject = {
  kind: string
  name: string
}

export type NamedCatalogColumn = {
  kind: string
  relation_name: string
  column_name: string
}

export type TypeViolation = {
  table_name: string
  column_name: string
  data_type: string
  udt_name: string
}

const NAME_INFLECTION_IGNORE_PATTERNS = [
  /.*_base$/,
  /.*_private$/,
  /.*_public$/,
  /.*_p_.*/,
  /relation__.*/,
  /.*_by_session$/,
  /.*_by_user$/,
  /.*_history$/,
  /.*_rag$/,
  /.*__default$/,
  /^rss_feed_items_default$/,
  /^post_publication_dirty_work$/,
]

const INVARIANT_PLURAL_LAST_WORDS = new Set(['news'])
const IRREGULAR_PLURAL_LAST_WORDS = new Set([
  'children',
  'feet',
  'geese',
  'men',
  'mice',
  'people',
  'teeth',
  'women',
])
const SINGULAR_LAST_WORDS_ENDING_IN_S = new Set([
  'analysis',
  'basis',
  'crisis',
  'diagnosis',
  'hypothesis',
  'oasis',
  'series',
  'status',
  'synopsis',
  'thesis',
])

export function isSnakeCase(name: string): boolean {
  if (name === '__entity_type') return true
  return /^[a-z][a-z0-9_]*$/.test(name)
}

export function isIgnoredForNameInflection(name: string): boolean {
  return NAME_INFLECTION_IGNORE_PATTERNS.some(pattern => pattern.test(name))
}

export function looksPlural(name: string): boolean {
  const lastWord = name
    .split(/_+/)
    .flatMap(part => (part.trim() ? [part.trim()] : []))
    .at(-1)
    ?.toLowerCase()

  if (!lastWord) return true
  if (INVARIANT_PLURAL_LAST_WORDS.has(lastWord)) return true
  if (IRREGULAR_PLURAL_LAST_WORDS.has(lastWord)) return true
  if (SINGULAR_LAST_WORDS_ENDING_IN_S.has(lastWord)) return false
  if (lastWord.endsWith('ss')) return false
  if (/(?:ches|shes|sses|xes|zzes)$/.test(lastWord)) return true
  if (/(?:ies|ves|oes)$/.test(lastWord)) return true
  return lastWord.endsWith('s')
}

export function formatNamedObjects(objects: NamedCatalogObject[]): string[] {
  return objects.map(object => `${object.kind}:${object.name}`)
}

export function formatNamedColumns(columns: NamedCatalogColumn[]): string[] {
  return columns.map(column => `${column.kind}:${column.relation_name}.${column.column_name}`)
}

export function formatTypeViolations(violations: TypeViolation[]): string[] {
  return violations.map(
    violation =>
      `${violation.table_name}.${violation.column_name}: ${violation.data_type}/${violation.udt_name}`,
  )
}
/* v8 ignore stop */
