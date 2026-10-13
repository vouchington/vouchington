import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { callCopyrightFormScreeningModel } from './model.mts'

// The recorded Messages API body is served to the real `generateJson` through its `createMessage`
// dependency, so this agent's real schema validation and parser run on recorded wire JSON. The SDK
// transport is replayed in backend/modules/model-providers/generate.replay.no-data.mock.test.mts.
// The live counterpart is the non-gating smoke check in model.anthropic.test.mts.
const replay = await vi.hoisted(async () => {
  const { createAnthropicMessageReplay } =
    await import('../../test-helpers/anthropic-message-replay.mts')
  return createAnthropicMessageReplay()
})

vi.mock<typeof import('@modules/model-providers/generate')>(
  import('@modules/model-providers/generate'),
  async importOriginal => {
    const actual = await importOriginal()
    const { replayGenerateJson } = await import('../../test-helpers/anthropic-message-replay.mts')
    return { ...actual, generateJson: replayGenerateJson(actual.generateJson, replay) }
  },
)

const INPUT = JSON.stringify({
  source_kind: 'signed_in_form',
  jurisdiction: 'us_dmca',
  statutory_fields_complete: true,
  hosted_use_urls: ['https://voucha.ai/posts/example'],
})
const ELEMENTS = [
  'signature',
  'work_identification',
  'material_identification',
  'contact_information',
  'has_good_faith_statement',
  'accuracy_authority_statement',
]

describe('callCopyrightFormScreeningModel against a recorded Anthropic response', () => {
  beforeEach(() => {
    replay.reset()
  })

  it('sends the screening schema and input, and returns the parsed guidance with its billed usage', async () => {
    replay.respondWith(loadRecordedResponse('anthropic/messages-copyright-form-screening.http'))

    const result = await callCopyrightFormScreeningModel(
      INPUT,
      'screening-hash',
      ANTHROPIC_HAIKU_CALL,
    )

    expect(replay.requests[0]?.json()).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: INPUT }],
      metadata: { user_id: 'screening-hash' },
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            required: ['recommendation', 'rationale', 'guidance'],
            additionalProperties: false,
            properties: {
              recommendation: { enum: ['not_obviously_invalid', 'invalid_or_spam'] },
              guidance: {
                properties: {
                  elements: { items: { properties: { element: { enum: ELEMENTS } } } },
                },
              },
            },
          },
        },
      },
    })
    expect(result.output.recommendation).toBe('not_obviously_invalid')
    expect(result.output.guidance.elements.map(item => item.element)).toEqual(ELEMENTS)
    expect(result.output.guidance.suggested_action).toBe('approve_intake')
    expect(result).toMatchObject({
      provider: 'anthropic',
      responseId: 'msg_01ReplayFixtureFormScreening',
      usage: { inputTokens: 511, outputTokens: 17 },
    })
    replay.assertDrained()
  })

  it('rejects guidance that reports an element fewer than once as a permanent invalid response that is still billed', async () => {
    // The schema cannot require "each element exactly once"; the parser does.
    replay.respondWith(
      loadRecordedResponse('anthropic/messages-copyright-form-screening-missing-element.http'),
    )

    const failure: unknown = await callCopyrightFormScreeningModel(
      INPUT,
      'screening-hash',
      ANTHROPIC_HAIKU_CALL,
    ).catch((err: unknown) => err)

    expect(failure).toMatchObject({
      code: 'invalid-response',
      retryClass: 'permanent',
      billedResponse: {
        responseId: 'msg_01ReplayFixtureFormMissing',
        usage: { inputTokens: 511, outputTokens: 17 },
      },
    })
  })
})
