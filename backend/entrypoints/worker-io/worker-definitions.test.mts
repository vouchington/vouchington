import { describe, expect, it } from 'vitest'
import { WORKER_DEFINITIONS } from './worker-definitions.mts'

function expectLazyImport(
  loadSource: string,
  workerDirectory: string,
  exportName: string,
  moduleName = 'workers',
) {
  expect(loadSource).toContain(workerDirectory)
  expect(loadSource).toContain(moduleName)
  expect(loadSource).toMatch(new RegExp(`\\b${exportName}\\b`))
}

describe('worker-io WORKER_DEFINITIONS load functions', () => {
  it('each worker definition points at the expected lazy import export', () => {
    const expectedDefinitions = [
      ['background', 'background', 'createBackgroundWorker'],
      ['find-your-friends', 'find-your-friends', 'findYourFriends'],
      ['rss-feed-maintenance', 'rss-feed-maintenance', 'rssFeedMaintenance'],
      ['crawl_embeds', 'crawl-embeds', 'crawlEmbeds'],
      ['emails', 'emails', 'emails'],
      ['psql', 'psql', 'psql'],
      ['bloom-filters', 'bloom-filters', 'bloomFilters'],
      ['memberships', 'memberships', 'memberships'],
    ] as const
    const byQueue = (name: string) =>
      WORKER_DEFINITIONS.find(definition => definition.queueName === name)!

    expect(WORKER_DEFINITIONS.map(definition => definition.queueName)).toEqual(
      expectedDefinitions.map(([queueName]) => queueName),
    )
    for (const [queueName, workerDirectory, exportName] of expectedDefinitions) {
      expectLazyImport(byQueue(queueName).load.toString(), workerDirectory, exportName)
    }
  })

  it('background definition load builds the shared worker over every domain handler', async () => {
    const definition = WORKER_DEFINITIONS.find(d => d.queueName === 'background')!
    const worker = await definition.load()
    try {
      expect(worker).toBeDefined()
    } finally {
      await worker.close()
    }
  })

  it('serves every moved domain only through the background definition', () => {
    const queueNames = WORKER_DEFINITIONS.map(definition => definition.queueName)
    for (const moved of [
      'post-publication',
      'story-post-related-url-projections',
      'rss-feeds',
      'urls-domains-blacklist',
      'sitemaps',
      'cache-purge',
      'kagi-smallweb',
    ]) {
      expect(queueNames).not.toContain(moved)
    }
  })
})
