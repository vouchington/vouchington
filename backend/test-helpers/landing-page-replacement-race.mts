import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { getTestPostgresBackendProcessId } from './postgres-lock-wait.mts'
import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

/** Commit the first real replacement only after the next writer waits on its item-row write. */
export async function runTestLandingPageReplacementRace<Result>(input: {
  writeHeld: (query: TransactionQuery) => Promise<void>
  queryMarker: string
  start: () => Promise<Result>
}): Promise<Result> {
  await using holder = await beginTransaction()
  await input.writeHeld(holder)
  const holderProcessId = await getTestPostgresBackendProcessId(holder)
  let releasing: Promise<void> | undefined
  const releaseHolder = () => (releasing ??= Promise.resolve(holder[Symbol.asyncDispose]()))
  return await withTestOwnedPostgresWait(
    {
      pool: 'write',
      holderProcessId,
      lock: { kind: 'transaction' },
      queryMarker: input.queryMarker,
      releaseHolder,
    },
    async waitForLock => {
      const action = Promise.resolve().then(input.start)
      const outcome = Promise.allSettled([action])
      try {
        await waitForLock(action)
        await holder.commit()
      } finally {
        await releaseHolder()
      }
      const [result] = await outcome
      if (!result || result.status === 'rejected')
        throw result?.reason ?? new Error('Missing replacement result')
      return result.value
    },
  )
}

export async function getTestLandingPageGroupMemberCount(pageId: string): Promise<number> {
  const { rows } = await write<{ count: number }>(
    `/* getTestLandingPageGroupMemberCount */ SELECT count(*)::integer AS count
     FROM user_landing_page_group_members member
     JOIN user_landing_page_items item ON item.id = member.landing_page_item_id
     WHERE item.landing_page_id = $1`,
    [pageId],
  )
  return rows[0]!.count
}

/** Soft-delete a topic the way a retire or merge finalize does, after the caller validated it. */
export async function retireTestTopicForLandingPage(topicId: string): Promise<void> {
  await write('/* retireLandingTestTopic */ UPDATE topics SET deleted_at = now() WHERE id = $1', [
    topicId,
  ])
}
