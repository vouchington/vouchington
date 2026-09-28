import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

type RevisionType = 'create' | 'update' | 'delete'
type FieldChange = { before: unknown; after: unknown }
export type TopicRevisionChanges = Record<string, FieldChange>

const TEXT_FIELDS = ['name', 'slug', 'markdown'] as const
const TOPIC_TYPES = new Set([
  'topic',
  'rewards_program',
  'referral_program',
  'card',
  'rewards_program_status',
  'bank_account',
  'rss_feed',
  'fediverse_instance',
])
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

export async function insertTopicRevisionFacts(
  topicId: string,
  revisionType: RevisionType,
  changes: TopicRevisionChanges,
  revisedById: string | null,
  revisedByRolesSql: ReturnType<typeof sql>,
  options?: QueryOptions,
): Promise<{
  id: string
  topic_id: string
  revision_type: RevisionType
  revised_by_id: string | null
  revised_by_roles: string[]
  created_at: Date
}> {
  if (options?.query || options?.client) {
    return writeFacts(topicId, revisionType, changes, revisedById, revisedByRolesSql, options)
  }
  await using query = await beginTransaction()
  const row = await writeFacts(topicId, revisionType, changes, revisedById, revisedByRolesSql, {
    query,
  })
  await query.commit()
  return row
}

async function writeFacts(
  topicId: string,
  revisionType: RevisionType,
  changes: TopicRevisionChanges,
  revisedById: string | null,
  revisedByRolesSql: ReturnType<typeof sql>,
  options: QueryOptions,
) {
  const alias = aliasChange(changes)
  const name = textPair(changes, 'name')
  const slug = textPair(changes, 'slug')
  const markdown = textPair(changes, 'markdown')
  const topicType = enumPair(changes, 'topic_type', TOPIC_TYPES)
  const noindex = boolPair(changes, 'noindex')
  const allowReviews = boolPair(changes, 'allow_reviews')
  const logo = uuidPair(changes, 'logo_image_id')
  const hero = uuidPair(changes, 'hero_image_id')
  const homepage = uuidPair(changes, 'homepage_url_id')
  const hostname = uuidPair(changes, 'hostname_id')
  const rewards = uuidPair(changes, 'rewards_program_id')
  const referral = uuidPair(changes, 'referral_program_id')
  const deletedAt = timePair(changes, 'deleted_at')
  const insert = sql`/* createTopicRevision */
    INSERT INTO topic_revisions (
      topic_id, revision_type, revised_by_id, revised_by_roles,
      name_changed, name_before, name_after,
      slug_changed, slug_before, slug_after,
      topic_type_changed, topic_type_before, topic_type_after,
      markdown_changed, markdown_before, markdown_after,
      noindex_changed, noindex_before, noindex_after,
      allow_reviews_changed, allow_reviews_before, allow_reviews_after,
      logo_image_id_changed, logo_image_id_before, logo_image_id_after,
      hero_image_id_changed, hero_image_id_before, hero_image_id_after,
      homepage_url_id_changed, homepage_url_id_before, homepage_url_id_after,
      hostname_id_changed, hostname_id_before, hostname_id_after,
      rewards_program_id_changed, rewards_program_id_before, rewards_program_id_after,
      referral_program_id_changed, referral_program_id_before, referral_program_id_after,
      deleted_at_changed, deleted_at_before, deleted_at_after,
      deleted_at_before_sentinel, deleted_at_after_sentinel,
      alias_change_kind, alias_before_is_list, alias_after_is_list
    ) VALUES (
      ${topicId}, ${revisionType}, ${revisedById}, `
  insert.append(revisedByRolesSql)
  insert.append(sql`,
      ${name.changed}, ${name.before}, ${name.after},
      ${slug.changed}, ${slug.before}, ${slug.after},
      ${topicType.changed}, ${topicType.before}, ${topicType.after},
      ${markdown.changed}, ${markdown.before}, ${markdown.after},
      ${noindex.changed}, ${noindex.before}, ${noindex.after},
      ${allowReviews.changed}, ${allowReviews.before}, ${allowReviews.after},
      ${logo.changed}, ${logo.before}, ${logo.after},
      ${hero.changed}, ${hero.before}, ${hero.after},
      ${homepage.changed}, ${homepage.before}, ${homepage.after},
      ${hostname.changed}, ${hostname.before}, ${hostname.after},
      ${rewards.changed}, ${rewards.before}, ${rewards.after},
      ${referral.changed}, ${referral.before}, ${referral.after},
      ${deletedAt.changed}, ${deletedAt.before}, ${deletedAt.after},
      ${deletedAt.beforeSentinel}, ${deletedAt.afterSentinel},
      ${alias.kind}, ${alias.beforeIsList}, ${alias.afterIsList}
    )
    RETURNING id, topic_id, revision_type, revised_by_id, revised_by_roles, created_at`)
  const {
    rows: [row],
  } = await write<{
    id: string
    topic_id: string
    revision_type: RevisionType
    revised_by_id: string | null
    revised_by_roles: string[]
    created_at: Date
  }>(insert, options)
  if (!row) throw new Error('Topic revision insert did not return a row')
  if (alias.kind) await insertAliasEntries(row.id, alias, options)
  return row
}

function aliasChange(changes: TopicRevisionChanges): {
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

type AliasEntry = { aliasId: string | null; aliasText: string }

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

async function insertAliasEntries(
  revisionId: string,
  alias: { kind: string; before: AliasEntry[]; after: AliasEntry[] },
  options: QueryOptions,
): Promise<void> {
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

function textPair(changes: TopicRevisionChanges, field: (typeof TEXT_FIELDS)[number]): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return { changed: true, before: asText(change.before, field), after: asText(change.after, field) }
}

function enumPair(changes: TopicRevisionChanges, field: string, allowed: Set<string>): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return {
    changed: true,
    before: asEnum(change.before, field, allowed),
    after: asEnum(change.after, field, allowed),
  }
}

function boolPair(
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

function uuidPair(changes: TopicRevisionChanges, field: (typeof UUID_FIELDS)[number]): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return { changed: true, before: asText(change.before, field), after: asText(change.after, field) }
}

function timePair(
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
