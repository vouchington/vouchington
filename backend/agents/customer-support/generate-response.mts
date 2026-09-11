import {
  runToolLoop,
  buildAgentTools,
  DEFAULT_AGENT_MODEL,
  QUEUED_BACKGROUND_RETRY_POLICY,
} from '@agents/_shared'
import {
  getSupportMessagesByThreadId,
  getSupportThreadById,
  createSupportDraftMessage,
  finalizeKeyedSupportAgentRun,
  createSupportAgentRun,
  claimKeyedSupportAgentRun,
  updateSupportAgentRunOutput,
  getCustomerSupportAgentUser,
  getSupportAgentRunByIdempotencyKey,
  type SupportAgentRunTerminationReason,
} from '@services/customer-support'
import { sanitizePromptInjection, wrapExternalContent } from '@jongleberry/vurst-prompt'
import searchSupportMessagesTool from '@voucha/tools/search-support-messages'
import searchPostsTool from '@voucha/tools/search-posts'
import searchRssFeedItemsTool from '@voucha/tools/search-rss-feed-items'
import { SUPPORT_AGENT_SYSTEM_PROMPT } from './build-system-prompt.mts'
import onError from '@modules/on-error'
import type { GenerateSupportResponseDeps } from './types.mts'
import { reloadKeyedSupportContext } from './reload-keyed-support-context.mts'
import { recordedOpenAIModel } from './recorded-openai-model.mts'
import { handleSupportAgentRunError } from './handle-agent-run-error.mts'

export type { GenerateSupportResponseDeps }
const MAX_ITERATIONS = 5

export async function generateSupportResponse(
  threadId: string,
  deps: GenerateSupportResponseDeps = {},
): Promise<void> {
  const getThreadById = deps.getSupportThreadById ?? getSupportThreadById
  const getMessagesByThreadId = deps.getSupportMessagesByThreadId ?? getSupportMessagesByThreadId
  const createDraftMessage = deps.createSupportDraftMessage ?? createSupportDraftMessage
  const finalizeKeyedAgentRun = deps.finalizeKeyedSupportAgentRun ?? finalizeKeyedSupportAgentRun
  const createAgentRun = deps.createSupportAgentRun ?? createSupportAgentRun
  const claimAgentRun = deps.claimKeyedSupportAgentRun ?? claimKeyedSupportAgentRun
  const updateAgentRunOutput = deps.updateSupportAgentRunOutput ?? updateSupportAgentRunOutput
  const getAgentUser = deps.getCustomerSupportAgentUser ?? getCustomerSupportAgentUser
  const getAgentRunByIdempotencyKey =
    deps.getSupportAgentRunByIdempotencyKey ?? getSupportAgentRunByIdempotencyKey
  const runLoop = deps.runToolLoop ?? runToolLoop
  const supportPrompt = deps.buildSupportAgentSystemPrompt ?? SUPPORT_AGENT_SYSTEM_PROMPT
  const thread = deps.idempotencyKey
    ? await getThreadById(threadId, { readOnly: false })
    : await getThreadById(threadId)
  if (!thread) {
    const error = new Error(`generateSupportResponse: thread not found: ${threadId}`)
    onError(error)
    if (deps.idempotencyKey) throw error
    return
  }
  const authoritativeRun = deps.idempotencyKey
    ? await getAgentRunByIdempotencyKey(deps.idempotencyKey)
    : null
  const supportMessageId =
    authoritativeRun?.support_thread_id === threadId
      ? authoritativeRun.support_message_id
      : deps.supportMessageId
  let { results: messages } = await getMessagesByThreadId(threadId, {
    limit: 20,
    ...(supportMessageId && { atOrBeforeMessageId: supportMessageId }),
    ...(deps.idempotencyKey && { readOnly: false }),
  })
  if (messages.length === 0) {
    if (deps.idempotencyKey) {
      throw new Error(`generateSupportResponse: message window is empty: ${supportMessageId}`)
    }
    return
  }
  const triggeringInbound = supportMessageId
    ? messages.find(message => message.id === supportMessageId)
    : messages.findLast(message => message.direction === 'inbound')
  if (!triggeringInbound || triggeringInbound.direction !== 'inbound') {
    if (deps.idempotencyKey) {
      throw new Error(
        `generateSupportResponse: triggering inbound message is unavailable: ${supportMessageId}`,
      )
    }
    return
  }
  const agentRunParams = {
    supportThreadId: threadId,
    supportMessageId: triggeringInbound.id,
    modelName: DEFAULT_AGENT_MODEL,
    modelProvider: 'openai',
    input: { thread_subject: thread.subject, message_count: messages.length },
  } as const
  const agentRun = deps.idempotencyKey
    ? await claimAgentRun({
        ...agentRunParams,
        idempotencyKey: deps.idempotencyKey,
        reclaimLiveLease: deps.reclaimLiveLease,
      })
    : await createAgentRun(agentRunParams)
  if (!agentRun) return
  if (deps.idempotencyKey && !agentRun.claim_token) {
    throw new Error(`Keyed support agent run ${agentRun.id} is missing its claim token`)
  }
  if (deps.idempotencyKey && agentRun.support_message_id !== supportMessageId) {
    messages = await reloadKeyedSupportContext(threadId, agentRun, getMessagesByThreadId)
  }
  try {
    const model = recordedOpenAIModel(agentRun)
    const [sanitizedSubject, sanitizedMessages] = await Promise.all([
      sanitizePromptInjection(thread.subject, { isTitle: true }),
      Promise.all(
        messages.map(async msg => {
          const role = msg.direction === 'inbound' ? 'Customer' : 'Support'
          const sanitizedBody = await sanitizePromptInjection(msg.body_text)
          return `${role}: ${sanitizedBody}`
        }),
      ),
    ])
    const rawInput = [`Support Thread: ${sanitizedSubject}`, '', ...sanitizedMessages].join('\n')
    const input = wrapExternalContent(rawInput, {
      source: 'user_message',
      contentType: 'support-thread',
    })
    const supportAgentUser = await getAgentUser()
    const { agentTools: tools } = buildAgentTools(supportAgentUser, [
      searchSupportMessagesTool,
      searchPostsTool,
      searchRssFeedItemsTool,
    ])
    const {
      text: responseText,
      iterations,
      terminationReason,
    } = await runLoop({
      model,
      instructions: supportPrompt,
      tools,
      input,
      maxIterations: MAX_ITERATIONS,
      safetyIdentifier: 'support-agent',
      agentSlug: 'customer-support',
      maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries,
      extraParams: {
        service_tier: 'flex',
        prompt_cache_key: 'support-agent-v1',
      },
    })
    const supportTerminationReason = terminationReason as Exclude<
      SupportAgentRunTerminationReason,
      'error'
    >
    if (deps.idempotencyKey) {
      await finalizeKeyedAgentRun({
        threadId,
        supportMessageId: agentRun.support_message_id,
        agentRunId: agentRun.id,
        claimToken: agentRun.claim_token!,
        responseText,
        iterations,
        terminationReason: supportTerminationReason,
      })
    } else {
      if (responseText) {
        await createDraftMessage(threadId, {
          bodyText: responseText,
          agentRunId: agentRun.id,
        })
      }
      await updateAgentRunOutput(
        agentRun.id,
        { response: responseText, iterations },
        supportTerminationReason,
      )
    }
  } catch (error) {
    await handleSupportAgentRunError(
      error,
      agentRun.id,
      deps.idempotencyKey ? agentRun.claim_token! : null,
      deps,
    )
  }
}
