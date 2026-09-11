import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsvRows } from '@modules/csv'

const SEED_DIR = join(import.meta.dirname, '..', '..', 'seed')
const COLUMNS = [
  'name',
  'slug',
  'topic_type',
  'aliases',
  'parent_slugs',
  'extensions',
  'rss_feed_url',
  'rss_feed_title',
  'notes',
] as const

type Row = Record<string, string>

function escapeField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function serializeCsv(rows: Row[]): string {
  const header = COLUMNS.join(',')
  const lines = rows.map(row => COLUMNS.map(col => escapeField(row[col] ?? '')).join(','))
  return `${[header, ...lines].join('\n')}\n`
}

function unionPipeList(...lists: string[]): string {
  const items = new Set<string>()
  for (const list of lists) {
    for (const item of list.split('|').flatMap(s => (s.trim() ? [s.trim()] : []))) {
      items.add(item)
    }
  }
  return [...items].join('|')
}

function mergeOrgFeed(orgRow: Row, feedRow: Row): Row {
  return {
    name: feedRow.name?.trim() || orgRow.name?.trim() || '',
    slug: orgRow.slug?.trim() || '',
    topic_type: 'rss_feed',
    aliases: unionPipeList(orgRow.aliases ?? '', feedRow.aliases ?? ''),
    parent_slugs: orgRow.parent_slugs?.trim() || '',
    extensions: unionPipeList(orgRow.extensions ?? '', feedRow.extensions ?? ''),
    rss_feed_url: feedRow.rss_feed_url?.trim() || '',
    rss_feed_title: feedRow.rss_feed_title?.trim() || '',
    notes: feedRow.notes?.trim() || orgRow.notes?.trim() || '',
  }
}

function main() {
  const csvFiles = readdirSync(SEED_DIR)
    .filter(f => f.endsWith('-topics.csv'))
    .toSorted()

  // Pass 1: collect all rows globally to build the org→feed merge map
  const allRows: { file: string; row: Row }[] = []
  for (const file of csvFiles) {
    const content = readFileSync(join(SEED_DIR, file), 'utf8')
    const rows = parseCsvRows(content)
    for (const row of rows) {
      allRows.push({ file, row })
    }
  }

  const orgBySlug = new Map<string, Row>()
  for (const { row } of allRows) {
    if (row.topic_type?.trim() === 'organization') {
      orgBySlug.set(row.slug?.trim() ?? '', row)
    }
  }

  // Build merge map: org slug → merged row (only single-parent rss_feeds whose parent is an org)
  const mergeMap = new Map<string, Row>()
  const feedSlugsToRemove = new Set<string>()
  for (const { row } of allRows) {
    if (row.topic_type?.trim() !== 'rss_feed') continue
    const parent = row.parent_slugs?.trim() ?? ''
    if (!parent || parent.includes('|')) continue
    const orgRow = orgBySlug.get(parent)
    if (!orgRow) continue
    if (!orgRow.parent_slugs?.trim()) {
      console.log(
        `  skipping "${parent}": org has no parent_slugs — merged rss_feed would be orphaned`,
      )
      continue
    }
    mergeMap.set(parent, mergeOrgFeed(orgRow, row))
    feedSlugsToRemove.add(row.slug?.trim() ?? '')
  }

  console.log(`Found ${mergeMap.size} org/feed pairs to consolidate.`)

  const BASE_COLUMNS = new Set(COLUMNS)
  let mergesApplied = 0
  let rowsRemoved = 0

  // Pass 2: rewrite each file
  for (const file of csvFiles) {
    const content = readFileSync(join(SEED_DIR, file), 'utf8')
    const rows = parseCsvRows(content)
    const extraColumns = rows[0]
      ? Object.keys(rows[0]).filter(k => !(BASE_COLUMNS as Set<string>).has(k))
      : []
    if (extraColumns.length > 0) {
      console.log(`  ${file}: skipped (extra columns: ${extraColumns.join(', ')})`)
      continue
    }
    const newRows: Row[] = []

    for (const row of rows) {
      const slug = row.slug?.trim() ?? ''
      const tt = row.topic_type?.trim()

      if (tt === 'organization' && mergeMap.has(slug)) {
        newRows.push(mergeMap.get(slug)!)
        mergesApplied++
        continue
      }

      if (tt === 'rss_feed' && feedSlugsToRemove.has(slug)) {
        rowsRemoved++
        continue
      }

      newRows.push(row)
    }

    writeFileSync(join(SEED_DIR, file), serializeCsv(newRows), 'utf8')
    console.log(`  ${file}: ${rows.length} → ${newRows.length} rows`)
  }

  console.log(
    `\nDone: ${mergesApplied} org rows converted to rss_feed, ${rowsRemoved} redundant feed rows removed.`,
  )
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exit(1)
}
