import type { PrivateUser } from '@services/users/types'
import type { ImportRow } from './types.mts'
import { importSingleRssFeed } from '@services/user-import-export/import-rss-feeds'
import { UnrecoverableError } from '@modules/queue-errors'

export type RssFeedImportRow = {
  url: string
  follow?: boolean
}

type ProcessRssFeedRowDeps = {
  importSingleRssFeed: typeof importSingleRssFeed
}

const defaultDeps: ProcessRssFeedRowDeps = {
  importSingleRssFeed,
}

export async function processRssFeedRow(
  user: PrivateUser,
  row: ImportRow,
  deps: ProcessRssFeedRowDeps = defaultDeps,
): Promise<string> {
  const input = row.input_data as RssFeedImportRow
  const result = await deps.importSingleRssFeed(user, input.url, { follow: input.follow ?? false })
  if (result.status === 'error') {
    // URL validation failures are deterministic — retrying won't help. Mark unrecoverable
    // so glide-mq skips retries and the batch can complete without wasting backoff time.
    throw new UnrecoverableError(result.error ?? `Failed to import RSS feed: ${input.url}`)
  }
  return result.entity_id!
}
