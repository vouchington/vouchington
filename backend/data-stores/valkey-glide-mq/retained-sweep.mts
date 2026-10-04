import type { Job } from 'glide-mq'

/** A successful bounded pass yields its live job; errors retain the normal attempt policy. */
export async function processRetainedSweep<
  TData extends object,
  TResult extends { hasMore: boolean },
>(
  job: Pick<Job, 'updateData' | 'moveToDelayed'>,
  run: (save: (data: TData) => Promise<void>) => Promise<TResult>,
): Promise<TResult> {
  const result = await run(data => job.updateData(data))
  if (result.hasMore) return job.moveToDelayed(Date.now())
  return result
}
