import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsvRows } from '@modules/csv'
import { isHttpUrlWithoutFragment, isSlug } from '@modules/utils'
import { readSeedCsvRows } from '@services/admin-imports/seed-csvs'
import { validateTopicHeaders, validateTopicRows } from '@services/admin-imports/validate-topics'
import { topicTypes } from '@voucha/types/entities/topic'

// Shipped seed/*-topics.csv policy for the static backend gate. Not a Vitest root.
const SEED_DIR = join(import.meta.dirname, '..', '..', 'seed')
const VALID_TOPIC_TYPES = new Set(Object.keys(topicTypes))
const VALID_EXTENSIONS = new Set(['spending_category', 'retailer'])
const VALID_FEED_TYPES = new Set(['article', 'podcast', 'video', 'mixed'])

type TopicRow = Record<string, string>

function tokens(value: string | undefined): string[] {
  return value ? value.split('|').filter(Boolean) : []
}

function trimmedTokens(value: string | undefined): string[] {
  if (!value?.trim()) return []
  return value.split('|').flatMap(token => (token.trim() ? [token.trim()] : []))
}

function readTopicFiles(): Array<{ file: string; rows: TopicRow[] }> {
  return readdirSync(SEED_DIR)
    .filter(file => file.endsWith('-topics.csv'))
    .toSorted()
    .map(file => ({ file, rows: parseCsvRows(readFileSync(join(SEED_DIR, file), 'utf8')) }))
}

function appendInvalidRows(failures: string[], rows: TopicRow[], label: string) {
  for (const row of validateTopicRows(rows).rows) {
    if (row.valid) continue
    const slug = rows[row.row_index]?.slug
    failures.push(`${label} row ${row.row_index} (${slug}): ${row.errors.join(', ')}`)
  }
}

const failures: string[] = []
const files = readTopicFiles()
const globalSlugs = new Set<string>()
const slugToType = new Map<string, string>()
for (const { rows } of files) {
  for (const row of rows) {
    globalSlugs.add(row.slug)
    slugToType.set(row.slug, row.topic_type)
  }
}
if (files.length < 8) {
  failures.push(`expected at least 8 *-topics.csv files, found ${files.length}`)
}

const slugToFile = new Map<string, string>()
const referralSeen = new Map<string, string>()
let totalRows = 0
let feedCount = 0
for (const { file, rows } of files) {
  totalRows += rows.length
  const headerRow = rows[0]
  if (!headerRow) {
    failures.push(`${file}: has no rows`)
    continue
  }
  const columns = Object.keys(headerRow)
  for (const required of ['name', 'slug', 'topic_type']) {
    if (!columns.includes(required)) failures.push(`${file}: missing column ${required}`)
  }
  const unknown = validateTopicHeaders(columns)
  if (unknown.length > 0) failures.push(`${file}: unknown columns ${unknown.join(', ')}`)
  const seenInFile = new Set<string>()
  for (const row of rows) {
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
    if (row.rss_feed_url && !isHttpUrlWithoutFragment(row.rss_feed_url)) {
      failures.push(`${file}: slug "${slug}" rss_feed_url is invalid`)
    }
    if (Boolean(row.rss_feed_url) !== Boolean(row.rss_feed_title)) {
      failures.push(`${file}: slug "${slug}" rss_feed_url and rss_feed_title must be paired`)
    }
    if (row.topic_type !== 'rss_feed' && (row.rss_feed_url?.trim() || row.rss_feed_title?.trim())) {
      failures.push(`${file}: slug "${slug}" (type=${row.topic_type}) has an rss feed field`)
    }
    const existing = slugToFile.get(slug)
    if (existing) failures.push(`"${slug}" in both ${existing} and ${file}`)
    else slugToFile.set(slug, file)
    if (row.rss_feed_url) feedCount += 1
    for (const alias of tokens(row.aliases)) {
      const lower = alias.toLowerCase()
      if (globalSlugs.has(lower) && lower !== slug) {
        failures.push(`${file}: alias "${alias}" of "${slug}" collides with slug "${lower}"`)
      }
    }
    const referral = row.referral_validation_slug?.trim()
    if (referral) {
      const prior = referralSeen.get(referral)
      if (prior)
        failures.push(`referral_validation_slug "${referral}" in both ${prior} and ${file}`)
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
    if (row.topic_type === 'rss_feed') {
      if (!row.parent_slugs?.trim())
        failures.push(`${file}: "${slug}" rss_feed missing parent_slugs`)
      if (!row.rss_feed_url?.trim())
        failures.push(`${file}: "${slug}" rss_feed missing rss_feed_url`)
      if (!row.rss_feed_title?.trim()) {
        failures.push(`${file}: "${slug}" rss_feed missing rss_feed_title`)
      }
      if (name && /\(https?:\/\//.test(name)) {
        failures.push(`${file}: "${slug}" name "${name}" already contains a URL suffix`)
      }
    }
    const feedType = row.feed_type?.trim()
    if (feedType && row.topic_type !== 'rss_feed') {
      failures.push(
        `${file}: "${slug}" feed_type "${feedType}" set on non-rss_feed topic (type=${row.topic_type})`,
      )
    } else if (feedType && !VALID_FEED_TYPES.has(feedType)) {
      failures.push(
        `${file}: "${slug}" feed_type "${feedType}" is not one of ${[...VALID_FEED_TYPES].join(', ')}`,
      )
    }
  }
  appendInvalidRows(failures, rows, file)
}
if (totalRows < 300) failures.push(`expected at least 300 topic rows, found ${totalRows}`)
if (feedCount < 70) failures.push(`expected at least 70 rss_feed_url rows, found ${feedCount}`)

const shippedRows = readSeedCsvRows()
appendInvalidRows(failures, shippedRows, 'catalog')
const knownSlugs = new Set(shippedRows.flatMap(row => (row.slug?.trim() ? [row.slug.trim()] : [])))
for (const row of shippedRows) {
  const slug = row.slug?.trim() || 'row'
  for (const parent of trimmedTokens(row.parent_slugs)) {
    if (!knownSlugs.has(parent)) failures.push(`${slug}: parent_slugs -> "${parent}"`)
  }
  const company = row.referral_company_slug?.trim()
  if (company && !knownSlugs.has(company)) {
    failures.push(`${slug}: referral_company_slug -> "${company}"`)
  }
}
if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
// Importers keep database and Valkey handles open; a static check must not wait on them.
process.exit(0)
