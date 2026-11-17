import onError from '@modules/on-error'

/** The owned user transaction has already disposed; stop this pass, not the next scheduled tick. */
export function reportScheduledUserPurgeCollision(err: unknown): undefined {
  if (!(err instanceof Error)) throw err
  const failure = err as { code?: string; status?: number; cause?: { code?: string } }
  if (failure.code !== '40P01' && !(failure.status === 409 && failure.cause?.code === '40001'))
    throw err
  onError(err)
  return undefined
}
