import type { JobOptions } from 'glide-mq'

/** Keep dispatcher retry/admission options while preserving the enqueue's stable job identity. */
export function continuationOptions(
  options?: Partial<JobOptions>,
): Partial<JobOptions> | undefined {
  if (!options) return undefined
  const { jobId: _jobId, ordering: _ordering, ...rest } = options
  return rest
}
