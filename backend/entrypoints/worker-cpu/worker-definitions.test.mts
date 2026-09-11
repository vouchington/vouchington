import { describe, expect, it } from 'vitest'
import { CPU_ONLY_WORKER_DEFINITIONS, WORKER_DEFINITIONS } from './worker-definitions.mts'
import { WORKER_DEFINITIONS as IO_WORKER_DEFINITIONS } from '@entrypoints/worker-io/worker-definitions'

function expectLazyImport(loadSource: string, runtimePath: string, exportName: string) {
  const pathMatch = runtimePath.match(/\/backend\/workers\/(?<directory>[^/]+)\/(?<file>[^/.]+)/)

  expect(pathMatch?.groups).toBeDefined()
  expect(loadSource).toContain(pathMatch!.groups!.directory)
  expect(loadSource).toContain(pathMatch!.groups!.file)
  expect(loadSource).toMatch(new RegExp(`\\b${exportName}\\b`))
}

describe('worker-cpu CPU_ONLY_WORKER_DEFINITIONS load functions', () => {
  it('combines CPU-only and IO-capable definitions for the merged worker entrypoint', () => {
    expect(WORKER_DEFINITIONS).toEqual([...CPU_ONLY_WORKER_DEFINITIONS, ...IO_WORKER_DEFINITIONS])
  })

  it('loads and closes the dedicated OpenAI spend-cap recheck worker', async () => {
    const definition = CPU_ONLY_WORKER_DEFINITIONS.find(
      definition => definition.queueName === 'openai-spend-cap-rechecks',
    )!
    const worker = await definition.load()

    try {
      expect(worker).toBeDefined()
    } finally {
      await worker.close()
    }
  })

  it('each worker definition points at the expected lazy import export', () => {
    const expectedDefinitions = [
      ['crawl_urls', '/backend/workers/crawler/workers.mts', 'crawlUrls'],
      ['crawl_hostnames', '/backend/workers/crawl-hostnames/workers.mts', 'crawlHostnames'],
      [
        'crawl_referral_links',
        '/backend/workers/crawl-referral-links/workers.mts',
        'crawlReferralLinks',
      ],
      [
        'crawl_html_boilerplate_removal',
        '/backend/workers/crawl-boilerplate-removal/workers.mts',
        'boilerplateRemoval',
      ],
      ['crawl_browser', '/backend/workers/crawl-browser/workers.mts', 'crawlBrowser'],
      [
        'unfurl_referral_links',
        '/backend/workers/unfurl-referral-links/workers.mts',
        'unfurlReferralLinks',
      ],
      ['images', '/backend/workers/images/workers.mts', 'images'],
      ['ai_agents', '/backend/workers/ai-agents/workers.mts', 'ai_agents'],
      [
        'openai-spend-cap-rechecks',
        '/backend/workers/ai-agents/workers/spend-cap-recheck.mts',
        'openAiSpendCapRechecks',
      ],
      [
        'wikipedia-recommender',
        '/backend/workers/wikipedia-recommender/workers.mts',
        'wikipediaRecommender',
      ],
      [
        'bedrock_embeddings_nova_multimodal_v1_single',
        '/backend/workers/bedrock-embeddings/workers.mts',
        'bedrock_embeddings_nova_multimodal_v1_single',
      ],
      [
        'bedrock-embeddings-batch',
        '/backend/workers/bedrock-embeddings-batch/workers.mts',
        'bedrock_embeddings_batch',
      ],
      [
        'language_detection',
        '/backend/workers/language-detection/workers.mts',
        'languageDetection',
      ],
    ] as const
    const byQueue = (name: string) =>
      CPU_ONLY_WORKER_DEFINITIONS.find(definition => definition.queueName === name)!

    expect(CPU_ONLY_WORKER_DEFINITIONS.map(definition => definition.queueName)).toEqual(
      expectedDefinitions.map(([queueName]) => queueName),
    )
    for (const [queueName, runtimePath, exportName] of expectedDefinitions) {
      const loadSource = byQueue(queueName).load.toString()
      expectLazyImport(loadSource, runtimePath, exportName)
    }
  })
})
