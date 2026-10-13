import type { Job } from 'glide-mq'

export type OwnedVoteJobEnd = { failed: boolean; reason?: unknown }

/** Wait for runnable owned work; parked work remains with canonical teardown. */
export async function waitForOwnedVoteRouteJob(
  job: Pick<Job, 'getState'>,
  key: string,
  deadline: AbortSignal,
  ends: Map<string, OwnedVoteJobEnd>,
  waiters: Map<string, (end: OwnedVoteJobEnd) => void>,
  workerDiagnostics: unknown[],
) {
  const known = ends.get(key)
  if (known?.failed) throw known.reason
  if (known) return
  const state = await job.getState()
  if (state === 'failed') throw new Error(`Owned job failed: ${key}`)
  if (state === 'completed' || state === 'delayed' || state === 'suspended') return
  if (state !== 'active' && state !== 'waiting' && state !== 'prioritized')
    throw new Error(`Owned job has no terminal or parked disposition: ${key} (${state})`)
  const end = await new Promise<{ failed: boolean; reason?: unknown }>((resolve, reject) => {
    const expired = () => {
      waiters.delete(key)
      const err = new Error(`Owned wait expired; not cancelled: ${key}`)
      reject(
        workerDiagnostics.length
          ? new AggregateError([err, ...workerDiagnostics], 'Unattributed worker errors', {
              cause: err,
            })
          : err,
      )
    }
    waiters.set(key, value => {
      deadline.removeEventListener('abort', expired)
      resolve(value)
    })
    deadline.addEventListener('abort', expired, { once: true })
    if (deadline.aborted) expired()
    const terminal = ends.get(key)
    if (terminal) waiters.get(key)?.(terminal)
  })
  if (end.failed) throw end.reason
}
