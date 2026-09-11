import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUser } from './users.mts'
import { insertTestUrlDirect } from './urls.mts'
import { insertTestCrawler } from './crawlers.mts'
import { insertTestCrawlPending } from './crawls.mts'
import { insertTestCrawlChunk } from './crawl-chunks.mts'
import { chunk } from '@jongleberry/vurst-markdown'
import { sha256 } from '@modules/utils'

export async function createTestCrawlWithChunks(options: { markdown: string }): Promise<{
  user: unknown
  url: { id: string } | null
  crawler: { id: string }
  crawl: { id: string }
}> {
  const user = await createTestUser()

  const testUrl = `https://example-${Date.now()}-${Math.random()}.com/test`
  const url = await insertTestUrlDirect(user!.id, testUrl)

  const crawlerId = await insertTestCrawler({
    hostnameId: url!.hostname.id,
    description: 'Test Crawler',
    crawlerType: 'fetch',
  })
  const crawler = { id: crawlerId }

  const crawl = await insertTestCrawlPending(url!.id, crawler.id)

  const chunks = await chunk(Buffer.from(options.markdown))
  for (let i = 0; i < chunks.length; i++) {
    await insertTestCrawlChunk({
      urlId: url!.id,
      crawlId: crawl.id,
      orderIndex: i,
      markdown: chunks[i].text,
      contentSha256: sha256(chunks[i].text),
    })
  }

  if (chunks.length > 0) {
    await write(sql`
      UPDATE crawls
      SET has_pending_embeddings = TRUE
      WHERE url_id = ${url!.id}
        AND id = ${crawl.id}
    `)
  }

  return { user, url, crawler, crawl }
}
