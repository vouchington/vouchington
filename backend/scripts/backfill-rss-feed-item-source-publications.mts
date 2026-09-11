import { shutdownDataStoresForOneOffCommand } from '@data-stores/graceful-shutdown'
import {
  assertRssFeedItemSourcePublicationBackfillBatchSize,
  backfillRssFeedItemSourcePublications,
  hasRssFeedItemSourcesMissingPublication,
} from '@services/rss-feed-items/backfill-source-publications'
import onError from '@modules/on-error'
import { isUUID } from '@modules/utils'
import { parseArgs } from 'node:util'

const DEFAULT_BATCH_SIZE = 500

async function main() {
  const { values } = parseArgs({
    options: {
      'batch-size': { default: String(DEFAULT_BATCH_SIZE), type: 'string' },
      'rss-feed-id': { type: 'string' },
      'until-complete': { default: false, type: 'boolean' },
    },
  })
  const batchSize = Number(values['batch-size'])
  const rssFeedId = values['rss-feed-id']

  try {
    assertRssFeedItemSourcePublicationBackfillBatchSize(batchSize)
    if (rssFeedId !== undefined && !isUUID(rssFeedId)) {
      throw new Error('--rss-feed-id must be a valid UUID')
    }
    const scope = rssFeedId !== undefined ? { rssFeedId } : undefined
    let totalUpdated = 0
    while (true) {
      const updated = await backfillRssFeedItemSourcePublications(batchSize, scope)
      totalUpdated += updated
      console.log(`Backfilled ${updated} source publications.`)
      if (!values['until-complete']) return
      if (updated > 0) continue

      if (await hasRssFeedItemSourcesMissingPublication(scope)) {
        throw new Error(
          'Source-publication backfill made no progress while rows remain; retry later.',
        )
      }
      console.log(`Backfill complete; updated ${totalUpdated} source publications.`)
      return
    }
  } finally {
    await shutdownDataStoresForOneOffCommand()
  }
}

main().catch(error => {
  onError(error)
  process.exitCode = 1
})
