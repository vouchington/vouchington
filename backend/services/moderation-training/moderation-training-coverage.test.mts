import { describe, expect, it } from 'vitest'
import { getPromptTestTrainingLabel } from './prompt-test-label.mts'
import {
  decodeRecentAutomodActionsCursor,
  encodeRecentAutomodActionsCursor,
  normalizeRecentAction,
  type RawRecentAutomodAction,
} from './recent-actions-utils.mts'

describe('moderation-training feedback coverage', () => {
  it('maps prompt test expectations to training labels', () => {
    expect(getPromptTestTrainingLabel(true, true)).toBe('true_positive')
    expect(getPromptTestTrainingLabel(true, false)).toBe('false_negative_candidate')
    expect(getPromptTestTrainingLabel(false, true)).toBe('false_positive')
    expect(getPromptTestTrainingLabel(false, false)).toBe('true_negative')
  })

  it('normalizes recent action rows and defensive cursors', () => {
    const actionAt = new Date()
    const raw = {
      source_key: 'openai_omni:00000000-0000-0000-0000-000000000001',
      source_type: 'openai_omni',
      post_id: '00000000-0000-0000-0000-000000000001',
      community_id: '00000000-0000-0000-0000-000000000002',
      agent_moderation_id: null,
      moderator_slug: null,
      title: 'Title',
      authored_title: 'Title',
      declared_language: null,
      lingua_rs_detected_language: null,
      markdown_preview: 'Preview',
      post_type: 'discussion',
      post_href: '/discussion/00000000-0000-0000-0000-000000000001',
      created_at: new Date(),
      action_at: actionAt,
      confidence_score: 'not-a-number',
      flagged: true,
      reason: null,
      categories: ['spam', 123, 'abuse'],
      model_output: null,
      current_state: 'rejected',
      feedback_label: null,
    } satisfies RawRecentAutomodAction

    expect(normalizeRecentAction(raw)).toMatchObject({
      confidence_score: null,
      categories: ['spam', 'abuse'],
    })
    expect(decodeRecentAutomodActionsCursor(encodeRecentAutomodActionsCursor(raw))).toMatchObject({
      confidenceScore: null,
      actionAt: actionAt.toISOString(),
      sourceKey: raw.source_key,
    })
    expect(decodeRecentAutomodActionsCursor('not-json')).toBeNull()
    expect(
      decodeRecentAutomodActionsCursor(
        Buffer.from(JSON.stringify({ a: 'not-a-date', c: null, k: raw.source_key })).toString(
          'base64url',
        ),
      ),
    ).toBeNull()
  })
})
