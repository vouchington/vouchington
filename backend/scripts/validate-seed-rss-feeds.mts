import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseCsvRows } from '@modules/csv'
import {
  type FeedEntry,
  probeUrlWithRetries,
  withConcurrency,
} from './validate-seed-rss-feeds/probe.mts'
import { printProbeReport } from './validate-seed-rss-feeds/report.mts'

const SEED_DIR = join(import.meta.dirname, '..', '..', 'seed')
const CONCURRENCY = 8

async function main() {
  const csvFiles = readdirSync(SEED_DIR)
    .filter(f => f.endsWith('-topics.csv'))
    .toSorted()

  const entries: FeedEntry[] = []
  for (const file of csvFiles) {
    const content = readFileSync(join(SEED_DIR, file), 'utf8')
    const rows = parseCsvRows(content)
    for (const row of rows) {
      if (row.topic_type?.trim() === 'rss_feed' && row.rss_feed_url?.trim()) {
        entries.push({ file, slug: row.slug?.trim() ?? '', url: row.rss_feed_url.trim() })
      }
    }
  }

  console.log(`Probing ${entries.length} feeds (concurrency ${CONCURRENCY})...\n`)
  const probeStart = Date.now()
  const results = await withConcurrency(
    entries.map(
      entry => () => probeUrlWithRetries(entry.url).then(result => ({ ...entry, result })),
    ),
    CONCURRENCY,
  )
  const elapsed = ((Date.now() - probeStart) / 1000).toFixed(1)
  const { permanent, transient } = printProbeReport(results, elapsed)

  if (permanent.length > 0 || transient.length > 0) {
    process.exit(1)
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
