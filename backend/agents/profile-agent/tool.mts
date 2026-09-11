import {
  createSubagentTool,
  sanitizeAndWrapUserInput,
  CHAT_SUBAGENT_RETRY_POLICY,
} from '@agents/_shared'
import getMyProfileTool from '@voucha/tools/get-my-profile'
import updateMyFinancialProfileTool from '@voucha/tools/update-my-financial-profile'
import manageMyCardsTool from '@voucha/tools/manage-my-cards'
import manageMyPointValuationsTool from '@voucha/tools/manage-my-point-valuations'
import manageMyRewardsStatusesTool from '@voucha/tools/manage-my-rewards-statuses'
import manageMySpendingTool from '@voucha/tools/manage-my-spending'
import searchTopicsTool from '@voucha/tools/search-topics'
import { PROFILE_SYSTEM_PROMPT } from './build-system-prompt.mts'

interface ProfileAgentArgs {
  task: string
  context?: string
}

const profileAgentTool = createSubagentTool<ProfileAgentArgs>({
  name: 'run_profile_agent',
  description:
    'Delegates profile management tasks to a specialized agent. Use when the user wants to update their wallet, cards, spending categories, point valuations, rewards program statuses, or financial profile. The agent checks current state before making changes and handles multiple updates in a single run.',
  parameters: {
    type: 'object',
    properties: {
      task: {
        type: 'string',
        description: 'Description of what profile changes to make',
      },
      context: {
        type: 'string',
        description: 'Relevant context from the conversation to help with the task',
      },
    },
    required: ['task'],
  },
  agentName: 'profile',
  systemPrompt: PROFILE_SYSTEM_PROMPT,
  maxIterations: 8,
  maxRetries: CHAT_SUBAGENT_RETRY_POLICY.maxRetries,
  toolEntries: [
    getMyProfileTool,
    updateMyFinancialProfileTool,
    manageMyCardsTool,
    manageMyPointValuationsTool,
    manageMyRewardsStatusesTool,
    manageMySpendingTool,
    searchTopicsTool,
  ],
  getInput: async (args: ProfileAgentArgs) => {
    const task = await sanitizeAndWrapUserInput(args.task, 'profile_agent_task')
    if (!args.context) return task

    const context = await sanitizeAndWrapUserInput(args.context, 'profile_agent_context')
    return `${task}\n\nConversation context:\n${context}`
  },
})

export { profileAgentTool }
