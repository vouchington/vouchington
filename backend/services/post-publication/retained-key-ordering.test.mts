import type { TransactionQuery } from '@data-stores/psql'
import {
  beginTransaction,
  getTestPostgresBackendProcessId,
  waitForTestPostgresLockWaiter,
} from '@voucha/test-helpers'
import { readTestPublicationRetainedKeys } from '@voucha/test-helpers/entities/post-publication-snapshots'
import { describe, expect, it } from 'vitest'
import { recordPostPublicationChange } from './capture.mts'
import { POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE } from './constants.mts'
import { retainPublicationIdentityBridges } from './identity-bridges.mts'
import {
  retainPostPublicationKeys,
  type PostPublicationRetainedKey,
} from './retained-key-writes.mts'

describe('retained key native conflict ordering', () => {
  it('orders complete conflict keys across mixed-family batch boundaries with precommitted bridges', async () => {
    const postId = crypto.randomUUID()
    const communityIds = Array.from({ length: POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE }, () =>
      crypto.randomUUID(),
    ).sort()
    await using setup = await beginTransaction()
    const work = await recordPostPublicationChange(setup, {
      scope: { type: 'post', postId },
      reason: 'post_updated',
    })
    await retainPublicationIdentityBridges(setup, 'community', communityIds)
    await setup.commit()
    const shared: PostPublicationRetainedKey[] = communityIds.map(uuidValue => ({
      kind: 'impact_community',
      uuidValue,
    }))
    const postKey: PostPublicationRetainedKey = { kind: 'impact_post', uuidValue: postId }
    await expect(
      assertOverlappingWrites(work.id, [...shared, postKey], [...shared.slice(0, -1), postKey]),
    ).resolves.toBeUndefined()
  })

  it('uses database text collation across the batch boundary', async () => {
    await using setup = await beginTransaction()
    const work = await recordPostPublicationChange(setup, {
      scope: { type: 'post', postId: crypto.randomUUID() },
      reason: 'post_updated',
    })
    await setup.commit()
    const prefix = crypto.randomUUID()
    const shared: PostPublicationRetainedKey[] = Array.from(
      { length: POST_PUBLICATION_DIRTY_WORK_KEY_BATCH_SIZE },
      (_, index) => ({
        kind: 'identity_topic_alias',
        textValue: `${prefix}-a${String(index).padStart(4, '0')}`,
      }),
    )
    const key: PostPublicationRetainedKey = {
      kind: 'identity_topic_alias',
      textValue: `${prefix}-B`,
    }
    await expect(
      assertOverlappingWrites(work.id, [...shared, key], [...shared.slice(0, -1), key]),
    ).resolves.toBeUndefined()
  })
})

async function assertOverlappingWrites(
  workId: string,
  firstKeys: PostPublicationRetainedKey[],
  secondKeys: PostPublicationRetainedKey[],
): Promise<void> {
  await using first = await beginTransaction()
  await using second = await beginTransaction()
  const firstPid = await getTestPostgresBackendProcessId(first)
  const inserted = Promise.withResolvers<void>()
  let insertCount = 0
  const barrieredQuery = Object.assign(
    async (input: string, values?: unknown[]) => {
      const result = await first(input, values)
      if (input.includes('/* retainPostPublicationDirtyWorkKeys */') && ++insertCount === 1) {
        inserted.resolve()
        await waitForTestPostgresLockWaiter(firstPid, 'retainPostPublicationDirtyWorkKeys')
      }
      return result
    },
    { client: first.client },
  ) as TransactionQuery
  const outcomes = await Promise.allSettled([
    retainPostPublicationKeys(barrieredQuery, workId, firstKeys)
      .then(() => first.commit())
      .catch(async error => {
        inserted.reject(error)
        await first.rollback()
        throw error
      }),
    inserted.promise
      .then(() => retainPostPublicationKeys(second, workId, secondKeys))
      .then(() => second.commit())
      .catch(async error => {
        await second.rollback()
        throw error
      }),
  ])
  expect(outcomes).toEqual([
    { status: 'fulfilled', value: undefined },
    { status: 'fulfilled', value: undefined },
  ])
  const kinds = new Set(firstKeys.map(key => key.kind))
  const retained = (await readTestPublicationRetainedKeys(workId)).filter(key =>
    kinds.has(key.kind as PostPublicationRetainedKey['kind']),
  )
  expect(retained).toHaveLength(firstKeys.length)
  expect(retained).toEqual(
    expect.arrayContaining(
      firstKeys.map(key => ({
        kind: key.kind,
        value:
          'uuidValue' in key
            ? key.uuidValue.toLowerCase()
            : 'textValue' in key
              ? key.textValue
              : `${key.postType}:${key.day}`,
      })),
    ),
  )
}
