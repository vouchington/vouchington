import { afterEach, describe, expect, it, vi } from 'vitest'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { randomInt, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { v7 as uuidv7 } from 'uuid'
import { getMinUUIDv7ForDate } from '@modules/utils'
import {
  createTestUserWithId,
  getTestVoteIntegrityFlagTypesByPostId,
  insertTestPost,
  insertTestPostVote,
} from '@voucha/test-helpers'
import type { ProcessVoteIntegrityCheckData } from '@queues/vote-aggregation/enqueues/types-vote-integrity'
import {
  IP_CORRELATION_THRESHOLD,
  IP_CORRELATION_WINDOW_MINUTES,
} from '@services/vote-integrity/config'
import { processVoteIntegrityCheck } from './vote-integrity.mts'

const AS_OF_MS = Date.UTC(2026, 1, 1, 0, 2)

describe('vote integrity worker failures', () => {
  afterEach(() => vi.useRealTimers())

  it('creates an IP correlation flag from votes at the time-window boundary', async () => {
    const asOfMs = AS_OF_MS + randomInt(0, 58 * 60_000)
    const creatorId = uuidv7({ msecs: Date.UTC(2025, 10, 30) })
    await createTestUserWithId(creatorId, `vote-worker-creator-${randomUUID().slice(0, 8)}`)
    const postId = await insertTestPost({
      createdById: creatorId,
      createdAt: new Date(Date.UTC(2025, 11, 1)),
      slug: `vote-worker-${randomUUID()}`,
      title: 'Vote worker boundary',
      markdown: 'body',
    })
    const sharedIp = '203.0.113.27'
    const cutoff = asOfMs - IP_CORRELATION_WINDOW_MINUTES * 60_000
    let voterId = ''
    for (let index = 0; index < IP_CORRELATION_THRESHOLD; index++) {
      voterId = uuidv7({ msecs: asOfMs - 86_400_000, seq: index })
      await createTestUserWithId(voterId, `vote-worker-voter-${randomUUID().slice(0, 8)}`)
      await insertTestPostVote(
        postId,
        voterId,
        sharedIp,
        1,
        index === 0 ? getMinUUIDv7ForDate(new Date(cutoff)) : uuidv7({ msecs: cutoff, seq: index }),
      )
    }

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(asOfMs)
    await processVoteIntegrityCheck({
      entityType: 'post',
      entityId: postId,
      userId: voterId,
      ipAddress: sharedIp,
      score: 1,
    })

    assert.ok(
      (await getTestVoteIntegrityFlagTypesByPostId(postId)).includes('ip_correlation'),
      `asOf=${new Date(asOfMs).toISOString()}`,
    )
  })

  it('reports and rethrows the same database error so the queue can retry', async () => {
    const data: ProcessVoteIntegrityCheckData = {
      entityType: 'post',
      entityId: 'not-a-uuid',
      userId: randomUUID(),
      ipAddress: null,
      score: 1,
    }

    const failure: unknown = await processVoteIntegrityCheck(data).catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject({ code: '22P02' })
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === failure)).toBe(
      true,
    )
  })
})
