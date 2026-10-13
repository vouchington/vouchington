import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { callCopyrightSubmissionGuidanceModel } from './model.mts'

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

const COUNTER_NOTICE_FIXTURE =
  'anthropic/messages-copyright-submission-guidance-counter-notice.http'
const HOLD_FIXTURE = 'anthropic/messages-copyright-submission-guidance-court-or-ccb-hold.http'
const INPUT = JSON.stringify({ statement: 'I created this image.', has_name: true })

type Checklist = {
  properties: Record<string, { items: { properties: Record<string, { enum: string[] }> } }>
}

describe('callCopyrightSubmissionGuidanceModel against recorded Anthropic responses', () => {
  beforeEach(() => {
    replay.reset()
  })

  it('sends the counter-notice checklist schema and returns the parsed guidance', async () => {
    replay.respondWith(loadRecordedResponse(COUNTER_NOTICE_FIXTURE))

    const result = await callCopyrightSubmissionGuidanceModel(
      'counter_notice',
      INPUT,
      'guidance-hash',
      ANTHROPIC_HAIKU_CALL,
    )

    const body = replay.requests[0]?.json<{ output_config: { format: { schema: Checklist } } }>()
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 2000,
      messages: [{ role: 'user', content: INPUT }],
      metadata: { user_id: 'guidance-hash' },
    })
    const schema = body?.output_config.format.schema
    expect(Object.keys(schema?.properties ?? {}).toSorted()).toEqual([
      'elements',
      'risk_notes',
      'summary',
    ])
    expect(schema?.properties['elements']?.items.properties['element']?.enum).toEqual([
      'signature',
      'material_identification',
      'has_good_faith_statement',
      'contact_and_jurisdiction_consent',
    ])
    expect(result.output).toMatchObject({
      elements: [
        { element: 'signature', status: 'present', gap: null },
        { element: 'material_identification', status: 'unclear' },
        { element: 'has_good_faith_statement', status: 'missing' },
        { element: 'contact_and_jurisdiction_consent', status: 'present' },
      ],
      risk_notes: [{ kind: 'good_faith_concern' }],
    })
    expect(result).toMatchObject({
      provider: 'anthropic',
      responseId: 'msg_01ReplayFixtureCounterNotice',
      usage: { inputTokens: 511, outputTokens: 17 },
    })
    replay.assertDrained()
  })

  it('sends the court-or-CCB hold criteria schema and returns the parsed guidance', async () => {
    replay.respondWith(loadRecordedResponse(HOLD_FIXTURE))

    const result = await callCopyrightSubmissionGuidanceModel(
      'court_or_ccb_hold',
      INPUT,
      'guidance-hash',
      ANTHROPIC_HAIKU_CALL,
    )

    const body = replay.requests[0]?.json<{ output_config: { format: { schema: Checklist } } }>()
    const schema = body?.output_config.format.schema
    expect(Object.keys(schema?.properties ?? {}).toSorted()).toEqual([
      'criteria',
      'risk_notes',
      'summary',
    ])
    expect(schema?.properties['criteria']?.items.properties['criterion']?.enum).toEqual([
      'is_from_original_claimant',
      'proceeding_kind',
      'commenced_at',
      'received_by_designated_agent_at',
      'is_same_material',
    ])
    expect(result.output).toMatchObject({
      criteria: [
        { criterion: 'is_from_original_claimant', status: 'present' },
        { criterion: 'proceeding_kind', status: 'present' },
        { criterion: 'commenced_at', status: 'missing' },
        { criterion: 'received_by_designated_agent_at', status: 'unclear' },
        { criterion: 'is_same_material', status: 'present' },
      ],
      risk_notes: [{ kind: 'timing_gap' }],
    })
    expect(result.responseId).toBe('msg_01ReplayFixtureLegalHold')
    replay.assertDrained()
  })

  it('rejects an answer for the other kind as a permanent invalid response that is still billed', async () => {
    // The kind picks the schema and parser, so a hold-shaped answer cannot pass as counter-notice.
    replay.respondWith(loadRecordedResponse(HOLD_FIXTURE))

    const failure: unknown = await callCopyrightSubmissionGuidanceModel(
      'counter_notice',
      INPUT,
      'guidance-hash',
      ANTHROPIC_HAIKU_CALL,
    ).catch((err: unknown) => err)

    expect(failure).toMatchObject({
      code: 'invalid-response',
      retryClass: 'permanent',
      billedResponse: {
        responseId: 'msg_01ReplayFixtureLegalHold',
        usage: { inputTokens: 511, outputTokens: 17 },
      },
    })
  })
})
