/* eslint-disable no-await-in-loop -- retention intentionally processes one partition at a time */
import fs from 'node:fs'
import { createInterface } from 'node:readline'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { ANALYTICS_TABLES, type AnalyticsTableName } from './tables.mts'

const DAY_MS = 24 * 60 * 60 * 1000
const DATE_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/

const WHOLE_FILE_RETENTION_DAYS = {
  crawler_requests: 90,
  valkey_cache_calls: 90,
  queue_jobs: 90,
  queue_workers: 90,
  rss_feed_processing: 90,
  ai_calls: 90,
  web_click: 365,
  auth_sessions: 365,
  contribution_admission: 90,
  pg_query_timing: 90,
  pg_pool_stats: 90,
  pg_vote_drift: 90,
} satisfies Record<Exclude<AnalyticsTableName, 'web_page_view'>, number>

export interface AnalyticsRetentionResult {
  deletedFiles: number
  compactedFiles: number
  removedRows: number
}

export async function cleanupLocalAnalyticsRetention(options?: {
  now?: Date
  localDir?: string
}): Promise<AnalyticsRetentionResult> {
  const now = options?.now ?? new Date()
  const localDir = options?.localDir ?? process.env.ANALYTICS_LOCAL_DIR ?? './tmp/analytics'

  if (!(await pathExists(localDir))) return emptyResult()

  let result = emptyResult()
  for (const table of ANALYTICS_TABLES) {
    const tableDir = path.join(localDir, table)
    if (!(await pathExists(tableDir))) continue
    const tableResult =
      table === 'web_page_view'
        ? await cleanupWebPageView(tableDir, now)
        : await cleanupWholeFiles(tableDir, now, WHOLE_FILE_RETENTION_DAYS[table])
    result = mergeResults([result, tableResult])
  }

  return result
}

async function cleanupWholeFiles(tableDir: string, now: Date, retentionDays: number) {
  const cutoffDate = getCutoffDate(now, retentionDays)
  const entries = await fs.promises.readdir(tableDir, { withFileTypes: true })
  const deletedFiles: string[] = []
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const fileDate = getDateFromFileName(entry.name)
    if (fileDate && fileDate < cutoffDate) {
      deletedFiles.push(path.join(tableDir, entry.name))
    }
  }

  for (const filePath of deletedFiles) await fs.promises.unlink(filePath)

  return { deletedFiles: deletedFiles.length, compactedFiles: 0, removedRows: 0 }
}

async function cleanupWebPageView(tableDir: string, now: Date) {
  const cutoff30 = getCutoffDate(now, 30)
  const cutoff365 = getCutoffDate(now, 365)
  const entries = await fs.promises.readdir(tableDir, { withFileTypes: true })

  let result = emptyResult()
  for (const entry of entries) {
    if (!entry.isFile()) continue
    const fileDate = getDateFromFileName(entry.name)
    if (!fileDate) continue

    const filePath = path.join(tableDir, entry.name)
    const fileResult =
      fileDate < cutoff365
        ? (await fs.promises.unlink(filePath),
          { deletedFiles: 1, compactedFiles: 0, removedRows: 0 })
        : fileDate < cutoff30
          ? await compactWebPageViewFile(filePath)
          : emptyResult()
    result = mergeResults([result, fileResult])
  }

  return result
}

async function compactWebPageViewFile(filePath: string): Promise<AnalyticsRetentionResult> {
  await using tempDir = await fs.promises.mkdtempDisposable(`${filePath}.retention-`)
  const tempPath = path.join(tempDir.path, 'compacted.jsonl')
  const output = fs.createWriteStream(tempPath, { encoding: 'utf8', mode: 0o600 })
  let removedRows = 0
  let keptRows = 0
  try {
    await pipeline(
      Readable.from(
        (async function* () {
          const input = fs.createReadStream(filePath, { encoding: 'utf8' })
          const lines = createInterface({ input, crlfDelay: Infinity })
          for await (const line of lines) {
            if (!line) continue
            try {
              const record = JSON.parse(line) as { page_kind?: unknown }
              if (record.page_kind === 'landing_page') {
                keptRows += 1
                yield `${line}\n`
                continue
              }
            } catch {
              // Invalid JSON rows are removed alongside non-landing-page rows.
            }
            removedRows += 1
          }
        })(),
      ),
      output,
    )

    if (removedRows === 0) return emptyResult()
    if (keptRows === 0) {
      await fs.promises.unlink(filePath)
      return { deletedFiles: 1, compactedFiles: 0, removedRows }
    }

    await fs.promises.rename(tempPath, filePath)
    return { deletedFiles: 0, compactedFiles: 1, removedRows }
  } finally {
    output.destroy()
  }
}

function emptyResult(): AnalyticsRetentionResult {
  return { deletedFiles: 0, compactedFiles: 0, removedRows: 0 }
}

function mergeResults(results: AnalyticsRetentionResult[]): AnalyticsRetentionResult {
  return results.reduce<AnalyticsRetentionResult>(
    (total, result) => ({
      deletedFiles: total.deletedFiles + result.deletedFiles,
      compactedFiles: total.compactedFiles + result.compactedFiles,
      removedRows: total.removedRows + result.removedRows,
    }),
    emptyResult(),
  )
}

function getCutoffDate(now: Date, retentionDays: number): string {
  return new Date(now.getTime() - retentionDays * DAY_MS).toISOString().slice(0, 10)
}

function getDateFromFileName(fileName: string): string | undefined {
  const match = DATE_FILE_RE.exec(fileName)
  return match?.[1]
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.promises.access(filePath)
    return true
  } catch {
    return false
  }
}
