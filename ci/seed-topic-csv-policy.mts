import { appendTopicFileFailures, splitTopicTokens } from './seed-topic-csv-rows.mts'

export type TopicCsvFile = {
  file: string
  rows: Record<string, string>[]
}

export type TopicCsvCatalog = {
  failures: string[]
  rowCount: number
  feedCount: number
}

export type TopicRowValidation = {
  row_index: number
  valid: boolean
  errors: readonly string[]
}

/** Shipped catalog minimums: 8 files, 300 rows, and 70 feeds. A larger catalog still passes. */
export function seedTopicCsvShapeFailures(
  fileCount: number,
  rowCount: number,
  feedCount: number,
): string[] {
  const failures: string[] = []
  if (fileCount < 8) {
    failures.push(`expected at least 8 *-topics.csv files, found ${fileCount}`)
  }
  if (rowCount < 300) {
    failures.push(`expected at least 300 topic rows, found ${rowCount}`)
  }
  if (feedCount < 70) {
    failures.push(`expected at least 70 rss_feed_url rows, found ${feedCount}`)
  }
  return failures
}

export function unknownTopicColumnFailures(file: string, unknown: readonly string[]): string[] {
  if (unknown.length === 0) return []
  return [`${file}: unknown columns ${unknown.join(', ')}`]
}

export function invalidTopicRowFailures(
  label: string,
  rows: readonly Record<string, string>[],
  results: readonly TopicRowValidation[],
): string[] {
  return results.flatMap(result =>
    result.valid
      ? []
      : [
          `${label} row ${result.row_index} (${rows[result.row_index]?.slug}): ${result.errors.join(', ')}`,
        ],
  )
}

export function seedTopicCsvCatalogFailures(files: readonly TopicCsvFile[]): TopicCsvCatalog {
  const failures: string[] = []
  const globalSlugs = new Set<string>()
  const slugToType = new Map<string, string>()
  for (const { rows } of files) {
    for (const row of rows) {
      globalSlugs.add(row.slug)
      slugToType.set(row.slug, row.topic_type)
    }
  }

  const slugToFile = new Map<string, string>()
  const referralSeen = new Map<string, string>()
  let rowCount = 0
  let feedCount = 0
  for (const { file, rows } of files) {
    rowCount += rows.length
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
  appendCatalogReferenceFailures(failures, files)
  return { failures, rowCount, feedCount }
}

function appendCatalogReferenceFailures(failures: string[], files: readonly TopicCsvFile[]): void {
  const rows = files.flatMap(file => file.rows)
  const knownSlugs = new Set(rows.flatMap(row => (row.slug?.trim() ? [row.slug.trim()] : [])))
  for (const row of rows) {
    const slug = row.slug?.trim() || 'row'
    for (const parent of splitTopicTokens(row.parent_slugs)) {
      if (!knownSlugs.has(parent)) failures.push(`${slug}: parent_slugs -> "${parent}"`)
    }
    const company = row.referral_company_slug?.trim()
    if (company && !knownSlugs.has(company)) {
      failures.push(`${slug}: referral_company_slug -> "${company}"`)
    }
  }
}
