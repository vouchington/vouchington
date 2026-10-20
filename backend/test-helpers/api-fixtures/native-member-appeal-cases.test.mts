import { describe, expect, it } from 'vitest'
import { redactModerationAppeal } from '../../services/moderation-appeals/redaction.mts'
import { nativeModerationApiFixtureCases } from './native-moderation-cases.mts'
import { backendResponseContracts } from './response-contracts.mts'
import { responseBody } from './static-response-bodies.mts'

function body(id: string): Record<string, unknown> {
  const fixture = nativeModerationApiFixtureCases.find(fixture => fixture.id === id)
  expect(fixture).toBeDefined()
  expect(fixture!.auth).toBe('fixture-user')
  return fixture!.body as Record<string, unknown>
}

describe('native member appeal fixtures', () => {
  it('keeps member read identity and submission privacy on their public projections', () => {
    const list = body('native.moderation.appeals.member.default')
    const detail = body('native.moderation.appeals.detail.member.default')
    const submission = body('native.moderation.appeals.create.member.default')
    expect(
      nativeModerationApiFixtureCases.find(
        fixture => fixture.id === 'native.moderation.appeals.create.member.default',
      )?.requestBody,
    ).toEqual({
      target_type: 'suspension',
      appeal_reason: '[other] Please review this again.',
    })
    const staff = responseBody('native.moderation.appeals.default') as {
      appeals: Parameters<typeof redactModerationAppeal>[0][]
    }
    const appeal = (list.appeals as unknown[])[0]
    expect(appeal).toEqual(redactModerationAppeal(staff.appeals[0]!))
    expect(detail.appeal).toEqual(appeal)
    expect(submission).toMatchObject({
      isDuplicate: false,
      appeal: {
        id: '00000000-0000-7000-8000-000000000103',
        post_id: null,
        public_response: null,
        user_suspension_id: '00000000-0000-7000-8000-000000000104',
      },
    })
    for (const field of [
      'ai_draft_requested_run_id',
      'ai_draft_run_id',
      'case_id',
      'appellant_user_id',
      'appeal_reason',
      'recommended_action',
      'ai_public_response',
      'ai_internal_response',
      'model',
      'ai_drafted_at',
      'internal_notes',
      'drafted_at',
      'edited_at',
      'edited_by_id',
      'approved_by_id',
      'resolved_by_id',
      'latest_lifecycle_change_id',
      'staff_context',
    ]) {
      expect(submission.appeal).not.toHaveProperty(field)
    }
  })

  it('forwards a member-scoped cursor and terminates the second owned page', () => {
    const first = body('native.moderation.appeals.member.default')
    const second = body('native.moderation.appeals.member.page-2')
    const page = first.page_info as { end_cursor: string; has_next_page: boolean }
    expect(page.has_next_page).toBe(true)
    expect(JSON.parse(Buffer.from(page.end_cursor, 'base64url').toString())).toEqual({
      id: '00000000-0000-7000-8000-000000000102',
      scope: 'appeals:pending:user-1:id-desc',
    })
    const fixture = nativeModerationApiFixtureCases.find(
      fixture => fixture.id === 'native.moderation.appeals.member.page-2',
    )!
    expect(fixture.query?.after).toBe(page.end_cursor)
    expect(second.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect((second.appeals as Array<{ id: string }>)[0]!.id).toBe(
      '00000000-0000-7000-8000-000000000101',
    )
  })

  it('hides an unsent approved response but exposes the sent resolved response', () => {
    const approved = responseBody('native.moderation.appeals.approval.default') as {
      appeal: Parameters<typeof redactModerationAppeal>[0]
    }
    expect(approved.appeal.public_response).toEqual(expect.any(String))
    expect(approved.appeal.sent_at).toBeNull()
    expect(redactModerationAppeal(approved.appeal).public_response).toBeNull()
    const pending = body('native.moderation.appeals.detail.member.default').appeal
    expect(pending).toHaveProperty('public_response', null)
    const sent = body('native.moderation.appeals.detail.member.sent').appeal
    expect(sent).toMatchObject({
      status: 'resolved',
      public_response: approved.appeal.public_response,
    })
    expect(sent).toHaveProperty('sent_at', expect.any(String))
    expect(body('native.moderation.appeals.member.resolved').appeals).toEqual([sent])
  })

  it('publishes only explicit public contracts without protected staff properties', () => {
    for (const key of [
      'GET:/api/v1/appeals#member',
      'GET:/api/v1/appeals/:id#member',
      'POST:/api/v1/appeals#member',
    ]) {
      const contract = backendResponseContracts[key]
      expect(contract).toBeDefined()
      const schema = JSON.stringify(contract!.schema)
      for (const field of [
        'ai_draft_requested_run_id',
        'ai_draft_run_id',
        'case_id',
        'appellant_user_id',
        'appeal_reason',
        'recommended_action',
        'ai_public_response',
        'ai_internal_response',
        'model',
        'ai_drafted_at',
        'internal_notes',
        'drafted_at',
        'edited_at',
        'edited_by_id',
        'approved_by_id',
        'resolved_by_id',
        'latest_lifecycle_change_id',
        'staff_context',
      ]) {
        expect(schema).not.toContain(`"${field}"`)
      }
    }
  })
})
