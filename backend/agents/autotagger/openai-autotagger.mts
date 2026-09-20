import type { BasicUser } from '@services/users/types'
import type { Topic } from '@services/topics/types'
import {
  runToolLoop,
  buildAgentTools,
  withCurry,
  DEFAULT_AGENT_MODEL,
  QUEUED_BACKGROUND_RETRY_POLICY,
  toOpenRouterModel,
  OPENROUTER_DEFAULT_AGENT_MODEL,
} from '@agents/_shared'
import type { AgentTool, OpenAIFunctionCall } from '@services/openai-agents'
import {
  createConversationMessageAgenticRun,
  getConversationById,
  updateConversationMessageAgenticRunError,
  updateConversationMessageAgenticRunOutput,
  createRunEventWriter,
} from '@services/conversations-messages'
import type { ConversationMessageAgenticRunTerminationReason } from '@services/conversations-messages/types'
import { createErrorObject, createToolCallsSignature } from './openai-autotagger-utils.mts'
import { sanitizePromptInjection } from '@jongleberry/vurst-prompt'
import searchTopicsTool from '@voucha/tools/search-topics'
import addRelatedTopicTool from '@voucha/tools/add-related-topic'
import { extractAddedTopic } from './extract-added-topic.mts'

const MAX_ITERATIONS = 10
const MAX_TOPICS = 10

interface SeededTopic {
  id: string
  name: string
}

interface CallOpenAIAutotaggerOptions {
  max_iterations?: number
  max_topics?: number
  conversationId?: string
  conversationMessageId?: string
  instructions?: string
  seeded_topics?: SeededTopic[]
  communityId?: string | null
}

interface CallOpenAIAutotaggerDeps {
  agentTools?: AgentTool[]
  buildAgentTools?: typeof buildAgentTools
  getConversationById?: typeof getConversationById
  createConversationMessageAgenticRun?: typeof createConversationMessageAgenticRun
  updateConversationMessageAgenticRunError?: typeof updateConversationMessageAgenticRunError
  updateConversationMessageAgenticRunOutput?: typeof updateConversationMessageAgenticRunOutput
  createRunEventWriter?: typeof createRunEventWriter
  runToolLoop?: typeof runToolLoop
}

export async function callOpenAIAutotagger(
  autotaggerUser: BasicUser,
  entityType: 'post' | 'rss_feed_item',
  entityId: string,
  content: string,
  options?: CallOpenAIAutotaggerOptions,
  deps: CallOpenAIAutotaggerDeps = {},
): Promise<{ topics_added: Topic[] }> {
  const max_iterations = options?.max_iterations ?? MAX_ITERATIONS
  const max_topics = options?.max_topics ?? MAX_TOPICS
  const conversationId = options?.conversationId
  const conversationMessageId = options?.conversationMessageId
  const instructions = options?.instructions
  const seeded_topics = options?.seeded_topics
  const communityId = options?.communityId
  const topics_added: Topic[] = []
  const buildTools = deps.buildAgentTools ?? buildAgentTools
  const tools =
    deps.agentTools ??
    buildTools(autotaggerUser, [
      searchTopicsTool,
      withCurry(addRelatedTopicTool, entityType, entityId),
    ]).agentTools
  let seededTopicsSection = ''
  if (seeded_topics && seeded_topics.length > 0) {
    const sanitizedNames = await Promise.all(
      seeded_topics.map(t => sanitizePromptInjection(t.name, { isTitle: true })),
    )
    // t.id is a DB-assigned UUID from topic search results — safe for string interpolation.
    const lines = seeded_topics.map((t, i) => `- ${sanitizedNames[i]} (id: ${t.id})`)
    seededTopicsSection = `\n\nPotentially relevant topics (pre-seeded from vector similarity and feed-declared categories — validate and call add_related_topic for each that genuinely applies):\n${lines.join('\n')}`
  }
  const initialInput = content + seededTopicsSection

  let agenticRunId: string | undefined
  if (conversationId && conversationMessageId) {
    const getConversation = deps.getConversationById ?? getConversationById
    const createAgenticRun =
      deps.createConversationMessageAgenticRun ?? createConversationMessageAgenticRun
    const conversation = await getConversation(conversationId)
    if (!conversation) {
      throw new Error(`Conversation not found: ${conversationId}`)
    }
    if (conversation.created_by_id !== autotaggerUser.id) {
      throw new Error('Conversation creator must match the autotagger user')
    }

    const agenticRun = await createAgenticRun({
      conversationId,
      conversationMessageId,
      modelName: OPENROUTER_DEFAULT_AGENT_MODEL,
      modelProvider: 'openrouter',
      input: { content },
    })
    agenticRunId = agenticRun.id
  }

  const createRunEvent = deps.createRunEventWriter ?? createRunEventWriter
  const createAndUpdateRunEvent = agenticRunId ? createRunEvent(agenticRunId) : undefined

  let remainingTopicCalls = max_topics
  let previousToolCallsSignature: string | undefined

  try {
    const runLoop = deps.runToolLoop ?? runToolLoop
    const result = await runLoop({
      model: toOpenRouterModel(DEFAULT_AGENT_MODEL),
      responseProvider: 'openrouter',
      instructions,
      tools,
      input: initialInput,
      maxIterations: max_iterations,
      safetyIdentifier: autotaggerUser.id,
      agentSlug: 'autotagger',
      communityId,
      postId: entityType === 'post' ? entityId : undefined,
      maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries,
      extraParams: { service_tier: 'flex', prompt_cache_key: 'autotagger-v1' },
      metadata: { type: 'autotagger', entity_id: entityId, entity_type: entityType },
      writeRunEvent: createAndUpdateRunEvent,

      onBeforeCall(toolCall: OpenAIFunctionCall) {
        if (toolCall.name !== 'add_related_topic') return undefined
        if (remainingTopicCalls <= 0) {
          return { skip: true, skipResult: { skipped: true, reason: 'max_topics_reached' } }
        }
        remainingTopicCalls--
        return undefined
      },

      onAfterCall(toolCall: OpenAIFunctionCall, callResult: unknown) {
        if (toolCall.name !== 'add_related_topic') return
        const topic = extractAddedTopic(callResult)
        if (topic && !topics_added.some(t => t.id === topic.id)) {
          topics_added.push(topic)
        }
      },

      onIteration({ toolCalls }: { iterations: number; toolCalls: OpenAIFunctionCall[] }) {
        if (toolCalls.length === 0) return undefined
        const sig = createToolCallsSignature(toolCalls)
        if (previousToolCallsSignature === sig) {
          return { stop: true, reason: 'stalled' }
        }
        previousToolCallsSignature = sig
        return undefined
      },

      onAfterIteration() {
        if (topics_added.length >= max_topics) {
          return { stop: true, reason: 'max_topics' }
        }
        return undefined
      },
    })

    const terminationReason = result.terminationReason as Exclude<
      ConversationMessageAgenticRunTerminationReason,
      'error'
    >
    const iterations = result.iterations

    if (agenticRunId) {
      const updateAgenticRunOutput =
        deps.updateConversationMessageAgenticRunOutput ?? updateConversationMessageAgenticRunOutput
      await updateAgenticRunOutput(
        agenticRunId,
        {
          topics_added: topics_added.map(t => ({ id: t.id, name: t.name })),
          iterations,
        },
        terminationReason,
      )
    }
  } catch (error) {
    if (agenticRunId) {
      const updateAgenticRunError =
        deps.updateConversationMessageAgenticRunError ?? updateConversationMessageAgenticRunError
      await updateAgenticRunError(agenticRunId, createErrorObject(error), 'error')
    }
    throw error
  }

  return { topics_added }
}
