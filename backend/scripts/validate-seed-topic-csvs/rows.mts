import { isSlug } from '@modules/utils'
import { validateTopicHeaders, validateTopicRows } from '@services/admin-imports/validate-topics'
import { topicTypes } from '@voucha/types/entities/topic'
import { appendFeedFieldFailures } from './feed.mts'

const VALID_TOPIC_TYPES = new Set(Object.keys(topicTypes))
const VALID_EXTENSIONS = new Set(['spending_category', 'retailer'])

export type TopicRow = Record<string, string>

function tokens(value: string | undefined): string[] {
  return value ? value.split('|').filter(Boolean) : []
}

export function appendInvalidRows(failures: string[], rows: TopicRow[], label: string) {
  for (const row of validateTopicRows(rows).rows) {
    if (row.valid) continue
    failures.push(
      `${label} row ${row.row_index} (${rows[row.row_index]?.slug}): ${row.errors.join(', ')}`,
    )
  }
}

export function appendTopicFileFailures(
  failures: string[],
  file: string,
  rows: TopicRow[],
  globalSlugs: Set<string>,
  slugToType: Map<string, string>,
  slugToFile: Map<string, string>,
  referralSeen: Map<string, string>,
): number {
  const headerRow = rows[0]
  if (!headerRow) {
    failures.push(`${file}: has no rows`)
    return 0
  }
  const columns = Object.keys(headerRow)
  for (const required of ['name', 'slug', 'topic_type']) {
    if (!columns.includes(required)) failures.push(`${file}: missing column ${required}`)
  }
  const unknown = validateTopicHeaders(columns)
  if (unknown.length > 0) failures.push(`${file}: unknown columns ${unknown.join(', ')}`)

  const seenInFile = new Set<string>()
  let feedCount = 0
  for (const row of rows) {
    feedCount += appendTopicRowFailures(
      failures,
      file,
      row,
      globalSlugs,
      slugToType,
      slugToFile,
      referralSeen,
      seenInFile,
    )
  }
  appendInvalidRows(failures, rows, file)
  return feedCount
}

function appendTopicRowFailures(
  failures: string[],
  file: string,
  row: TopicRow,
  globalSlugs: Set<string>,
  slugToType: Map<string, string>,
  slugToFile: Map<string, string>,
  referralSeen: Map<string, string>,
  seenInFile: Set<string>,
): number {
  const slug = row.slug
  const name = row.name.trim()
  if (!isSlug(slug)) failures.push(`${file}: slug "${slug}" is invalid`)
  if (seenInFile.has(slug)) failures.push(`${file}: duplicate slug "${slug}"`)
  seenInFile.add(slug)
  if (name.length < 1 || name.length > 200) {
    failures.push(`${file}: slug "${slug}" name length ${name.length}`)
  }
  if (!VALID_TOPIC_TYPES.has(row.topic_type)) {
    failures.push(`${file}: slug "${slug}" topic_type "${row.topic_type}" is invalid`)
  }
  for (const parent of tokens(row.parent_slugs)) {
    if (!globalSlugs.has(parent)) {
      failures.push(`${file}: slug "${slug}" parent_slugs -> "${parent}"`)
    }
    if (row.topic_type === 'rss_feed' && slugToType.get(parent) === 'rss_feed') {
      failures.push(`${file}: "${slug}" parent "${parent}" is also rss_feed`)
    }
  }
  for (const extension of tokens(row.extensions)) {
    if (!VALID_EXTENSIONS.has(extension)) {
      failures.push(`${file}: slug "${slug}" extension "${extension}" is invalid`)
    }
  }
  appendFeedFieldFailures(failures, file, row, slug, name)
  const existing = slugToFile.get(slug)
  if (existing) failures.push(`"${slug}" in both ${existing} and ${file}`)
  else slugToFile.set(slug, file)
  for (const alias of tokens(row.aliases)) {
    const lower = alias.toLowerCase()
    if (globalSlugs.has(lower) && lower !== slug) {
      failures.push(`${file}: alias "${alias}" of "${slug}" collides with slug "${lower}"`)
    }
  }
  const referral = row.referral_validation_slug?.trim()
  if (referral) {
    const prior = referralSeen.get(referral)
    if (prior) failures.push(`referral_validation_slug "${referral}" in both ${prior} and ${file}`)
    else referralSeen.set(referral, file)
  }
  const company = row.referral_company_slug?.trim()
  if (company && !globalSlugs.has(company)) {
    failures.push(
      `${file}: referral_company_slug "${company}" for "${slug}" not found in any topic CSV`,
    )
  }
  if (row.topic_type === 'referral_program' && !name.endsWith('Referral Program')) {
    failures.push(`${file}: "${slug}" name "${row.name}" does not end with "Referral Program"`)
  }
  return row.rss_feed_url ? 1 : 0
}
