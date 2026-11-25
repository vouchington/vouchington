import { simplePaginationParser } from '@modules/pagination'
import { getConversationMessagesByConversationId } from '@services/conversations-messages/messages'
import { registerScenarioContract } from '../plan-expectations.mts'
import { runAndCapture } from '../run-support.mts'
import { seedUuid } from '../seed-data/common.mts'

export async function runConversationMessageCapacityScenario(): Promise<void> {
  const scenario = 'conversation-messages-at-cap'
  const limit = simplePaginationParser.queryContract.limit.maximum
  const rowsWithLookahead = limit + 1
  registerScenarioContract(scenario, {
    expectations: [
      { kind: 'singleLeaf', parent: 'conversation_messages', key: 'conversation_id' },
      { kind: 'maxProcessedRows', relation: 'conversation_messages', max: rowsWithLookahead },
    ],
  })

  await runAndCapture(
    scenario,
    async () => {
      const messages = await getConversationMessagesByConversationId(seedUuid(0, '0b'), {
        limit,
        probeForNextPage: true,
      })
      if (
        messages.length !== rowsWithLookahead ||
        messages.some((message, index) => index > 0 && message.id <= messages[index - 1]!.id)
      ) {
        throw new Error('The conversation must fill the maximum page and lookahead in ID order')
      }
    },
    undefined,
    'getConversationMessagesByConversationId',
    { exactCapturedNames: ['getConversationMessagesByConversationId'] },
  )
}
