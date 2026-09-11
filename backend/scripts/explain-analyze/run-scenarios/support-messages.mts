import { runAndCapture } from '../run-support.mts'
import {
  finalizeKeyedSupportAgentRun,
  getSupportMessagesByThreadId,
  reserveSupportDraftGeneration,
} from '../run-services.mts'
import { SUPPORT_MESSAGE_SEED } from '../seed-data/support-messages.mts'

export async function runSupportMessageScenarios(): Promise<void> {
  const { page_info: middleMessagePageInfo } = await getSupportMessagesByThreadId(
    SUPPORT_MESSAGE_SEED.threadId,
    { limit: 1, atOrBeforeMessageId: SUPPORT_MESSAGE_SEED.middleMessageId },
  )
  const middleMessageCursor = middleMessagePageInfo.start_cursor
  if (!middleMessageCursor)
    throw new Error('Seeded middle support message did not produce a cursor')

  await runAndCapture(
    'support-messages-page',
    () => getSupportMessagesByThreadId(SUPPORT_MESSAGE_SEED.threadId, { limit: 25 }),
    undefined,
    'getSupportMessagesByThreadId',
  )
  await runAndCapture(
    'support-messages-page-after',
    () =>
      getSupportMessagesByThreadId(SUPPORT_MESSAGE_SEED.threadId, {
        limit: 25,
        after: middleMessageCursor,
      }),
    undefined,
    'getSupportMessagesByThreadId',
  )
  await runAndCapture(
    'support-messages-page-at-or-before',
    () =>
      getSupportMessagesByThreadId(SUPPORT_MESSAGE_SEED.threadId, {
        limit: 25,
        atOrBeforeMessageId: SUPPORT_MESSAGE_SEED.middleMessageId,
      }),
    undefined,
    'getSupportMessagesByThreadId',
  )
  await runAndCapture(
    'support-draft-generation-reservation',
    () =>
      reserveSupportDraftGeneration(SUPPORT_MESSAGE_SEED.threadId, {
        modelName: 'gpt-5.4-nano',
        modelProvider: 'openai',
      }),
    undefined,
    'reserveSupportDraftGeneration',
  )
  await runAndCapture(
    'support-agent-run-finalize',
    () =>
      finalizeKeyedSupportAgentRun({
        threadId: SUPPORT_MESSAGE_SEED.threadId,
        supportMessageId: SUPPORT_MESSAGE_SEED.latestInboundMessageId,
        agentRunId: SUPPORT_MESSAGE_SEED.completedKeyedRunId,
        claimToken: SUPPORT_MESSAGE_SEED.completedKeyedRunClaimToken,
        responseText: null,
        iterations: 0,
        terminationReason: 'no_tool_calls',
      }),
    undefined,
    'finalizeKeyedSupportAgentRunLockThread',
  )
}
