import { describe, expect, it, onTestFinished } from 'vitest'
import { useCopyrightOperationalCursorReservation } from '@voucha/test-helpers/copyright-operational-cursor-reservation'
import { readCopyrightOrphanTokenCursor } from '@voucha/test-helpers/copyright-orphan-token-cursor'
import {
  positionCopyrightOperationalCursor,
  readCopyrightOperationalRow,
} from '@voucha/test-helpers/copyright-operational-retention'
import { seedCopyrightThreadTokenAtForTest } from '@voucha/test-helpers/copyright-thread-retention'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { sweepCopyrightOperationalRetention } from './operational-retention.mts'

describe('copyright orphan thread token retention', () => {
  useCopyrightOperationalCursorReservation()

  it('retains a young orphan token until its UUIDv7 grace passes', async () => {
    const now = new Date()
    const oldId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    })
    const youngId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
    })
    await positionCopyrightOperationalCursor('orphan_email_thread_tokens', oldId, youngId)
    await expect(
      sweepCopyrightOperationalRetention('orphan_email_thread_tokens', {
        now,
        retentionDays: 0,
        batchSize: 10,
        maxBatches: 1,
        recordIds: [oldId, youngId],
      }),
    ).resolves.toMatchObject({ scanned: 2, deleted: 1 })
    expect(await readCopyrightOperationalRow('email_thread_tokens', oldId)).toBe(false)
    expect(await readCopyrightOperationalRow('email_thread_tokens', youngId)).toBe(true)
  })

  it('ends the run with its committed cursor when token deletion loses a named FK race', async () => {
    const now = new Date()
    const firstId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
    })
    const secondId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    })
    await positionCopyrightOperationalCursor('orphan_email_thread_tokens', firstId, secondId)
    const options = {
      now,
      retentionDays: 0,
      batchSize: 1,
      maxBatches: 1,
      recordIds: [firstId, secondId],
    }
    expect(await sweepCopyrightOperationalRetention('orphan_email_thread_tokens', options)).toEqual(
      { scanned: 1, deleted: 1, hasMore: true },
    )
    const cursor = await readCopyrightOrphanTokenCursor()
    const failure = Object.assign(new Error('concurrent token reference'), {
      code: '23001',
      constraint: 'fk_copyright_notice_email_thread_references__token',
    })
    let reachedDelete = false
    const restore = runBeforePostgresStatementForTest(
      '/* deleteOrphanCopyrightEmailThreadTokens */',
      async () => {
        reachedDelete = true
        throw failure
      },
    )
    onTestFinished(restore)
    try {
      expect(
        await sweepCopyrightOperationalRetention('orphan_email_thread_tokens', options),
      ).toEqual({ scanned: 0, deleted: 0, hasMore: false })
    } finally {
      restore()
    }
    expect(reachedDelete).toBe(true)
    expect(await readCopyrightOrphanTokenCursor()).toEqual(cursor)
    expect(await readCopyrightOperationalRow('email_thread_tokens', firstId)).toBe(false)
    expect(await readCopyrightOperationalRow('email_thread_tokens', secondId)).toBe(true)
  })

  it('surfaces an unrelated FK error without advancing the token cursor', async () => {
    const now = new Date()
    const tokenId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    })
    await positionCopyrightOperationalCursor('orphan_email_thread_tokens', tokenId)
    const cursor = await readCopyrightOrphanTokenCursor()
    const failure = Object.assign(new Error('unrelated FK failure'), {
      code: '23503',
      constraint: 'fk_unrelated',
    })
    const restore = runBeforePostgresStatementForTest(
      '/* deleteOrphanCopyrightEmailThreadTokens */',
      async () => {
        throw failure
      },
    )
    onTestFinished(restore)
    try {
      await expect(
        sweepCopyrightOperationalRetention('orphan_email_thread_tokens', {
          now,
          retentionDays: 0,
          batchSize: 1,
          maxBatches: 1,
          recordIds: [tokenId],
        }),
      ).rejects.toBe(failure)
    } finally {
      restore()
    }
    expect(await readCopyrightOrphanTokenCursor()).toEqual(cursor)
    expect(await readCopyrightOperationalRow('email_thread_tokens', tokenId)).toBe(true)
  })
})
