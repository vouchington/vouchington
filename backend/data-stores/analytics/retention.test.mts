import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanupLocalAnalyticsRetention } from './retention.mts'

describe('analytics retention', () => {
  let testDir: string

  beforeEach(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-retention-'))
  })

  afterEach(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true })
  })

  it('deletes old 90-day table files and keeps cutoff-date files', async () => {
    await writeJsonl('queue_jobs', '2026-01-01', [{ event: 'completed' }])
    await writeJsonl('queue_jobs', '2026-01-02', [{ event: 'completed' }])
    await writeJsonl('rss_feed_processing', '2026-01-01', [{ event: 'fetched' }])

    const result = await cleanupLocalAnalyticsRetention({
      localDir: testDir,
      now: new Date('2026-04-02T00:00:00.000Z'),
    })

    expect(result.deletedFiles).toBe(2)
    await expectFileMissing('queue_jobs', '2026-01-01')
    await expectFileMissing('rss_feed_processing', '2026-01-01')
    await expectFileExists('queue_jobs', '2026-01-02')
  })

  it('deletes old 365-day web click and auth session files', async () => {
    await writeJsonl('web_click', '2025-01-01', [{ target_kind: 'item' }])
    await writeJsonl('auth_sessions', '2025-01-01', [{ event_type: 'created' }])

    const result = await cleanupLocalAnalyticsRetention({
      localDir: testDir,
      now: new Date('2026-01-02T00:00:00.000Z'),
    })

    expect(result.deletedFiles).toBe(2)
    await expectFileMissing('web_click', '2025-01-01')
    await expectFileMissing('auth_sessions', '2025-01-01')
  })

  it('compacts old web page view files to landing-page rows only', async () => {
    await writeJsonl('web_page_view', '2026-01-01', [
      { event_id: 'landing', page_kind: 'landing_page' },
      { event_id: 'topic', page_kind: 'topic' },
      'not-json',
    ])

    const result = await cleanupLocalAnalyticsRetention({
      localDir: testDir,
      now: new Date('2026-02-15T00:00:00.000Z'),
    })

    expect(result.compactedFiles).toBe(1)
    expect(result.removedRows).toBe(2)
    const rows = await readJsonl('web_page_view', '2026-01-01')
    expect(rows).toEqual([{ event_id: 'landing', page_kind: 'landing_page' }])
    await expect(fs.promises.readdir(path.join(testDir, 'web_page_view'))).resolves.toEqual([
      '2026-01-01.jsonl',
    ])
  })

  it('removes its staging directory when compaction fails', async () => {
    await writeJsonl('web_page_view', '2026-01-01', [
      { event_id: 'landing', page_kind: 'landing_page' },
      { event_id: 'topic', page_kind: 'topic' },
    ])
    const rename = vi.spyOn(fs.promises, 'rename').mockRejectedValueOnce(new Error('rename failed'))

    try {
      await expect(
        cleanupLocalAnalyticsRetention({
          localDir: testDir,
          now: new Date('2026-02-15T00:00:00.000Z'),
        }),
      ).rejects.toThrow('rename failed')
    } finally {
      rename.mockRestore()
    }

    await expect(fs.promises.readdir(path.join(testDir, 'web_page_view'))).resolves.toEqual([
      '2026-01-01.jsonl',
    ])
  })

  it('compacts partitions without using fs.promises.readFile', async () => {
    await writeJsonl('web_page_view', '2026-01-01', [
      { event_id: 'landing', page_kind: 'landing_page' },
      { event_id: 'topic', page_kind: 'topic' },
    ])
    const readFile = vi.spyOn(fs.promises, 'readFile')

    await cleanupLocalAnalyticsRetention({
      localDir: testDir,
      now: new Date('2026-02-15T00:00:00.000Z'),
    })

    expect(readFile).not.toHaveBeenCalled()
    readFile.mockRestore()
  })

  it('deletes web page view files older than one year', async () => {
    await writeJsonl('web_page_view', '2025-01-01', [{ page_kind: 'landing_page' }])

    const result = await cleanupLocalAnalyticsRetention({
      localDir: testDir,
      now: new Date('2026-01-02T00:00:00.000Z'),
    })

    expect(result.deletedFiles).toBe(1)
    await expectFileMissing('web_page_view', '2025-01-01')
  })

  it('keeps recent web page view files unchanged', async () => {
    await writeJsonl('web_page_view', '2026-01-20', [{ page_kind: 'topic' }])

    const result = await cleanupLocalAnalyticsRetention({
      localDir: testDir,
      now: new Date('2026-02-01T00:00:00.000Z'),
    })

    expect(result).toEqual({ deletedFiles: 0, compactedFiles: 0, removedRows: 0 })
    expect(await readJsonl('web_page_view', '2026-01-20')).toEqual([{ page_kind: 'topic' }])
  })

  it('deletes compacted web page view files with no landing-page rows', async () => {
    await writeJsonl('web_page_view', '2026-01-01', [
      { event_id: 'topic', page_kind: 'topic' },
      { event_id: 'community', page_kind: 'community' },
    ])

    const result = await cleanupLocalAnalyticsRetention({
      localDir: testDir,
      now: new Date('2026-02-15T00:00:00.000Z'),
    })

    expect(result).toEqual({ deletedFiles: 1, compactedFiles: 0, removedRows: 2 })
    await expectFileMissing('web_page_view', '2026-01-01')
  })

  it('ignores invalid filenames, non-jsonl files, and unknown tables', async () => {
    await writeJsonl('queue_jobs', 'not-a-date', [{ event: 'completed' }])
    await fs.promises.writeFile(path.join(testDir, 'queue_jobs', '2025-01-01.txt'), 'x')
    await writeJsonl('unknown_table', '2025-01-01', [{ value: true }])

    const result = await cleanupLocalAnalyticsRetention({
      localDir: testDir,
      now: new Date('2026-01-02T00:00:00.000Z'),
    })

    expect(result.deletedFiles).toBe(0)
    await expectFileExists('queue_jobs', 'not-a-date')
    await expectFileExists('unknown_table', '2025-01-01')
  })

  async function writeJsonl(table: string, date: string, rows: unknown[]) {
    const dir = path.join(testDir, table)
    await fs.promises.mkdir(dir, { recursive: true })
    const lines = rows.map(row => (typeof row === 'string' ? row : JSON.stringify(row)))
    await fs.promises.writeFile(path.join(dir, `${date}.jsonl`), `${lines.join('\n')}\n`)
  }

  async function readJsonl(table: string, date: string) {
    const text = await fs.promises.readFile(path.join(testDir, table, `${date}.jsonl`), 'utf8')
    const rows: unknown[] = []
    for (const line of text.split('\n')) {
      if (line) rows.push(JSON.parse(line))
    }
    return rows
  }

  async function expectFileExists(table: string, date: string) {
    await expect(
      fs.promises.access(path.join(testDir, table, `${date}.jsonl`)),
    ).resolves.toBeUndefined()
  }

  async function expectFileMissing(table: string, date: string) {
    await expect(
      fs.promises.access(path.join(testDir, table, `${date}.jsonl`)),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    })
  }
})
