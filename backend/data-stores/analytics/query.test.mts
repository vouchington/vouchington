import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { flush, writeRecord } from './backend-local.mts'
import { closeConnection, query, refreshViews } from './query.mts'
import type { WebPageViewRecord } from './tables.mts'

describe('query lifecycle helpers', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-query-lifecycle-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true })
  })

  it('refreshViews and closeConnection are no-ops before any connection has been established', async () => {
    await expect(refreshViews()).resolves.toBeUndefined()
    await expect(closeConnection()).resolves.toBeUndefined()
  })

  it('refreshViews rebuilds the views so rows flushed after connect are queryable', async () => {
    const pageId = crypto.randomUUID()
    const eventId = crypto.randomUUID()
    const eventDate = '2024-08-01'
    const record: WebPageViewRecord = {
      event_id: eventId,
      event_date: eventDate,
      event_time: new Date('2024-08-01T00:00:00Z'),
      env: 'test',
      page_kind: 'landing_page',
      page_id: pageId,
      session_id: crypto.randomUUID(),
    }

    // Establishes the shared connection so refreshViews() below has something to refresh.
    await query('SELECT 1')

    writeRecord('web_page_view', record)
    await flush()
    await expect(refreshViews()).resolves.toBeUndefined()

    const rows = await query<{ event_id: string }>(
      `SELECT event_id FROM web_page_view WHERE page_id = $1`,
      [pageId],
    )
    expect(rows).toEqual([{ event_id: eventId }])
  })

  it('closeConnection tears down the shared connection and lets the next query create a fresh one', async () => {
    await expect(closeConnection()).resolves.toBeUndefined()

    const rows = await query<{ value: number }>('SELECT 1 AS value')
    expect(rows).toEqual([{ value: 1 }])
  })

  it('self-heals when a later file widens a populated table’s inferred column type', async () => {
    // web_page_view's first-ever row here has a UUID-shaped page_id, so DuckDB infers the column
    // as UUID and pins that type on the view it builds the moment the table is marked populated.
    const firstEventId = crypto.randomUUID()
    writeRecord('web_page_view', {
      event_id: firstEventId,
      event_date: '2024-09-01',
      event_time: new Date('2024-09-01T00:00:00Z'),
      env: 'test',
      page_kind: 'topic',
      page_id: crypto.randomUUID(),
      session_id: crypto.randomUUID(),
    })
    await flush()
    await expect(
      query<{ event_id: string }>(`SELECT event_id FROM web_page_view WHERE event_id = $1`, [
        firstEventId,
      ]),
    ).resolves.toEqual([{ event_id: firstEventId }])

    // A later, separately-partitioned file introduces a non-UUID page_id — without a rebuild the
    // pinned view throws "Contents of view were altered" on the very next query against the table,
    // and query()'s outer catch used to swallow that into a silent [].
    const secondEventId = crypto.randomUUID()
    const nonUuidPageId = `o'brien's "page"`
    writeRecord('web_page_view', {
      event_id: secondEventId,
      event_date: '2024-09-02',
      event_time: new Date('2024-09-02T00:00:00Z'),
      env: 'test',
      page_kind: 'landing_page',
      page_id: nonUuidPageId,
      session_id: crypto.randomUUID(),
    })
    await flush()

    const rows = await query<{ event_id: string }>(
      `SELECT event_id FROM web_page_view WHERE page_id = $1`,
      [nonUuidPageId],
    )
    expect(rows).toEqual([{ event_id: secondEventId }])

    // The first row must still be reachable after the rebuild — the fix must not lose data.
    await expect(
      query<{ event_id: string }>(`SELECT event_id FROM web_page_view WHERE event_id = $1`, [
        firstEventId,
      ]),
    ).resolves.toEqual([{ event_id: firstEventId }])
  })
})
