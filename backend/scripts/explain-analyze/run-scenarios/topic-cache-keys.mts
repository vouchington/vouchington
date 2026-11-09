import { getTopicCacheKeys } from '@services/entity-cache/keys'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import {
  SHARED_LOADER_DESTINATION_ID,
  SHARED_LOADER_SOURCE_ID,
} from '../seed-data/shared-loaders.mts'

export async function runTopicCacheKeysScenario(): Promise<void> {
  registerScenarioContract('topic-cache-keys', {
    expectations: [
      // The shared-loader fixture contributes two topics and one destination alias.
      { kind: 'maxProcessedRows', relation: 'topics', max: 15 },
      { kind: 'maxProcessedRows', relation: 'topic_aliases', max: 2 },
    ],
  })
  await runAndCapture(
    'topic-cache-keys',
    async () => {
      const keys = await getTopicCacheKeys(
        SHARED_LOADER_DESTINATION_ID,
        'seed-shared-loader-destination',
        'seed-shared-loader-alias',
      )
      const expected = [
        SHARED_LOADER_DESTINATION_ID,
        SHARED_LOADER_SOURCE_ID,
        'seed-shared-loader-destination',
        'seed-shared-loader-source',
        'seed-shared-loader-alias',
      ]
      if (keys.length !== expected.length || expected.some(key => !keys.includes(key)))
        throw new Error('Topic cache keys must resolve id, slug, alias, and merged source keys')
    },
    undefined,
    'getTopicCacheKeys',
  )
}
