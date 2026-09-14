import { read } from '@data-stores/psql'

export async function getCrawlOembedPendingIndexDefinition(): Promise<string | undefined> {
  const { rows } = await read<{ indexdef: string }>(
    `/* getCrawlOembedPendingIndexDefinition */ SELECT indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = 'crawls' AND indexname = 'crawls_oembed_pending_idx'`,
  )
  return rows[0]?.indexdef
}
