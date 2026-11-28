import { describe, it, expect, afterAll, beforeAll } from 'vitest'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { flush } from '@data-stores/analytics/backend-local'
import { queryTestAnalyticsVoteDrift } from '@voucha/test-helpers/data-stores/analytics/queries'
import { trackVoteDrift } from './db.mts'

describe('trackVoteDrift', () => {
  let testDir: string

  beforeAll(async () => {
    testDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'analytics-vote-drift-test-'))
    process.env.ANALYTICS_LOCAL_DIR = testDir
    process.env.ANALYTICS_BACKEND = 'local'
  })

  afterAll(async () => {
    await fs.promises.rm(testDir, { recursive: true, force: true })
  })

  it('records a vote-drift row with the sampled entity id', async () => {
    const entityTable = `drift-${crypto.randomUUID()}`
    trackVoteDrift({
      entityTable,
      sampled: 500,
      inspected: 502,
      capped: 2,
      drifted: 3,
      sampleEntityId: 'post-42',
    })
    await flush()

    const rows = await queryTestAnalyticsVoteDrift(entityTable)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(Number(row.sampled)).toBe(500)
    expect(Number(row.drifted)).toBe(3)
    expect(row.sample_entity_id).toBe('post-42')
    expect(row.inspected).toBe(502)
    expect(row.capped).toBe(2)
  })

  it('records a vote-drift row without a sampled entity id', async () => {
    const entityTable = `drift-${crypto.randomUUID()}`
    trackVoteDrift({ entityTable, sampled: 10, inspected: 10, capped: 0, drifted: 0 })
    await flush()

    const rows = await queryTestAnalyticsVoteDrift(entityTable)
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(Number(row.sampled)).toBe(10)
    expect(row.sample_entity_id ?? null).toBeNull()
  })
})
