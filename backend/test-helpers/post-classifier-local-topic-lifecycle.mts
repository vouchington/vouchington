import { createHash } from 'node:crypto'
import { write } from '@data-stores/psql'
import { claimClassifierRun, reserveClassifierRun } from '../services/classifier-runs/index.mts'
import type { PostClassifierRunAdapter } from '../services/post-classifier/index.mts'
import {
  createApprovedClassifierPost,
  createTestPostClassifierAdapter,
} from './data-stores/psql/post-classifier/execution.mts'
import { createTestTopic } from './entities/create-test-entities.mts'

/** Pins a fixture-owned local label, leaving the shared classifier catalog untouched. */
export async function createLocalTopicLifecycleFixture() {
  const { post, user, inputSha256 } = await createApprovedClassifierPost(false, true)
  const [topic, destination] = await Promise.all([
    createTestTopic({ user }),
    createTestTopic({ user }),
  ])
  const standard = createTestPostClassifierAdapter()
  const adapter: PostClassifierRunAdapter = {
    ...standard,
    async resolve(subject, current, query) {
      const resolved = await standard.resolve(subject, current, query)
      if (!resolved?.configuration.local) throw new Error('Fixture requires a local classifier')
      const configuration = {
        ...resolved.configuration,
        local: { ...resolved.configuration.local, topicId: topic.id },
      }
      const { rows } = await (query ?? write)<{ configuration_json: string }>(
        `/* canonicalizeLocalTopicLifecycleFixture */ SELECT $1::jsonb::text AS configuration_json`,
        [JSON.stringify(configuration)],
      )
      const configurationJson = rows[0]!.configuration_json
      return {
        ...resolved,
        configuration,
        configurationJson,
        configurationSha256: createHash('sha256').update(configurationJson).digest(),
      }
    },
  }
  const subject = { postId: post.id, rssFeedItemId: null } as const
  const reserved = await reserveClassifierRun(adapter, subject)
  if (reserved.kind !== 'reserved') throw new Error(`Unexpected reservation: ${reserved.kind}`)
  const claimed = await claimClassifierRun(adapter, {
    runId: reserved.run.runId,
    subject,
    inputSha256,
    configurationSha256: reserved.run.configurationSha256,
    leaseSeconds: 60,
  })
  if (claimed.kind !== 'claimed') throw new Error(`Unexpected claim: ${claimed.kind}`)
  return { adapter, lease: claimed.lease, post, user, topic, destination }
}
