import { describe, expect, it } from 'vitest'
import { sentryCaptureExceptionMock } from '../../../test-helpers/vitest.setup.sentry-mock.mts'
import { randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { v7 as uuidv7 } from 'uuid'
import {
  createTestUserWithId,
  getTestVoteIntegrityFlagTypesByPostId,
  insertTestPost,
} from '@voucha/test-helpers'
import type { ProcessVoteIntegrityCheckData } from '@queues/vote-aggregation/enqueues/types-vote-integrity'
import {
  IP_CORRELATION_THRESHOLD,
  IP_CORRELATION_WINDOW_MINUTES,
} from '@services/vote-integrity/config'
import { recordVoteIp } from '@services/vote-integrity/ip-window'
import { storeVoteIpEvidence } from '@services/elections-votes/vote-ip-evidence'
import { processVoteIntegrityCheck } from './vote-integrity.mts'

describe('vote integrity worker failures', () => {
  it('creates an IP correlation flag from short-lived ballot evidence', async () => {
    const asOfMs = Date.now()
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
    const voteId = uuidv7({ msecs: asOfMs })
    const insideWindow = asOfMs - (IP_CORRELATION_WINDOW_MINUTES - 1) * 60_000
    for (let index = 0; index < IP_CORRELATION_THRESHOLD - 1; index++) {
      await recordVoteIp(
        'post',
        postId,
        randomUUID(),
        sharedIp,
        new Date(insideWindow + index),
        new Date(asOfMs),
      )
    }
    await storeVoteIpEvidence(voteId, sharedIp)
    await processVoteIntegrityCheck({
      entityType: 'post',
      entityId: postId,
      userId: randomUUID(),
      score: 1,
      voteId,
    })

    assert.ok(
      (await getTestVoteIntegrityFlagTypesByPostId(postId)).includes('ip_correlation'),
      `asOf=${new Date(asOfMs).toISOString()}`,
    )
  })

  it('runs other integrity checks when delayed ballot IP evidence has expired', async () => {
    const creatorId = uuidv7({ msecs: Date.UTC(2025, 10, 30) })
    await createTestUserWithId(creatorId, `vote-worker-expired-${randomUUID().slice(0, 8)}`)
    const postId = await insertTestPost({
      createdById: creatorId,
      createdAt: new Date(Date.UTC(2025, 11, 1)),
      slug: `vote-worker-expired-${randomUUID()}`,
      title: 'Vote worker expired IP',
      markdown: 'body',
    })
    const voteId = uuidv7({ msecs: Date.now() - 3 * 60 * 60_000 })
    await storeVoteIpEvidence(voteId, '203.0.113.90')

    await processVoteIntegrityCheck({
      entityType: 'post',
      entityId: postId,
      userId: randomUUID(),
      score: 1,
      voteId,
    })
    expect(await getTestVoteIntegrityFlagTypesByPostId(postId)).toEqual([])
  })

  it('reports and rethrows the same database error so the queue can retry', async () => {
    const data: ProcessVoteIntegrityCheckData = {
      entityType: 'post',
      entityId: 'not-a-uuid',
      userId: randomUUID(),
      score: 1,
      voteId: uuidv7(),
    }

    const failure: unknown = await processVoteIntegrityCheck(data).catch((err: unknown) => err)

    expect(failure).toBeInstanceOf(Error)
    expect(failure).toMatchObject({ code: '22P02' })
    expect(sentryCaptureExceptionMock.mock.calls.some(([captured]) => captured === failure)).toBe(
      true,
    )
  })
})
