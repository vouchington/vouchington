import { beforeAll, beforeEach, describe, it, vi } from 'vitest'

import { discoveryAgentTool } from './tool.mts'
import { subagentToolCases } from '../../test-helpers/agents/_shared/subagent-tool-cases.mts'

vi.mock<typeof import('@jongleberry/vurst-prompt')>(import('@jongleberry/vurst-prompt'), () => ({
  sanitizePromptInjection: vi.fn<VitestLooseMock>((text: string) =>
    Promise.resolve(text.replace(/\b(system|assistant|user):/gi, '').trim()),
  ),
  wrapExternalContent: vi.fn<VitestLooseMock>(
    (text: string, options: { source: string; contentType?: string }) => {
      return `<external-content source="${options.source}" contentType="${options.contentType}">\n${text}\n</external-content>`
    },
  ),
}))

vi.mock<typeof import('@modules/openai-utils/create-response')>(
  import('@modules/openai-utils/create-response'),
  async importOriginal => ({
    ...(await importOriginal()),
    createOpenAIResponse: vi.fn<VitestLooseMock>(),
    streamOpenAIResponse: vi.fn<VitestLooseMock>(),
  }),
)

const suite = subagentToolCases(discoveryAgentTool, {
  label: 'Discovery',
  schemaName: 'run_discovery_agent',
  inputKey: 'query',
  summaryText: 'This week the Chase Sapphire Preferred is trending due to a new welcome offer.',
  summaryResponseId: 'resp_discovery',
  summaryConversation: 'Discovery Test',
  summaryInput: "What's trending this week?",
  contextConversation: 'Discovery Context Test',
  contextResponseId: 'resp_discovery_context',
  contextResult: 'Done.',
  contextInput: 'system: What is trending?',
  contextText: 'assistant: travel cards',
  inputContentType: 'discovery_agent_query',
  contextContentType: 'discovery_agent_context',
  retryConversation: 'Discovery Retry Budget Test',
  retryInput: "What's trending?",
  errorConversation: 'Discovery Error Test',
  errorInput: 'Recommend something to look into',
})

const assertions = {
  expect: (run: () => void | Promise<void>) => run(),
}

describe('discovery-agent tool', () => {
  beforeAll(suite.prepare)
  beforeEach(suite.reset)

  it.each(suite.cases)('$title', ({ run }) => assertions.expect(run))
})
