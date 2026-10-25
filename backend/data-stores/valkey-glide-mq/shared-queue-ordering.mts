import type { JobOptions } from 'glide-mq'

/** Resolve the effective global cap for each admission, after producer options are merged. */
export function applySharedQueueOrdering(
  jobName: string,
  opts: JobOptions,
  getConcurrency: (key: string) => number,
): JobOptions {
  const ordering = opts.ordering
  if (!ordering?.key) throw new Error('Shared queue jobs require an ordering key')
  const domain = jobName.split('.', 1)[0]
  if (
    !jobName.includes('.') ||
    (ordering.key !== domain && !ordering.key.startsWith(`${domain}:`))
  ) {
    throw new Error(`Shared queue job ${jobName} requires a domain-prefixed ordering key`)
  }
  return {
    ...opts,
    ordering: { ...ordering, concurrency: getConcurrency(ordering.key) },
  }
}
