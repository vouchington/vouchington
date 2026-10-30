import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsvRows } from '@modules/csv'
import { readSeedCsvRows } from '@services/admin-imports/seed-csvs'
import {
  appendInvalidRows,
  appendTopicFileFailures,
  type TopicRow,
} from './validate-seed-topic-csvs/rows.mts'

// Shipped seed/*-topics.csv policy for the static backend gate. Not a Vitest root.
const SEED_DIR = join(import.meta.dirname, '..', '..', 'seed')

function tokens(value: string | undefined): string[] {
  if (!value?.trim()) return []
  return value.split('|').flatMap(token => (token.trim() ? [token.trim()] : []))
}

function readTopicFiles(): Array<{ file: string; rows: TopicRow[] }> {
  return readdirSync(SEED_DIR)
    .filter(file => file.endsWith('-topics.csv'))
    .toSorted()
    .map(file => ({ file, rows: parseCsvRows(readFileSync(join(SEED_DIR, file), 'utf8')) }))
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
  feedCount += appendTopicFileFailures(
    failures,
    file,
    rows,
    globalSlugs,
    slugToType,
    slugToFile,
    referralSeen,
  )
}
if (totalRows < 300) failures.push(`expected at least 300 topic rows, found ${totalRows}`)
if (feedCount < 70) failures.push(`expected at least 70 rss_feed_url rows, found ${feedCount}`)

const shippedRows = readSeedCsvRows()
appendInvalidRows(failures, shippedRows, 'catalog')
const knownSlugs = new Set(shippedRows.flatMap(row => (row.slug?.trim() ? [row.slug.trim()] : [])))
for (const row of shippedRows) {
  const slug = row.slug?.trim() || 'row'
  for (const parent of tokens(row.parent_slugs)) {
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
