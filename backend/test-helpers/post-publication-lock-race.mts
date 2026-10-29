import { withTestOwnedPostgresWait } from './postgres-client-lock-observer.mts'

export function withPublicationWait<Result>(
  holderProcessId: number,
  postId: string,
  release: PromiseWithResolvers<void>,
  holder: Promise<void>,
  start: () => Promise<Result>,
): Promise<Result> {
  const releaseHolder = async () => {
    release.resolve()
    await holder
  }
  return withTestOwnedPostgresWait(
    {
      holderProcessId,
      pool: 'write',
      lock: { kind: 'advisory', key: `post:${postId.toLowerCase()}` },
      queryMarker: 'lockPostPublicationCaptures',
      releaseHolder,
    },
    async waitForLock => {
      const action = start()
      await waitForLock(action)
      await releaseHolder()
      return action
    },
  )
}
