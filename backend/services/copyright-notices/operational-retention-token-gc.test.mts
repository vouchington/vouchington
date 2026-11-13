import { describe, expect, it, onTestFinished } from 'vitest'
import { readCopyrightOrphanTokenCursor } from '@voucha/test-helpers/copyright-orphan-token-cursor'
import {
  createCopyrightOperationalScope,
  readCopyrightOperationalRow,
} from '@voucha/test-helpers/copyright-operational-retention'
import {
  observeCopyrightPageCheckoutRestoration,
  seedCopyrightThreadTokenAtForTest,
} from '@voucha/test-helpers/copyright-thread-retention'
import { runBeforePostgresStatementForTest } from '@voucha/test-helpers/injected-failures'
import { sweepCopyrightOperationalRetention } from './operational-retention.mts'

describe('copyright orphan thread token retention', () => {
  it('retains a young orphan token until its UUIDv7 grace passes', async () => {
    const now = new Date()
    const oldId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    })
    const youngId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(now.getTime() - 30 * 60 * 1000),
    })
    const scope = createCopyrightOperationalScope([oldId, youngId])
    await expect(
      sweepCopyrightOperationalRetention('orphan_email_thread_tokens', {
        now,
        retentionDays: 0,
        batchSize: 10,
        maxBatches: 1,
        scope,
      }),
    ).resolves.toMatchObject({ scanned: 2, deleted: 1 })
    expect(await readCopyrightOperationalRow('email_thread_tokens', oldId)).toBe(false)
    expect(await readCopyrightOperationalRow('email_thread_tokens', youngId)).toBe(true)
  })

  it('never scans an equally eligible excluded token or falls through an empty owned set', async () => {
    const now = new Date()
    const createdAt = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const owned = await seedCopyrightThreadTokenAtForTest({ createdAt })
    const excluded = await seedCopyrightThreadTokenAtForTest({ createdAt })
    const options = { now, retentionDays: 0, batchSize: 10, maxBatches: 1 }
    const empty = createCopyrightOperationalScope([])
    const before = structuredClone(empty.cursor)
    expect(
      await sweepCopyrightOperationalRetention('orphan_email_thread_tokens', {
        ...options,
        scope: empty,
      }),
    ).toEqual({ scanned: 0, deleted: 0, hasMore: false })
    expect(empty.cursor).toEqual(before)
    expect(await readCopyrightOperationalRow('email_thread_tokens', owned)).toBe(true)
    expect(
      await sweepCopyrightOperationalRetention('orphan_email_thread_tokens', {
        ...options,
        scope: createCopyrightOperationalScope([owned]),
      }),
    ).toEqual({ scanned: 1, deleted: 1, hasMore: false })
    expect(await readCopyrightOperationalRow('email_thread_tokens', owned)).toBe(false)
    expect(await readCopyrightOperationalRow('email_thread_tokens', excluded)).toBe(true)
  })

  it('observes reused owned pages once and restores subsequent client queries', async () => {
    const now = new Date()
    const createdAt = new Date(now.getTime() - 2 * 60 * 60 * 1000)
    const first = await seedCopyrightThreadTokenAtForTest({ createdAt })
    const second = await seedCopyrightThreadTokenAtForTest({ createdAt })
    const excluded = await seedCopyrightThreadTokenAtForTest({ createdAt })
    const observed = await observeCopyrightPageCheckoutRestoration(
      () =>
        sweepCopyrightOperationalRetention('orphan_email_thread_tokens', {
          now,
          retentionDays: 0,
          batchSize: 1,
          maxBatches: 3,
          scope: createCopyrightOperationalScope([first, second]),
        }),
      excluded,
    )
    expect(observed).toMatchObject({
      result: { scanned: 2, deleted: 2, hasMore: false },
      scans: 3,
      reused: true,
      restored: true,
      callbacksAfterTeardown: 0,
      token: { id: excluded },
    })
    expect(await readCopyrightOperationalRow('email_thread_tokens', first)).toBe(false)
    expect(await readCopyrightOperationalRow('email_thread_tokens', second)).toBe(false)
  })

  it.each(['23001', '40P01', '40001'])(
    'ends the run with its committed cursor when token deletion loses a %s race',
    async code => {
      const now = new Date()
      const firstId = await seedCopyrightThreadTokenAtForTest({
        createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000),
      })
      const secondId = await seedCopyrightThreadTokenAtForTest({
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      })
      const scope = createCopyrightOperationalScope([firstId, secondId])
      const options = {
        now,
        retentionDays: 0,
        batchSize: 1,
        maxBatches: 1,
        scope,
      }
      expect(
        await sweepCopyrightOperationalRetention('orphan_email_thread_tokens', options),
      ).toEqual({ scanned: 1, deleted: 1, hasMore: true })
      const cursor = await readCopyrightOrphanTokenCursor(scope)
      const completeProgress = structuredClone(scope.cursor)
      const failure = Object.assign(new Error('concurrent token reference'), {
        code,
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
      expect(await readCopyrightOrphanTokenCursor(scope)).toEqual(cursor)
      expect(scope.cursor).toEqual(completeProgress)
      expect(await readCopyrightOperationalRow('email_thread_tokens', firstId)).toBe(false)
      expect(await readCopyrightOperationalRow('email_thread_tokens', secondId)).toBe(true)
    },
  )

  it('surfaces an unrelated FK error without advancing the token cursor', async () => {
    const now = new Date()
    const tokenId = await seedCopyrightThreadTokenAtForTest({
      createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    })
    const scope = createCopyrightOperationalScope([tokenId])
    const cursor = await readCopyrightOrphanTokenCursor(scope)
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
          scope,
        }),
      ).rejects.toBe(failure)
    } finally {
      restore()
    }
    expect(await readCopyrightOrphanTokenCursor(scope)).toEqual(cursor)
    expect(await readCopyrightOperationalRow('email_thread_tokens', tokenId)).toBe(true)
  })
})
