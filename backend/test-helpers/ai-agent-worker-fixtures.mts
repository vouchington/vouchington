import * as modelClients from '../modules/model-providers/clients.mts'
import { createRequire } from 'node:module'
import '../../test-helpers/vitest.setup.stored-secret-encryption-keys.mts'
import { Responses } from 'openai/resources/responses/responses'
import { ProxyAgent } from 'undici'
import { MockAgent, withMockAgentDefaultFetchForTest } from './provider-http.mts'
import { randomUUID } from 'node:crypto'
import { workerQueueCommandClient } from '../data-stores/valkey-glide-mq/glide-mq-shared-client.mts'
import { workerQueuePrefix } from '../data-stores/valkey-core/glide-mq-client.mts'
import { onTestFinished, vi } from 'vitest'
import * as jsonProvider from '../modules/model-providers/generate.mts'
import * as toolProvider from '../modules/model-providers/tool-turn.mts'
import type { ModelCallResult, ToolTurnResult } from '@vouchington/ai/providers'
import {
  createTestUser,
  insertTestPost,
  insertTestModerationReport,
  deleteTestPost,
} from './index.mts'
import { createAutotaggerPostFixture } from './data-stores/psql/classifier-runs/autotagger-fixture.mts'
import {
  completeTaggingRunForTest,
  AUTOTAGGER_AGENT_SLUG,
} from './data-stores/psql/classifier-runs/autotagger-agent-fixture.mts'
import { createFollowedClassifierSubjectFixture } from './classifier-run-worker.mts'
import { getClassifierRunHandler } from '../workers/ai-agents/processors/classifier-run-registry.mts'
import { toClassifierRunJobData } from '../workers/ai-agents/processors/classifier-run-handler.mts'

export type ProviderFixture<T> = T | Error | (() => Promise<T>)
async function resolveFixture<T>(fixture: ProviderFixture<T> | undefined): Promise<T> {
  if (fixture instanceof Error) throw fixture
  if (typeof fixture === 'function') return (fixture as () => Promise<T>)()
  if (!fixture) throw new Error('Unexpected paid provider request: no recorded fixture queued')
  return fixture
}

/** Both paid provider boundaries fail closed unless this test queued an owned fixture. */
export function installAIAgentProviderFixtures() {
  const json = new Map<string, ProviderFixture<ModelCallResult<never>>[]>()
  const turns = new Map<string, ProviderFixture<ToolTurnResult>[]>()
  const generateJson = vi
    .spyOn(jsonProvider, 'generateJson')
    .mockImplementation((_selection, request) =>
      resolveFixture(json.get(request.safetyIdentifier ?? '')?.shift()),
    )
  const generateToolTurn = vi
    .spyOn(toolProvider, 'generateToolTurn')
    .mockImplementation((_selection, request) => {
      const key = [...turns.keys()].find(id =>
        request.messages.some(message => 'text' in message && message.text.includes(id)),
      )
      return resolveFixture(key ? turns.get(key)?.shift() : undefined)
    })
  onTestFinished(() => {
    generateJson.mockRestore()
    generateToolTurn.mockRestore()
  })
  return { json, turns, generateJson, generateToolTurn }
}

/** A real reported post, manually rerun so ambient community policy cannot suppress the provider. */
export async function createAIAgentReportFixture() {
  const author = await createTestUser()
  const reporter = await createTestUser()
  const postId = await insertTestPost({
    createdById: author.id,
    slug: `worker-report-${randomUUID()}`,
    title: 'Owned AI worker report',
    markdown: 'Owned post for provider-boundary worker tests.',
  })
  onTestFinished(() => deleteTestPost(postId))
  const reportId = await insertTestModerationReport({
    reporterUserId: reporter.id,
    entityType: 'post',
    entityId: postId,
    reason: 'spam',
  })
  return {
    author,
    postId,
    data: {
      entity_type: 'post' as const,
      entity_id: postId,
      triggering_report_id: reportId,
      rerun_by_id: author.id,
    },
  }
}

/** A real C7 request after its predecessor completed, reserved but not dispatched. */
export async function createAIAgentToolLoopFixture() {
  const fixture = await createFollowedClassifierSubjectFixture(() =>
    createAutotaggerPostFixture({ topicCount: 1 }),
  )
  onTestFinished(() => deleteTestPost(fixture.post.id))
  await completeTaggingRunForTest(fixture)
  const reserved = await getClassifierRunHandler(AUTOTAGGER_AGENT_SLUG).reserve(fixture.subject)
  if (reserved.kind !== 'reserved') throw new Error(`Expected C7 reservation, got ${reserved.kind}`)
  const providerFixtureKey = fixture.post.title
  if (!providerFixtureKey) throw new Error('Expected the owned subject title')
  return {
    ...fixture,
    providerFixtureKey,
    data: toClassifierRunJobData(AUTOTAGGER_AGENT_SLUG, reserved.run),
  }
}

/** A provider-command failure only for the owned job's token-report field; all queue transitions stay real. */
export function rejectOwnedAIAgentTokenReport(jobId: string, failure: Error) {
  type CommandClient = { fcall: (name: string, keys: string[], args: string[]) => Promise<unknown> }
  const prototype = (
    workerQueueCommandClient.constructor as unknown as { prototype: CommandClient }
  ).prototype
  const original = prototype.fcall
  const ownedKey = `${workerQueuePrefix ?? 'glide'}:{ai_agents}:job:${jobId}`
  const command = vi.spyOn(prototype, 'fcall').mockImplementation(function (
    this: CommandClient,
    name,
    keys,
    args,
  ) {
    if (name === 'glidemq_updateJobFields' && keys[0] === ownedKey && args.includes('tpmTokens')) {
      command.mockRestore()
      return Promise.reject(failure)
    }
    return original.call(this, name, keys, args)
  })
  onTestFinished(() => command.mockRestore())
  return command
}

/** Block every non-fixture paid SDK and HTTP route while exercising the actual JSON provider. */
export async function withAIAgentProviderNetworkFence<T>(operation: () => Promise<T>): Promise<T> {
  const failure = new Error('Unexpected paid provider or network request outside the fixture')
  const agent = new MockAgent()
  agent.disableNetConnect()
  const { BedrockRuntimeClient } = createRequire(
    new URL('../modules/aws/package.json', import.meta.url),
  )('@aws-sdk/client-bedrock-runtime') as {
    BedrockRuntimeClient: {
      prototype: typeof import('../modules/aws/bedrock-runtime.mts').BedrockEmbeddingsClient
    }
  }
  const guards: Array<{ mockRestore(): void }> = []
  try {
    guards.push(vi.spyOn(modelClients, 'createAnthropicMessage').mockRejectedValue(failure))
    guards.push(vi.spyOn(BedrockRuntimeClient.prototype, 'send').mockRejectedValue(failure))
    guards.push(vi.spyOn(Responses.prototype, 'retrieve').mockRejectedValue(failure))
    guards.push(vi.spyOn(Responses.prototype, 'cancel').mockRejectedValue(failure))
    guards.push(vi.spyOn(Responses.prototype, 'delete').mockRejectedValue(failure))
    guards.push(
      vi.spyOn(ProxyAgent.prototype, 'dispatch').mockImplementation(() => {
        throw failure
      }),
    )
    guards.push(vi.spyOn(globalThis, 'fetch').mockRejectedValue(failure))
    return await withMockAgentDefaultFetchForTest(agent, operation)
  } finally {
    for (const guard of guards.toReversed()) guard.mockRestore()
    await agent.close()
  }
}
