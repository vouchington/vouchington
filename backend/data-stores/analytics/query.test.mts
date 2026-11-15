import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { flush, writeRecord } from './backend-local.mts'
import { closeConnection, query } from './query.mts'
import type { WebPageViewRecord } from './tables.mts'

describe('query lifecycle helpers', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-query-lifecycle-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await closeConnection()
    await fs.promises.rm(testDir, { recursive: true })
  })

  it('closeConnection is a no-op before any connection has been established', async () => {
    await expect(closeConnection()).resolves.toBeUndefined()
  })

  it('queries rows flushed after a connection was established', async () => {
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

    // Establish the shared connection before the new row is flushed.
    await query('SELECT 1')

    writeRecord('web_page_view', record)
    await flush()

    const rows = await query<{ event_id: string }>(
      `SELECT event_id FROM web_page_view WHERE page_id = $1`,
      [pageId],
    )
    expect(rows).toEqual([{ event_id: eventId }])
  })

  it('returns no rows when an analytics query is invalid', async () => {
    await expect(query('SELECT missing_column FROM web_page_view')).resolves.toEqual([])
  })

  it('closeConnection tears down the shared connection and lets the next query create a fresh one', async () => {
    await expect(closeConnection()).resolves.toBeUndefined()

    const rows = await query<{ value: number }>('SELECT 1 AS value')
    expect(rows).toEqual([{ value: 1 }])
  })

  it('preserves rows when a later file widens a populated table’s inferred column type', async () => {
    const firstEventId = crypto.randomUUID()
    const uuidPageId = crypto.randomUUID()
    writeRecord('web_page_view', {
      event_id: firstEventId,
      event_date: '2024-09-01',
      event_time: new Date('2024-09-01T00:00:00Z'),
      env: 'test',
      page_kind: 'topic',
      page_id: uuidPageId,
      session_id: crypto.randomUUID(),
    })
    await flush()

    type PageRow = { event_id: string; page_id: string; page_id_type: string }
    const selectRows = `SELECT event_id, page_id, typeof(page_id) AS page_id_type
      FROM web_page_view WHERE event_id IN ($1, $2) ORDER BY event_date`
    await expect(query<PageRow>(selectRows, [firstEventId, firstEventId])).resolves.toEqual([
      { event_id: firstEventId, page_id: uuidPageId, page_id_type: 'UUID' },
    ])

    // A separate partition widens the inferred page_id type. Both rows must remain readable,
    // whether DuckDB widens the view automatically or query() rebuilds it after a stale-view error.
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

    await expect(query<PageRow>(selectRows, [firstEventId, secondEventId])).resolves.toEqual([
      { event_id: firstEventId, page_id: uuidPageId, page_id_type: 'VARCHAR' },
      { event_id: secondEventId, page_id: nonUuidPageId, page_id_type: 'VARCHAR' },
    ])
  })
})
