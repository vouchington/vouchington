import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  setAgentResponseStartedAt,
  setChatAgenticRunStartedAt,
} from '@voucha/test-helpers'
import { createAgentResponse } from './create.mts'
import { getAgentResponseById } from './get.mts'
import { updateAgentResponseCompleted, updateAgentResponseStarted } from './update.mts'
import {
  RUNTIME_GENERATION_INTERRUPTED_ERROR,
  getStaleRuntimeGenerationJobs,
  reconcileStaleRuntimeGenerations,
} from './reconcile-runtime-generations.mts'
import {
  createConversation,
  createConversationMessage,
  createConversationMessageAgenticRun,
} from '../conversations-messages/create.mts'
import { getConversationMessagesByConversationId } from '../conversations-messages/messages.mts'
import { getConversationMessageAgenticRunsByConversationMessageId } from '../conversations-messages/agentic-runs.mts'
import { finalizeChatAgenticRun } from '../conversations-messages/update.mts'
import type { PrivateUser } from '@services/users/types'
import {
  getConversationById,
  updateConversationLastResponseId,
} from '../conversations-messages/conversations.mts'

describe('reconcileStaleRuntimeGenerations', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('selects a stable ordered primary batch and finalizes only those candidates', async () => {
    const responses = await Promise.all(
      ['first', 'second', 'not-selected', 'fresh'].map(task =>
        createAgentResponse({ createdById: user.id, agent: 'research', input: { task } }),
      ),
    )
    await Promise.all(
      responses.map(response => updateAgentResponseStarted(response.id, `job-${response.id}`)),
    )
    for (const [index, response] of responses.slice(0, 3).entries()) {
      await setAgentResponseStartedAt(response.id, new Date(`1900-01-01T00:00:0${index}Z`))
    }

    const batch = await getStaleRuntimeGenerationJobs({ batchSize: 2 })

    expect(batch.candidates).toHaveLength(2)
    expect(batch.candidates).toEqual(
      [...batch.candidates].sort(
        (a, b) => a.startedAt.getTime() - b.startedAt.getTime() || a.id.localeCompare(b.id),
      ),
    )
    await expect(getAgentResponseById(responses[3]!.id)).resolves.toMatchObject({
      failed_at: null,
    })
    await reconcileStaleRuntimeGenerations({
      cutoff: new Date('2000-01-01T00:00:00Z'),
      candidates: responses.slice(0, 3).map((response, index) => ({
        kind: 'agent-response',
        id: response.id,
        signalJobId: `job-${response.id}`,
        startedAt: new Date(`1900-01-01T00:00:0${index}Z`),
      })),
    })
  })

  it('reconciles a selected row whose PostgreSQL timestamp has sub-millisecond precision', async () => {
    const response = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'microsecond timestamp' },
    })
    await updateAgentResponseStarted(response.id, `job-${response.id}`)
    await setAgentResponseStartedAt(response.id, '1950-01-01 00:00:00.000123+00')

    const selected = await getStaleRuntimeGenerationJobs()
    const candidate = selected.candidates.find(item => item.id === response.id)
    expect(candidate).toBeDefined()
    if (!candidate) throw new Error('Expected microsecond candidate in bounded batch')
    expect(candidate.startedAt.getMilliseconds()).toBe(0)

    await expect(
      reconcileStaleRuntimeGenerations({ cutoff: selected.cutoff, candidates: [candidate] }),
    ).resolves.toEqual({ agentResponses: 1, chats: 0, agentResponseIds: [response.id] })
    await expect(getAgentResponseById(response.id)).resolves.toMatchObject({
      failed_at: expect.any(Date),
      termination_reason: 'stalled',
    })
  })

  it('terminalizes stale agent and chat generations but leaves fresh work active', async () => {
    const staleAgent = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'stale' },
    })
    const freshAgent = await createAgentResponse({
      createdById: user.id,
      agent: 'research',
      input: { task: 'fresh' },
    })
    await updateAgentResponseStarted(staleAgent.id, 'stale-agent-job')
    await updateAgentResponseStarted(freshAgent.id, 'fresh-agent-job')
    const staleAgentStartedAt = new Date('1901-01-01T00:00:00Z')
    await setAgentResponseStartedAt(staleAgent.id, staleAgentStartedAt)

    const conversation = await createConversation(user.id, 'Runtime reconciliation')
    const staleMessage = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: 'partial',
    })
    const freshMessage = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const staleRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: staleMessage.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: {},
    })
    await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: freshMessage.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: {},
    })
    const staleChatStartedAt = new Date('1901-01-01T00:00:01Z')
    await setChatAgenticRunStartedAt(staleRun.id, staleChatStartedAt)

    const batch = {
      cutoff: new Date('2000-01-01T00:00:00Z'),
      candidates: [
        {
          kind: 'agent-response' as const,
          id: staleAgent.id,
          signalJobId: 'stale-agent-job',
          startedAt: staleAgentStartedAt,
        },
        {
          kind: 'chat' as const,
          id: staleRun.id,
          signalJobId: `chat_${staleMessage.id}`,
          startedAt: staleChatStartedAt,
        },
      ],
    }
    await expect(reconcileStaleRuntimeGenerations(batch)).resolves.toEqual({
      agentResponses: 1,
      chats: 1,
      agentResponseIds: [staleAgent.id],
    })

    await expect(getAgentResponseById(staleAgent.id)).resolves.toMatchObject({
      termination_reason: 'stalled',
      failed_at: expect.any(Date),
    })
    await expect(getAgentResponseById(freshAgent.id)).resolves.toMatchObject({ failed_at: null })
    await expect(
      updateAgentResponseCompleted(staleAgent.id, { content: 'late output' }, 'no_tool_calls'),
    ).resolves.toBeUndefined()
    const staleRuns = await getConversationMessageAgenticRunsByConversationMessageId(
      staleMessage.id,
    )
    const freshRuns = await getConversationMessageAgenticRunsByConversationMessageId(
      freshMessage.id,
    )
    expect(staleRuns[0]).toMatchObject({ status: 'failed' })
    expect(freshRuns[0]).toMatchObject({ status: 'running' })
    const messages = await getConversationMessagesByConversationId(conversation.id)
    expect(messages.find(message => message.id === staleMessage.id)?.content).toEqual({
      role: 'assistant',
      content: 'partial',
      error: RUNTIME_GENERATION_INTERRUPTED_ERROR,
    })
    await expect(
      finalizeChatAgenticRun({
        id: staleRun.id,
        conversationId: conversation.id,
        conversationMessageId: staleMessage.id,
        content: 'late worker output',
        terminationReason: 'no_tool_calls',
      }),
    ).resolves.toBe(false)
    const afterLateCompletion = await getConversationMessagesByConversationId(conversation.id)
    expect(afterLateCompletion.find(message => message.id === staleMessage.id)?.content).toEqual({
      role: 'assistant',
      content: 'partial',
      error: RUNTIME_GENERATION_INTERRUPTED_ERROR,
    })
  })

  it('clears stale non-OpenAI cursors while preserving OpenAI cursors', async () => {
    const openAIConversation = await createConversation(user.id, 'Stale OpenAI cursor')
    const anthropicConversation = await createConversation(user.id, 'Stale Anthropic cursor')
    const casLoserConversation = await createConversation(user.id, 'Completed Anthropic cursor')
    await Promise.all([
      updateConversationLastResponseId(openAIConversation.id, 'response_openai'),
      updateConversationLastResponseId(anthropicConversation.id, 'response_anthropic'),
      updateConversationLastResponseId(casLoserConversation.id, 'response_old'),
    ])
    const openAIMessage = await createConversationMessage(openAIConversation.id, user.id, {
      role: 'assistant',
      content: 'partial',
    })
    const anthropicMessage = await createConversationMessage(anthropicConversation.id, user.id, {
      role: 'assistant',
      content: 'partial',
    })
    const casLoserMessage = await createConversationMessage(casLoserConversation.id, user.id, {
      role: 'assistant',
      content: 'partial',
    })
    const openAIRun = await createConversationMessageAgenticRun({
      conversationId: openAIConversation.id,
      conversationMessageId: openAIMessage.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: {},
    })
    const anthropicRun = await createConversationMessageAgenticRun({
      conversationId: anthropicConversation.id,
      conversationMessageId: anthropicMessage.id,
      modelName: 'claude-sonnet-5',
      modelProvider: 'anthropic',
      input: {},
    })
    const casLoserRun = await createConversationMessageAgenticRun({
      conversationId: casLoserConversation.id,
      conversationMessageId: casLoserMessage.id,
      modelName: 'claude-sonnet-5',
      modelProvider: 'anthropic',
      input: {},
    })
    const startedAt = new Date('1901-01-01T00:00:00Z')
    await Promise.all([
      setChatAgenticRunStartedAt(openAIRun.id, startedAt),
      setChatAgenticRunStartedAt(anthropicRun.id, startedAt),
      setChatAgenticRunStartedAt(casLoserRun.id, startedAt),
    ])
    await finalizeChatAgenticRun({
      id: casLoserRun.id,
      conversationId: casLoserConversation.id,
      conversationMessageId: casLoserMessage.id,
      content: 'completed',
      terminationReason: 'no_tool_calls',
    })
    await updateConversationLastResponseId(casLoserConversation.id, 'response_newer')

    await reconcileStaleRuntimeGenerations({
      cutoff: new Date('2000-01-01T00:00:00Z'),
      candidates: [
        {
          kind: 'chat',
          id: openAIRun.id,
          signalJobId: `chat_${openAIMessage.id}`,
          startedAt,
        },
        {
          kind: 'chat',
          id: anthropicRun.id,
          signalJobId: `chat_${anthropicMessage.id}`,
          startedAt,
        },
        {
          kind: 'chat',
          id: casLoserRun.id,
          signalJobId: `chat_${casLoserMessage.id}`,
          startedAt,
        },
      ],
    })

    await expect(getConversationById(openAIConversation.id)).resolves.toMatchObject({
      last_response_id: 'response_openai',
    })
    await expect(getConversationById(anthropicConversation.id)).resolves.toMatchObject({
      last_response_id: null,
    })
    await expect(getConversationById(casLoserConversation.id)).resolves.toMatchObject({
      last_response_id: 'response_newer',
    })
  })
})
