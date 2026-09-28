import { beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'

type RevisionType = 'create' | 'update' | 'delete'
type FieldChange = { before: unknown; after: unknown }
export type PostRevisionChanges = Record<string, FieldChange>

const TEXT_FIELDS = [
  'title',
  'markdown',
  'ai_summary_markdown',
  'slug',
  'declared_language',
] as const
const BROADCASTS = new Set(['everyone', 'users', 'followers', 'mutual_followers'])
const PRIVACIES = new Set(['public', 'private'])
const VERTICALS = new Set(['credit_card', 'bank_account'])
const CREDIT_KEYS = new Set([
  'vertical',
  'schema_version',
  'topic_ids',
  'result',
  'currency',
  'credit_score_range',
  'stated_income_range',
  'existing_relationship',
  'hard_inquiries_12m',
  'cards_opened_24m',
  'credit_limit',
  'total_credit_limit_all_cards',
  'years_of_credit_history',
  'is_business_application',
  'application_method',
  'application_date',
])
const BANK_KEYS = new Set([
  'vertical',
  'schema_version',
  'topic_ids',
  'result',
  'currency',
  'account_type',
  'credit_score_range',
  'stated_income_range',
  'existing_relationship',
  'bonus_amount',
  'bonus_requirements',
  'minimum_balance_requirement',
  'direct_deposit_setup',
  'application_date',
])

type TextPair = { changed: boolean; before: string | null; after: string | null }
type BoolPair = { changed: boolean; before: boolean | null; after: boolean | null }
type TimePair = {
  changed: boolean
  before: Date | null
  after: Date | null
  beforeSentinel: string | null
  afterSentinel: string | null
}

export async function insertPostRevisionFacts(
  postId: string,
  revisionType: RevisionType,
  changes: PostRevisionChanges,
  revisedById: string | null,
  options?: QueryOptions,
): Promise<{
  id: string
  post_id: string
  revision_type: RevisionType
  revised_by_id: string | null
  created_at: Date
}> {
  if (options?.query || options?.client)
    return writeFacts(postId, revisionType, changes, revisedById, options)
  await using query = await beginTransaction()
  const row = await writeFacts(postId, revisionType, changes, revisedById, { query })
  await query.commit()
  return row
}

async function writeFacts(
  postId: string,
  revisionType: RevisionType,
  changes: PostRevisionChanges,
  revisedById: string | null,
  options: QueryOptions,
) {
  assertKnownChanges(changes)
  const title = textPair(changes, 'title')
  const markdown = textPair(changes, 'markdown')
  const summary = textPair(changes, 'ai_summary_markdown')
  const slug = textPair(changes, 'slug')
  const language = textPair(changes, 'declared_language')
  const vertical = enumPair(changes, 'data_point_vertical', VERTICALS)
  const broadcast = enumPair(changes, 'broadcast', BROADCASTS)
  const privacy = enumPair(changes, 'privacy', PRIVACIES)
  const anonymous = boolPair(changes, 'is_anonymous')
  const deletedAt = timePair(changes, 'deleted_at')
  const archivedAt = timePair(changes, 'archived_at')
  const {
    rows: [row],
  } = await write<{
    id: string
    post_id: string
    revision_type: RevisionType
    revised_by_id: string | null
    created_at: Date
  }>(
    sql`/* createPostRevision */
      INSERT INTO post_revisions (
        post_id, revision_type, revised_by_id,
        title_changed, title_before, title_after,
        markdown_changed, markdown_before, markdown_after,
        ai_summary_markdown_changed, ai_summary_markdown_before, ai_summary_markdown_after,
        broadcast_changed, broadcast_before, broadcast_after,
        privacy_changed, privacy_before, privacy_after,
        is_anonymous_changed, is_anonymous_before, is_anonymous_after,
        data_point_vertical_changed, data_point_vertical_before, data_point_vertical_after,
        declared_language_changed, declared_language_before, declared_language_after,
        slug_changed, slug_before, slug_after,
        deleted_at_changed, deleted_at_before, deleted_at_after, deleted_at_before_sentinel, deleted_at_after_sentinel,
        archived_at_changed, archived_at_before, archived_at_after, archived_at_before_sentinel, archived_at_after_sentinel,
        categories_changed, post_images_changed, review_topic_ratings_changed, structured_data_changed
      ) VALUES (
        ${postId}, ${revisionType}, ${revisedById},
        ${title.changed}, ${title.before}, ${title.after},
        ${markdown.changed}, ${markdown.before}, ${markdown.after},
        ${summary.changed}, ${summary.before}, ${summary.after},
        ${broadcast.changed}, ${broadcast.before}, ${broadcast.after},
        ${privacy.changed}, ${privacy.before}, ${privacy.after},
        ${anonymous.changed}, ${anonymous.before}, ${anonymous.after},
        ${vertical.changed}, ${vertical.before}, ${vertical.after},
        ${language.changed}, ${language.before}, ${language.after},
        ${slug.changed}, ${slug.before}, ${slug.after},
        ${deletedAt.changed}, ${deletedAt.before}, ${deletedAt.after}, ${deletedAt.beforeSentinel}, ${deletedAt.afterSentinel},
        ${archivedAt.changed}, ${archivedAt.before}, ${archivedAt.after}, ${archivedAt.beforeSentinel}, ${archivedAt.afterSentinel},
        ${'categories' in changes}, ${'post_images' in changes}, ${'review_topic_ratings' in changes},
        ${'structured_data' in changes}
      )
      RETURNING id, post_id, revision_type, revised_by_id, created_at`,
    options,
  )
  if (!row) throw new Error('Post revision insert did not return a row')
  await insertStringIds(row.id, 'post_revision_images', 'image_id', changes.post_images, options)
  await insertStringIds(
    row.id,
    'post_revision_rating_topics',
    'topic_id',
    changes.review_topic_ratings,
    options,
  )
  await insertCategories(row.id, changes.categories, options)
  await insertStructuredData(row.id, changes.structured_data, options)
  return row
}

function assertKnownChanges(changes: PostRevisionChanges): void {
  const known = new Set<string>([
    ...TEXT_FIELDS,
    'broadcast',
    'privacy',
    'is_anonymous',
    'data_point_vertical',
    'deleted_at',
    'archived_at',
    'categories',
    'post_images',
    'review_topic_ratings',
    'structured_data',
  ])
  for (const field of Object.keys(changes)) {
    if (!known.has(field)) throw new Error(`Unknown post revision field: ${field}`)
  }
}

function textPair(changes: PostRevisionChanges, field: (typeof TEXT_FIELDS)[number]): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return { changed: true, before: asText(change.before, field), after: asText(change.after, field) }
}

function enumPair(changes: PostRevisionChanges, field: string, allowed: Set<string>): TextPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return {
    changed: true,
    before: asEnum(change.before, field, allowed),
    after: asEnum(change.after, field, allowed),
  }
}

function boolPair(changes: PostRevisionChanges, field: string): BoolPair {
  const change = changes[field]
  if (!change) return { changed: false, before: null, after: null }
  return {
    changed: true,
    before: asBoolean(change.before, field),
    after: asBoolean(change.after, field),
  }
}

function timePair(changes: PostRevisionChanges, field: string): TimePair {
  const change = changes[field]
  if (!change)
    return { changed: false, before: null, after: null, beforeSentinel: null, afterSentinel: null }
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

async function insertStringIds(
  revisionId: string,
  table: 'post_revision_images' | 'post_revision_rating_topics',
  column: 'image_id' | 'topic_id',
  change: FieldChange | undefined,
  options: QueryOptions,
): Promise<void> {
  if (!change) return
  await insertSideIds(revisionId, table, column, 'before', asIdList(change.before, column), options)
  await insertSideIds(revisionId, table, column, 'after', asIdList(change.after, column), options)
}

async function insertSideIds(
  revisionId: string,
  table: string,
  column: string,
  side: 'before' | 'after',
  ids: string[],
  options: QueryOptions,
): Promise<void> {
  if (ids.length === 0) return
  const insert = sql`/* createPostRevision:ids */
    INSERT INTO `
  insert.append(table)
  insert.append(sql` (revision_id, side, position, `)
  insert.append(column)
  insert.append(sql`)
    SELECT ${revisionId}::uuid, ${side}, item.position::integer, item.id::uuid
    FROM UNNEST(${ids}::uuid[], ${ids.map((_, index) => index)}::integer[]) AS item(id, position)`)
  await write(insert, options)
}

async function insertCategories(
  revisionId: string,
  change: FieldChange | undefined,
  options: QueryOptions,
): Promise<void> {
  if (!change) return
  await insertCategorySide(revisionId, 'before', change.before, options)
  await insertCategorySide(revisionId, 'after', change.after, options)
}

async function insertCategorySide(
  revisionId: string,
  side: 'before' | 'after',
  value: unknown,
  options: QueryOptions,
): Promise<void> {
  const categories = asCategories(value)
  if (categories.length === 0) return
  await write(
    sql`/* createPostRevision:categories */
      INSERT INTO post_revision_categories (revision_id, side, position, topic_id, hashtag, topic_name)
      SELECT ${revisionId}::uuid, ${side}, item.position, item.topic_id, item.hashtag, item.topic_name
      FROM UNNEST(
        ${categories.map((_, index) => index)}::integer[],
        ${categories.map(category => category.topicId)}::uuid[],
        ${categories.map(category => category.hashtag)}::text[],
        ${categories.map(category => category.topicName)}::text[]
      ) AS item(position, topic_id, hashtag, topic_name)`,
    options,
  )
}

async function insertStructuredData(
  revisionId: string,
  change: FieldChange | undefined,
  options: QueryOptions,
): Promise<void> {
  if (!change) return
  await insertStructuredSide(revisionId, 'before', change.before, options)
  await insertStructuredSide(revisionId, 'after', change.after, options)
}

async function insertStructuredSide(
  revisionId: string,
  side: 'before' | 'after',
  value: unknown,
  options: QueryOptions,
): Promise<void> {
  if (value === null) return
  const data = asDataPoint(value)
  await write(
    sql`/* createPostRevision:structuredData */
      INSERT INTO post_revision_data_points (
        revision_id, side, has_vertical, vertical, has_schema_version, schema_version,
        has_result, result, has_currency, currency, has_credit_score_range, credit_score_range,
        has_stated_income_range, stated_income_min_amount, stated_income_min_currency,
        stated_income_max_absent, stated_income_max_amount, stated_income_max_currency,
        has_existing_relationship, existing_relationship, has_hard_inquiries_12m, hard_inquiries_12m,
        has_cards_opened_24m, cards_opened_24m, has_credit_limit, credit_limit_amount, credit_limit_currency,
        has_total_credit_limit_all_cards, total_credit_limit_amount, total_credit_limit_currency,
        has_years_of_credit_history, years_of_credit_history, has_is_business_application, is_business_application,
        has_application_method, application_method, has_application_date, application_date,
        has_account_type, account_type, has_bonus_amount, bonus_amount, bonus_amount_currency,
        has_bonus_requirements, bonus_requirements, has_minimum_balance_requirement,
        minimum_balance_amount, minimum_balance_currency, has_direct_deposit_setup, direct_deposit_setup,
        has_topic_ids
      ) VALUES (
        ${revisionId}, ${side}, ${data.has('vertical')}, ${textValue(data, 'vertical')},
        ${data.has('schema_version')}, ${numberValue(data, 'schema_version')},
        ${data.has('result')}, ${textValue(data, 'result')},
        ${data.has('currency')}, ${textValue(data, 'currency')},
        ${data.has('credit_score_range')}, ${textValue(data, 'credit_score_range')},
        ${data.has('stated_income_range')}, ${data.incomeMinAmount}, ${data.incomeMinCurrency},
        ${data.incomeMaxAbsent}, ${data.incomeMaxAmount}, ${data.incomeMaxCurrency},
        ${data.has('existing_relationship')}, ${boolValue(data, 'existing_relationship')},
        ${data.has('hard_inquiries_12m')}, ${numberValue(data, 'hard_inquiries_12m')},
        ${data.has('cards_opened_24m')}, ${numberValue(data, 'cards_opened_24m')},
        ${data.has('credit_limit')}, ${data.creditLimitAmount}, ${data.creditLimitCurrency},
        ${data.has('total_credit_limit_all_cards')}, ${data.totalLimitAmount}, ${data.totalLimitCurrency},
        ${data.has('years_of_credit_history')}, ${numberValue(data, 'years_of_credit_history')},
        ${data.has('is_business_application')}, ${boolValue(data, 'is_business_application')},
        ${data.has('application_method')}, ${textValue(data, 'application_method')},
        ${data.has('application_date')}, ${textValue(data, 'application_date')},
        ${data.has('account_type')}, ${textValue(data, 'account_type')},
        ${data.has('bonus_amount')}, ${data.bonusAmount}, ${data.bonusCurrency},
        ${data.has('bonus_requirements')}, ${textValue(data, 'bonus_requirements')},
        ${data.has('minimum_balance_requirement')}, ${data.minimumAmount}, ${data.minimumCurrency},
        ${data.has('direct_deposit_setup')}, ${boolValue(data, 'direct_deposit_setup')},
        ${data.has('topic_ids')}
      )`,
    options,
  )
  if (data.topicIds.length === 0) return
  await write(
    sql`/* createPostRevision:structuredTopics */
      INSERT INTO post_revision_data_point_topics (revision_id, side, position, topic_id)
      SELECT ${revisionId}::uuid, ${side}, item.position, item.topic_id
      FROM UNNEST(${data.topicIds}::uuid[], ${data.topicIds.map((_, index) => index)}::integer[])
        AS item(topic_id, position)`,
    options,
  )
}

type DataPointRow = {
  has: (key: string) => boolean
  values: Record<string, unknown>
  topicIds: string[]
  incomeMinAmount: number | null
  incomeMinCurrency: string | null
  incomeMaxAbsent: boolean
  incomeMaxAmount: number | null
  incomeMaxCurrency: string | null
  creditLimitAmount: number | null
  creditLimitCurrency: string | null
  totalLimitAmount: number | null
  totalLimitCurrency: string | null
  bonusAmount: number | null
  bonusCurrency: string | null
  minimumAmount: number | null
  minimumCurrency: string | null
}

function asDataPoint(value: unknown): DataPointRow {
  if (!isRecord(value)) throw new Error('Post revision structured_data must be an object or null')
  const vertical = value.vertical
  const allowed =
    vertical === 'bank_account'
      ? BANK_KEYS
      : vertical === 'credit_card'
        ? CREDIT_KEYS
        : new Set([...CREDIT_KEYS, ...BANK_KEYS])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown structured_data revision field: ${key}`)
  }
  const income = moneyRange(value.stated_income_range, 'stated_income_range')
  const creditLimit = optionalMoney(value, 'credit_limit')
  const totalLimit = optionalMoney(value, 'total_credit_limit_all_cards')
  const bonus = optionalMoney(value, 'bonus_amount')
  const minimum = optionalMoney(value, 'minimum_balance_requirement')
  return {
    has: key => Object.prototype.hasOwnProperty.call(value, key),
    values: value,
    topicIds: asIdList(value.topic_ids ?? [], 'topic_ids'),
    incomeMinAmount: income?.minAmount ?? null,
    incomeMinCurrency: income?.minCurrency ?? null,
    incomeMaxAbsent: income?.maxAbsent ?? false,
    incomeMaxAmount: income?.maxAmount ?? null,
    incomeMaxCurrency: income?.maxCurrency ?? null,
    creditLimitAmount: creditLimit?.amount ?? null,
    creditLimitCurrency: creditLimit?.currency ?? null,
    totalLimitAmount: totalLimit?.amount ?? null,
    totalLimitCurrency: totalLimit?.currency ?? null,
    bonusAmount: bonus?.amount ?? null,
    bonusCurrency: bonus?.currency ?? null,
    minimumAmount: minimum?.amount ?? null,
    minimumCurrency: minimum?.currency ?? null,
  }
}

function textValue(data: DataPointRow, key: string): string | null {
  if (!data.has(key) || data.values[key] === null) return null
  return asText(data.values[key], key)
}

function numberValue(data: DataPointRow, key: string): number | null {
  if (!data.has(key) || data.values[key] === null) return null
  if (typeof data.values[key] !== 'number' || !Number.isFinite(data.values[key] as number)) {
    throw new Error(`Post revision structured_data.${key} must be a number or null`)
  }
  return data.values[key] as number
}

function boolValue(data: DataPointRow, key: string): boolean | null {
  if (!data.has(key) || data.values[key] === null) return null
  return asBoolean(data.values[key], key)
}

function optionalMoney(
  value: Record<string, unknown>,
  key: string,
): { amount: number | null; currency: string | null } | null {
  if (!Object.prototype.hasOwnProperty.call(value, key) || value[key] === null) return null
  return asMoney(value[key], key)
}

function moneyRange(
  value: unknown,
  field: string,
): {
  minAmount: number | null
  minCurrency: string | null
  maxAbsent: boolean
  maxAmount: number | null
  maxCurrency: string | null
} | null {
  if (value === undefined || value === null) return null
  if (!isRecord(value))
    throw new Error(`Post revision structured_data.${field} must be an object or null`)
  const minimum = asMoney(value.minimum, `${field}.minimum`)
  if (value.maximum === null) {
    return {
      minAmount: minimum.amount,
      minCurrency: minimum.currency,
      maxAbsent: true,
      maxAmount: null,
      maxCurrency: null,
    }
  }
  const maximum = asMoney(value.maximum, `${field}.maximum`)
  return {
    minAmount: minimum.amount,
    minCurrency: minimum.currency,
    maxAbsent: false,
    maxAmount: maximum.amount,
    maxCurrency: maximum.currency,
  }
}

function asMoney(value: unknown, field: string): { amount: number; currency: string } {
  if (!isRecord(value) || typeof value.amount !== 'number' || typeof value.currency !== 'string') {
    throw new Error(`Post revision structured_data.${field} must be money`)
  }
  return { amount: value.amount, currency: value.currency }
}

type CategoryFact = { topicId: string | null; hashtag: string | null; topicName: string | null }

function asCategories(value: unknown): CategoryFact[] {
  if (!Array.isArray(value)) throw new Error('Post revision categories must be an array')
  return value.map(item => {
    if (!isRecord(item)) throw new Error('Post revision category must be an object')
    if (item.type === 'topic' && typeof item.topic_id === 'string') {
      return {
        topicId: item.topic_id,
        hashtag: null,
        topicName: typeof item.topic_name === 'string' ? item.topic_name : null,
      }
    }
    if (item.type === 'hashtag' && typeof item.hashtag === 'string') {
      return { topicId: null, hashtag: item.hashtag, topicName: null }
    }
    throw new Error('Post revision category must be a topic or hashtag')
  })
}

function asIdList(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some(item => typeof item !== 'string')) {
    throw new Error(`Post revision ${field} must be an array of ids`)
  }
  return value
}

function asText(value: unknown, field: string): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value
  throw new Error(`Post revision ${field} must be text or null`)
}

function asEnum(value: unknown, field: string, allowed: Set<string>): string | null {
  if (value === null) return null
  if (typeof value === 'string' && allowed.has(value)) return value
  throw new Error(`Post revision ${field} has an unknown value`)
}

function asBoolean(value: unknown, field: string): boolean | null {
  if (value === null) return null
  if (typeof value === 'boolean') return value
  throw new Error(`Post revision ${field} must be boolean or null`)
}

function asTimestamp(value: unknown, field: string): { at: Date | null; sentinel: string | null } {
  if (value === null) return { at: null, sentinel: null }
  if (value === 'now') return { at: null, sentinel: 'now' }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return { at: value, sentinel: null }
  throw new Error(`Post revision ${field} must be a timestamp, now, or null`)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
