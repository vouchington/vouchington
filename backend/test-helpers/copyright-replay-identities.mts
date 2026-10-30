import { CopyrightReplayAdmission } from '../services/copyright-notices/replay-admission.mts'
import { beginTransaction } from '@data-stores/psql'
import type { QueryExecutor } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import {
  createTestUserDirect,
  getTestPostImagePlacement,
  insertTestImage,
  insertTestPost,
  insertTestPostImage,
} from '@voucha/test-helpers'
import { createCopyrightNoticeAggregate } from './services/copyright-notices/create-notice-aggregate.mts'
import { recordCopyrightReplayIdentity } from '../services/copyright-notices/replay-identity-create.mts'
import type { CopyrightReplayInput } from '../services/copyright-notices/replay-admission-locks.mts'
import {
  findCopyrightReplayIdentity,
  type CopyrightReplayResult,
} from '../services/copyright-notices/replay-identity-store.mts'

/** Creates an independently owned live case for replay identity persistence tests. */
export async function createCopyrightReplayOwner(): Promise<{ noticeId: string }> {
  const owner = await createTestUserDirect()
  const imageId = await insertTestImage(owner.id)
  const postId = await insertTestPost({
    title: `Replay identity ${crypto.randomUUID()}`,
    slug: `replay-identity-${crypto.randomUUID()}`,
    createdById: owner.id,
    markdown: 'Replay identity test target.',
  })
  await insertTestPostImage({ postId, imageId })
  const placement = await getTestPostImagePlacement(postId, imageId)
  if (!placement) throw new Error('replay identity fixture placement disappeared')
  const notice = await createCopyrightNoticeAggregate({
    jurisdiction: 'us_dmca',
    receivedAt: new Date('2026-07-01T12:00:00.000Z'),
    claimantUserId: null,
    claimantDisplayName: null,
    claimantContact: `ciphertext-${crypto.randomUUID()}`,
    workDescription: `work-${crypto.randomUUID()}`,
    policyVersion: 'replay-test-v1',
    initialSubmission: {
      kind: 'notice',
      sourceKind: 'guest_form',
      body: `notice-${crypto.randomUUID()}`,
    },
    targets: [
      {
        placementId: placement.placement_id,
        placementRevision: placement.placement_revision,
        imageId,
        bindingFamily: 'post',
        hostedUseUrl: `https://example.test/${crypto.randomUUID()}`,
      },
    ],
  })
  return { noticeId: notice.id }
}

export async function recordCopyrightReplayFixtureIdentity(
  ownerId: string,
  input: CopyrightReplayInput,
  snapshot: Record<string, unknown>,
): Promise<string> {
  await using transaction = await beginTransaction()
  const id = await recordCopyrightReplayIdentity(
    await CopyrightReplayAdmission.open(transaction, input),
    ownerId,
    'notice_received',
    snapshot,
  )
  await transaction.commit()
  return id
}

export async function replayCopyrightReplayFixtureIdentity(
  input: CopyrightReplayInput,
  allowOtherRequester = false,
): Promise<CopyrightReplayResult> {
  await using transaction = await beginTransaction()
  const candidate = await findCopyrightReplayIdentity(
    await CopyrightReplayAdmission.open(transaction, input),
  )
  if (!candidate) throw new Error('expected a retained replay identity')
  const result = await candidate.replay(allowOtherRequester)
  await transaction.commit()
  return result
}

/** Exercises production record logic with two real transactions and opposing active key slots. */
export async function raceCopyrightReplayFixtureAdmissions(
  firstOwnerId: string,
  secondOwnerId: string,
  input: CopyrightReplayInput,
  snapshot: Record<string, unknown>,
  selectSecondRing: () => void,
): Promise<{ firstId: string; firstKeyVersionId: string; secondError: string | null }> {
  await using firstTransaction = await beginTransaction()
  await using secondTransaction = await beginTransaction()
  const firstHasLocks = Promise.withResolvers<void>()
  const releaseFirst = Promise.withResolvers<void>()
  const secondIssuedLocks = Promise.withResolvers<void>()
  void firstHasLocks.promise.catch(() => {})
  void secondIssuedLocks.promise.catch(() => {})
  let secondIssuedLocksResolved = false
  let firstPaused = false
  const firstQuery = new Proxy(firstTransaction, {
    apply(target, thisArgument, args: Parameters<QueryExecutor>) {
      const statement = args[0]
      const text = typeof statement === 'string' ? statement : statement.text
      const pending: ReturnType<QueryExecutor> = Reflect.apply(target, thisArgument, args)
      if (text.includes('/* lockAllCopyrightReplayCandidates */') && !firstPaused) {
        firstPaused = true
        return pending.then(async result => {
          firstHasLocks.resolve()
          await releaseFirst.promise
          return result
        })
      }
      return pending
    },
  })
  const secondQuery = new Proxy(secondTransaction, {
    apply(target, thisArgument, args: Parameters<QueryExecutor>) {
      const statement = args[0]
      const text = typeof statement === 'string' ? statement : statement.text
      if (text.includes('/* lockAllCopyrightReplayCandidates */') && !secondIssuedLocksResolved) {
        secondIssuedLocks.resolve()
        secondIssuedLocksResolved = true
      }
      return Reflect.apply(target, thisArgument, args)
    },
  })
  const first = (async () => {
    try {
      const id = await recordCopyrightReplayIdentity(
        await CopyrightReplayAdmission.open(firstQuery, input),
        firstOwnerId,
        'notice_received',
        snapshot,
      )
      const { rows } = await firstQuery<{ key_version_id: string }>(sql`
        /* readCopyrightReplayFixtureKeyVersion */
        SELECT key_version.key_name AS key_version_id
        FROM copyright_replay_identities identity
        JOIN copyright_replay_hmac_key_versions key_version ON key_version.id = identity.copyright_replay_hmac_key_version_id
        WHERE identity.id = ${id}
      `)
      const keyVersionId = rows[0]?.key_version_id
      if (!keyVersionId) throw new Error('first replay identity key version disappeared')
      await firstTransaction.commit()
      return { id, keyVersionId }
    } catch (err) {
      firstHasLocks.reject(err)
      throw err
    }
  })()
  let second: Promise<string | null> | undefined
  try {
    await firstHasLocks.promise
    selectSecondRing()
    second = (async () => {
      try {
        const id = await recordCopyrightReplayIdentity(
          await CopyrightReplayAdmission.open(secondQuery, input),
          secondOwnerId,
          'notice_received',
          snapshot,
        )
        await secondTransaction.commit()
        return id
      } catch (err) {
        await secondTransaction.rollback()
        if (!(err instanceof Error)) throw err
        return err.message
      }
    })()
    await secondIssuedLocks.promise
    releaseFirst.resolve()
    const { id: firstId, keyVersionId } = await first
    const secondResult = await second
    return {
      firstId,
      firstKeyVersionId: keyVersionId,
      secondError: secondResult === firstId ? null : secondResult,
    }
  } catch (err) {
    releaseFirst.resolve()
    await Promise.allSettled([first, ...(second ? [second] : [])])
    throw err
  }
}
