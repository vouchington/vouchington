export const CANONICAL_PRIORITIES = [
  'priority: critical',
  'priority: high',
  'priority: medium',
  'priority: low',
] as const

export type CanonicalPriority = (typeof CANONICAL_PRIORITIES)[number]

export type DuplicateSearchConfig = {
  query: string
  acknowledgedHits: number[]
  acknowledgedSiblings: string[]
}

export type BatchEntry = {
  id: string
  title: string
  bodyFile: string
  paths: string[]
  priority: CanonicalPriority
  dependencies: string[]
  milestone: string | null
  extraLabels: string[]
  duplicateSearch: DuplicateSearchConfig
}

export type BatchManifest = {
  targetRepo: string
  entries: BatchEntry[]
}

// Keep entry ids identifier-safe so reports and future read-only tooling can address entries
// without escaping or ambiguous keys.
const ENTRY_ID = /^[A-Za-z_][A-Za-z0-9_]*$/

// `gh issue list --search` returns related, not only duplicate, issues, so preflight cannot
// fail-closed by treating every hit as a duplicate. `acknowledgedHits`/`acknowledgedSiblings`
// capture the author's explicit non-duplicate judgment inside the manifest; a hit or intra-batch
// collision blocks unless acknowledged here. Omitting the field entirely defaults to the
// strictest behavior (search by title, acknowledge nothing) rather than skipping the check.
function parseDuplicateSearch(
  raw: unknown,
  title: string,
  id: string,
  index: number,
): DuplicateSearchConfig {
  if (raw === undefined || raw === null) {
    return { query: title, acknowledgedHits: [], acknowledgedSiblings: [] }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`entries[${index}] ("${id}").duplicateSearch must be an object if present.`)
  }
  const record = raw as Record<string, unknown>

  const query = record.query ?? title
  if (typeof query !== 'string' || query.trim().length === 0) {
    throw new Error(`entries[${index}] ("${id}").duplicateSearch.query must be a non-empty string.`)
  }

  const acknowledgedHits = record.acknowledgedHits ?? []
  if (!Array.isArray(acknowledgedHits) || acknowledgedHits.some(hit => typeof hit !== 'number')) {
    throw new Error(
      `entries[${index}] ("${id}").duplicateSearch.acknowledgedHits must be an array of numbers if present.`,
    )
  }

  const acknowledgedSiblings = record.acknowledgedSiblings ?? []
  if (
    !Array.isArray(acknowledgedSiblings) ||
    acknowledgedSiblings.some(sibling => typeof sibling !== 'string')
  ) {
    throw new Error(
      `entries[${index}] ("${id}").duplicateSearch.acknowledgedSiblings must be an array of strings if present.`,
    )
  }

  return {
    query,
    acknowledgedHits: acknowledgedHits as number[],
    acknowledgedSiblings: acknowledgedSiblings as string[],
  }
}

function parseEntry(raw: Record<string, unknown>, index: number): BatchEntry {
  const { id } = raw
  if (typeof id !== 'string' || !ENTRY_ID.test(id)) {
    throw new Error(
      `entries[${index}].id must match ${ENTRY_ID} (identifier-safe), got ${JSON.stringify(id)}.`,
    )
  }

  const { title } = raw
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new Error(`entries[${index}] ("${id}").title must be a non-empty string.`)
  }

  const { bodyFile } = raw
  if (typeof bodyFile !== 'string' || bodyFile.trim().length === 0) {
    throw new Error(`entries[${index}] ("${id}").bodyFile must be a non-empty string.`)
  }
  if (bodyFile.includes('..') || bodyFile.startsWith('/')) {
    throw new Error(
      `entries[${index}] ("${id}").bodyFile cannot contain path traversal components.`,
    )
  }

  const { paths } = raw
  if (!Array.isArray(paths) || paths.some(path => typeof path !== 'string')) {
    throw new Error(`entries[${index}] ("${id}").paths must be an array of strings.`)
  }

  const { priority } = raw
  if (
    typeof priority !== 'string' ||
    !CANONICAL_PRIORITIES.includes(priority as CanonicalPriority)
  ) {
    throw new Error(
      `entries[${index}] ("${id}").priority must be one of ${CANONICAL_PRIORITIES.join(', ')}, got ${JSON.stringify(priority)}.`,
    )
  }

  const dependencies = raw.dependencies ?? []
  if (!Array.isArray(dependencies) || dependencies.some(dep => typeof dep !== 'string')) {
    throw new Error(
      `entries[${index}] ("${id}").dependencies must be an array of strings if present.`,
    )
  }

  const milestone = raw.milestone ?? null
  if (milestone !== null && typeof milestone !== 'string') {
    throw new Error(`entries[${index}] ("${id}").milestone must be a string or null.`)
  }

  const extraLabels = raw.extraLabels ?? []
  if (!Array.isArray(extraLabels) || extraLabels.some(label => typeof label !== 'string')) {
    throw new Error(
      `entries[${index}] ("${id}").extraLabels must be an array of strings if present.`,
    )
  }

  return {
    id,
    title,
    bodyFile,
    paths: paths as string[],
    priority: priority as CanonicalPriority,
    dependencies: dependencies as string[],
    milestone: milestone as string | null,
    extraLabels: extraLabels as string[],
    duplicateSearch: parseDuplicateSearch(raw.duplicateSearch, title, id, index),
  }
}

/** Parses and validates a batch manifest JSON document. Throws on any schema violation. */
export function parseManifest(raw: string): BatchManifest {
  const parsed = JSON.parse(raw) as Record<string, unknown>

  const { targetRepo } = parsed
  if (targetRepo !== 'vouchington/vouchington') {
    throw new Error(
      `manifest.targetRepo must be exactly "vouchington/vouchington", got ${JSON.stringify(targetRepo)}.`,
    )
  }

  const rawEntries = parsed.entries
  if (!Array.isArray(rawEntries) || rawEntries.length === 0) {
    throw new Error('manifest.entries must be a non-empty array.')
  }

  const entries = rawEntries.map((rawEntry, index) =>
    parseEntry(rawEntry as Record<string, unknown>, index),
  )

  const seenIds = new Set<string>()
  for (const entry of entries) {
    if (seenIds.has(entry.id)) throw new Error(`Duplicate manifest entry id "${entry.id}".`)
    seenIds.add(entry.id)
  }

  return { targetRepo, entries }
}
