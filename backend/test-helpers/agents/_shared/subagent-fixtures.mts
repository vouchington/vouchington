/**
 * Test fixture setup for subagent mock tests.
 *
 * Shared by research-agent, profile-agent, and discovery-agent tool.mock.test.mts.
 * Calls real service functions through source-relative imports so centralizing
 * the helper does not introduce cyclic workspace-manifest dependencies.
 */

import { createTestUser } from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
  createConversationMessageAgenticRun,
} from '../../../services/conversations-messages/create.mts'
import type { PrivateUser } from '../../../services/users/types.mts'

export interface SubagentTestFixtures {
  testUser: PrivateUser
  parentRunId: string
}

/**
 * Creates a test user and a parent agentic run for FK-constraint satisfaction.
 * Call inside beforeAll; pass a unique label to identify this agent in run records.
 */
export async function setupSubagentFixtures(label: string): Promise<SubagentTestFixtures> {
  const user = await createTestUser()
  if (!user) throw new Error('Failed to create test user')

  const parentConversation = await createConversation(user.id, `${label} Parent Run`)
  const parentMessage = await createConversationMessage(parentConversation.id, user.id, {
    role: 'assistant',
    content: null,
  })
  const parentRun = await createConversationMessageAgenticRun({
    conversationId: parentConversation.id,
    conversationMessageId: parentMessage.id,
    modelName: 'gpt-5.4-nano',
    modelProvider: 'openai',
    input: { message: 'test' },
  })

  return { testUser: user, parentRunId: parentRun.id }
}
