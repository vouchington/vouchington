import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { callCopyrightEmailIntakeModel } from './model.mts'

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
  senderEmail: 'claimant@example.test',
  subject: 'Copyright complaint',
  bodyText: 'My photograph is hosted at https://voucha.ai/posts/example without my permission.',
  attachments: [],
})

describe('callCopyrightEmailIntakeModel against a recorded Anthropic response', () => {
  beforeEach(() => {
    replay.reset()
  })

  it('sends the extraction schema and input, and returns the parsed extraction with its billed usage', async () => {
    replay.respondWith(loadRecordedResponse('anthropic/messages-copyright-email-intake.http'))

    const result = await callCopyrightEmailIntakeModel(INPUT, 'intake-hash', ANTHROPIC_HAIKU_CALL)

    const body = replay.requests[0]?.json<{
      output_config: { format: { schema: { properties: object; required: string[] } } }
    }>()
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 4000,
      messages: [{ role: 'user', content: INPUT }],
      metadata: { user_id: 'intake-hash' },
      output_config: {
        format: {
          type: 'json_schema',
          schema: {
            additionalProperties: false,
            properties: {
              recommendation: {
                enum: ['invalid_or_spam', 'requires_information', 'potentially_valid'],
              },
              submission_kind: {
                enum: [
                  'notice',
                  'appeal',
                  'counter_notice',
                  'withdrawal',
                  'court_or_ccb_hold',
                  'supplement',
                ],
              },
            },
          },
        },
      },
    })
    // Every property is required, so the model always states null for what the email lacks.
    const { properties, required } = body?.output_config.format.schema ?? {}
    expect(required?.toSorted()).toEqual(Object.keys(properties ?? {}).toSorted())
    expect(result.output).toMatchObject({
      recommendation: 'potentially_valid',
      submission_kind: 'notice',
      claimant_email: 'claimant@example.test',
      target_urls: ['https://voucha.ai/posts/example'],
      source_evidence: [{ field: 'target_url' }],
    })
    expect(result).toMatchObject({
      provider: 'anthropic',
      responseId: 'msg_01ReplayFixtureEmailIntake',
      usage: { inputTokens: 511, outputTokens: 17 },
    })
    replay.assertDrained()
  })

  it('rejects more target URLs than the bound as a permanent invalid response that is still billed', async () => {
    replay.respondWith(
      loadRecordedResponse('anthropic/messages-copyright-email-intake-too-many-targets.http'),
    )

    const failure: unknown = await callCopyrightEmailIntakeModel(
      INPUT,
      'intake-hash',
      ANTHROPIC_HAIKU_CALL,
    ).catch((err: unknown) => err)

    expect(failure).toMatchObject({
      code: 'invalid-response',
      retryClass: 'permanent',
      billedResponse: {
        responseId: 'msg_01ReplayFixtureEmailTargets',
        usage: { inputTokens: 511, outputTokens: 17 },
      },
    })
  })
})
