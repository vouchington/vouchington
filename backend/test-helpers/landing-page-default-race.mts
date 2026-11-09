import { beginTransaction, write } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Make the second promotion's clear snapshot predate the first promotion's committed default. */
export async function runTestLandingPageDefaultRace<Result>(input: {
  userId: string
  targetPageId: string
  promoteOther: () => Promise<Result>
  queryMarker?: string
}): Promise<Result> {
  await using holder = await beginTransaction()
  await holder(
    '/* holdTestLandingPageDefaultClear */ UPDATE user_landing_pages SET is_default = FALSE WHERE user_id = $1 AND is_default',
    [input.userId],
  )
  const target = await holder(
    '/* holdTestLandingPageDefaultPromotion */ UPDATE user_landing_pages SET is_default = TRUE WHERE user_id = $1 AND id = $2 RETURNING id',
    [input.userId, input.targetPageId],
  )
  if (target.rowCount !== 1) throw new Error('Owned landing page promotion target was not found')
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  let releasing: Promise<void> | undefined
  const releaseHolder = () => (releasing ??= Promise.resolve(holder[Symbol.asyncDispose]()))
  return await withTestOwnedPostgresWait(
    {
      pool: 'write',
      holderProcessId,
      lock: { kind: 'transaction' },
      queryMarker: input.queryMarker ?? 'setMyLandingPageDefault',
      releaseHolder,
    },
    async waitForLock => {
      const action = Promise.resolve().then(input.promoteOther)
      const outcome = Promise.allSettled([action])
      try {
        await waitForLock(action)
        await holder.commit()
      } finally {
        await releaseHolder()
      }
      const [result] = await outcome
      if (!result || result.status === 'rejected')
        throw result?.reason ?? new Error('Missing promotion result')
      return result.value
    },
  )
}

export async function clearTestLandingPageDefaults(userId: string): Promise<void> {
  await write(
    '/* clearTestLandingPageDefaults */ UPDATE user_landing_pages SET is_default = FALSE WHERE user_id = $1 AND is_default',
    [userId],
  )
}

/** A concurrent create must not wait on this other page's explicit default preference. */
export async function withTestLandingPagePromotionHeld<Result>(
  userId: string,
  pageId: string,
  action: () => Promise<Result>,
): Promise<Result> {
  await using query = await beginTransaction()
  await query(
    '/* holdTestLandingPagePreference */ UPDATE user_landing_pages SET is_default = TRUE WHERE user_id = $1 AND id = $2',
    [userId, pageId],
  )
  const result = await action()
  await query.commit()
  return result
}
