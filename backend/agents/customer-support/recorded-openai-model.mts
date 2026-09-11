import type { SupportAgentRun } from '@services/customer-support/types'

export function recordedOpenAIModel(agentRun: SupportAgentRun): string {
  if (agentRun.model_provider !== 'openai') {
    throw new Error(
      `generateSupportResponse: unsupported durable run provider: ${agentRun.model_provider}`,
    )
  }
  return agentRun.model_name
}
