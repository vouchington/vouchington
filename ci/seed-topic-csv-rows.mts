import { isSlug } from '@ts-shared/utils/slugs'
import { topicTypes } from '../backend/types/entities/topic.mts'

import { appendFeedFieldFailures } from './seed-topic-csv-feed.mts'

const VALID_TOPIC_TYPES = new Set(Object.keys(topicTypes))
const VALID_EXTENSIONS = new Set(['spending_category', 'retailer'])

type TopicRow = Record<string, string>

const REQUIRED_COLUMNS = ['name', 'slug', 'topic_type'] as const

export function splitTopicTokens(value: string | undefined): string[] {
  if (!value?.trim()) return []
  return value.split('|').flatMap(token => {
    const trimmed = token.trim()
    return trimmed ? [trimmed] : []
  })
}

export function appendTopicFileFailures(
  failures: string[],
  file: string,
  rows: readonly TopicRow[],
  globalSlugs: ReadonlySet<string>,
  slugToType: ReadonlyMap<string, string>,
  slugToFile: Map<string, string>,
  referralSeen: Map<string, string>,
): number {
  const headerRow = rows[0]
  if (!headerRow) {
    failures.push(`${file}: has no rows`)
    return 0
  }
  const columns = Object.keys(headerRow)
  for (const required of REQUIRED_COLUMNS) {
    if (!columns.includes(required)) failures.push(`${file}: missing column ${required}`)
  }

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
  return feedCount
}

function appendTopicRowFailures(
  failures: string[],
  file: string,
  row: TopicRow,
  globalSlugs: ReadonlySet<string>,
  slugToType: ReadonlyMap<string, string>,
  slugToFile: Map<string, string>,
  referralSeen: Map<string, string>,
  seenInFile: Set<string>,
): number {
  const slug = row.slug ?? ''
  const name = row.name?.trim() ?? ''
  const topicType = row.topic_type ?? ''
  if (!isSlug(slug)) failures.push(`${file}: slug "${slug}" is invalid`)
  if (seenInFile.has(slug)) failures.push(`${file}: duplicate slug "${slug}"`)
  seenInFile.add(slug)
  if (name.length < 1 || name.length > 200) {
    failures.push(`${file}: slug "${slug}" name length ${name.length}`)
  }
  if (!VALID_TOPIC_TYPES.has(topicType)) {
    failures.push(`${file}: slug "${slug}" topic_type "${topicType}" is invalid`)
  }
  appendParentFailures(failures, file, row, slug, topicType, globalSlugs, slugToType)
  for (const extension of splitTopicTokens(row.extensions)) {
    if (!VALID_EXTENSIONS.has(extension)) {
      failures.push(`${file}: slug "${slug}" extension "${extension}" is invalid`)
    }
  }
  appendFeedFieldFailures(failures, file, row, slug, name)
  appendIdentityFailures(failures, file, row, slug, name, globalSlugs, slugToFile, referralSeen)
  return row.rss_feed_url ? 1 : 0
}

function appendParentFailures(
  failures: string[],
  file: string,
  row: TopicRow,
  slug: string,
  topicType: string,
  globalSlugs: ReadonlySet<string>,
  slugToType: ReadonlyMap<string, string>,
): void {
  for (const parent of splitTopicTokens(row.parent_slugs)) {
    if (!globalSlugs.has(parent)) {
      failures.push(`${file}: slug "${slug}" parent_slugs -> "${parent}"`)
    }
    if (topicType === 'rss_feed' && slugToType.get(parent) === 'rss_feed') {
      failures.push(`${file}: "${slug}" parent "${parent}" is also rss_feed`)
    }
  }
}

function appendIdentityFailures(
  failures: string[],
  file: string,
  row: TopicRow,
  slug: string,
  name: string,
  globalSlugs: ReadonlySet<string>,
  slugToFile: Map<string, string>,
  referralSeen: Map<string, string>,
): void {
  const existing = slugToFile.get(slug)
  if (existing) failures.push(`"${slug}" in both ${existing} and ${file}`)
  else slugToFile.set(slug, file)
  for (const alias of splitTopicTokens(row.aliases)) {
    const lower = alias.toLowerCase()
    if (globalSlugs.has(lower) && lower !== slug) {
      failures.push(`${file}: alias "${alias}" of "${slug}" collides with slug "${lower}"`)
    }
  }
  const referral = row.referral_validation_slug?.trim()
  if (referral) {
    const prior = referralSeen.get(referral)
    if (prior) {
      failures.push(`referral_validation_slug "${referral}" in both ${prior} and ${file}`)
    } else referralSeen.set(referral, file)
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
}
