import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

export async function withHeldCommunityUserWait<Result>(input: {
  holderProcessId: number
  communityId: string
  userId: string
  releaseHolder: () => Promise<void>
  start: () => Promise<Result>
  whileBlocked?: () => Promise<void>
}): Promise<Result> {
  return withTestOwnedPostgresWait(
    {
      holderProcessId: input.holderProcessId,
      pool: 'write',
      lock: { kind: 'advisory', key: `${input.communityId}:${input.userId}` },
      queryMarker: 'lockCommunityUsers',
      releaseHolder: input.releaseHolder,
    },
    async waitForLock => {
      const action = input.start()
      await waitForLock(action)
      await input.whileBlocked?.()
      await input.releaseHolder()
      return action
    },
  )
}
