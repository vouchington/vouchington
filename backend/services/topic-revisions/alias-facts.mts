import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import type { TopicRevisionChanges } from './facts.mts'

const TEXT_FIELDS = ['name', 'slug', 'markdown'] as const
const UUID_FIELDS = [
  'logo_image_id',
  'hero_image_id',
  'homepage_url_id',
  'hostname_id',
  'rewards_program_id',
  'referral_program_id',
] as const
const ALIAS_KINDS = ['topic_alias_link', 'topic_alias_unlink', 'topic_aliases'] as const

type TextPair = { changed: boolean; before: string | null; after: string | null }
type AliasEntry = { aliasId: string | null; aliasText: string }

export function aliasChange(changes: TopicRevisionChanges): {
  kind: (typeof ALIAS_KINDS)[number] | null
  beforeIsList: boolean
  afterIsList: boolean
  before: AliasEntry[]
  after: AliasEntry[]
} {
  const present = ALIAS_KINDS.filter(kind => kind in changes)
  if (present.length > 1) throw new Error('A topic revision can change only one alias fact')
  const kind = present[0] ?? null
  if (!kind) return { kind: null, beforeIsList: false, afterIsList: false, before: [], after: [] }
  const change = changes[kind]
  if (!change) return { kind: null, beforeIsList: false, afterIsList: false, before: [], after: [] }
  const before = aliasSide(kind, change.before, 'before')
  const after = aliasSide(kind, change.after, 'after')
  return {
    kind,
    beforeIsList: before.isList,
    afterIsList: after.isList,
    before: before.entries,
    after: after.entries,
  }
}

function aliasSide(
  kind: (typeof ALIAS_KINDS)[number],
  value: unknown,
  _side: 'before' | 'after',
): { isList: boolean; entries: AliasEntry[] } {
  if (value === null) return { isList: false, entries: [] }
  if (kind === 'topic_aliases') {
    if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
      throw new Error('Topic revision topic_aliases must be an array of strings')
    }
    return { isList: true, entries: value.map(aliasText => ({ aliasId: null, aliasText })) }
  }
  if (Array.isArray(value)) {
    return { isList: true, entries: value.map(item => asAliasObject(item)) }
  }
  return { isList: false, entries: [asAliasObject(value)] }
}

function asAliasObject(value: unknown): AliasEntry {
  if (!isRecord(value) || typeof value.alias !== 'string') {
    throw new Error('Topic revision alias fact must include alias text')
  }
  if (value.id !== undefined && value.id !== null && typeof value.id !== 'string') {
    throw new Error('Topic revision alias id must be text')
  }
  return { aliasId: typeof value.id === 'string' ? value.id : null, aliasText: value.alias }
}

export async function insertAliasEntries(
  revisionId: string,
  alias: { kind: string | null; before: AliasEntry[]; after: AliasEntry[] },
  options: QueryOptions,
): Promise<void> {
  if (alias.kind == null) return
  const rows = [
    ...alias.before.map((entry, position) => ({ ...entry, side: 'before', position })),
    ...alias.after.map((entry, position) => ({ ...entry, side: 'after', position })),
  ]
  if (rows.length === 0) return
  await write(
    sql`/* createTopicRevision:aliases */
      INSERT INTO topic_revision_alias_entries (
        revision_id, change_kind, side, position, alias_id, alias_text
      )
      SELECT ${revisionId}::uuid, ${alias.kind}, item.side, item.position, item.alias_id, item.alias_text
      FROM UNNEST(
        ${rows.map(row => row.side)}::text[],
        ${rows.map(row => row.position)}::integer[],
        ${rows.map(row => row.aliasId)}::uuid[],
        ${rows.map(row => row.aliasText)}::text[]
      ) AS item(side, position, alias_id, alias_text)`,
    options,
  )
}

export function textPair(
  changes: TopicRevisionChanges,
  field: (typeof TEXT_FIELDS)[number],
): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return { changed: true, before: asText(change.before, field), after: asText(change.after, field) }
}

export function enumPair(
  changes: TopicRevisionChanges,
  field: string,
  allowed: Set<string>,
): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return {
    changed: true,
    before: asEnum(change.before, field, allowed),
    after: asEnum(change.after, field, allowed),
  }
}

export function boolPair(
  changes: TopicRevisionChanges,
  field: string,
): {
  changed: boolean
  before: boolean | null
  after: boolean | null
} {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return {
    changed: true,
    before: asBoolean(change.before, field),
    after: asBoolean(change.after, field),
  }
}

export function uuidPair(
  changes: TopicRevisionChanges,
  field: (typeof UUID_FIELDS)[number],
): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return { changed: true, before: asText(change.before, field), after: asText(change.after, field) }
}

export function timePair(
  changes: TopicRevisionChanges,
  field: string,
): {
  changed: boolean
  before: Date | null
  after: Date | null
  beforeSentinel: string | null
  afterSentinel: string | null
} {
  const change = changes[field]
  if (!change) {
    return { changed: false, before: null, after: null, beforeSentinel: null, afterSentinel: null }
  }
  const before = asTimestamp(change.before, field)
  const after = asTimestamp(change.after, field)
  return {
    changed: true,
    before: before.at,
    after: after.at,
    beforeSentinel: before.sentinel,
    afterSentinel: after.sentinel,
  }
}

function asText(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  throw new Error(`Topic revision ${field} must be text or null`)
}

function asEnum(value: unknown, field: string, allowed: Set<string>): string | null {
  if (value === null) return null
  if (typeof value === 'string' && allowed.has(value)) return value
  throw new Error(`Topic revision ${field} has an unknown value`)
}

function asBoolean(value: unknown, field: string): boolean | null {
  if (value === null) return null
  if (typeof value === 'boolean') return value
  throw new Error(`Topic revision ${field} must be boolean or null`)
}

function asTimestamp(value: unknown, field: string): { at: Date | null; sentinel: string | null } {
  if (value === null) return { at: null, sentinel: null }
  if (value === 'now') return { at: null, sentinel: 'now' }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { at: value, sentinel: null }
  throw new Error(`Topic revision ${field} must be a timestamp, now, or null`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
