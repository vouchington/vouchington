import { describe, expect, it } from 'vitest'
import { redactCopyrightNoticeForMember } from './redaction.mts'
import type { CopyrightNoticeRecord } from './types.mts'

function makeRecord(): CopyrightNoticeRecord {
  return {
    id: crypto.randomUUID(),
    jurisdiction: 'us_dmca',
    legal_basis: 'copyright',
    received_at: new Date(),
    accepted_at: new Date(),
    provisional_withholding_at: new Date(),
    claimant_user_id: crypto.randomUUID(),
    claimant_display_name: 'Claimant',
    claimant_contact_ciphertext: 'private@example.test',
    work_description: 'Private evidence description',
    policy_version: 'test',
  }
}

describe('redactCopyrightNoticeForMember', () => {
  it('returns only the authenticated-member allowlist and allegation/provisional labels', () => {
    const record = makeRecord()
    const result = redactCopyrightNoticeForMember(record, {
      visibleTargetReference: 'placement:abc',
      publicClaimant: { userId: record.claimant_user_id!, displayName: 'Public Claimant' },
      activeRestrictionCount: 1,
      visibleTargetHumanReviewAction: null,
    })

    expect(result).toEqual({
      id: record.id,
      jurisdiction: record.jurisdiction,
      received_at: record.received_at,
      accepted_at: record.accepted_at,
      target_reference: 'placement:abc',
      claimant: { user_id: record.claimant_user_id, display_name: 'Public Claimant' },
      allegation_label: 'copyright allegation',
      review_outcome: null,
      restriction_label: 'provisionally withheld pending human review',
    })
    expect(JSON.stringify(result)).not.toContain('private@example.test')
    expect(JSON.stringify(result)).not.toContain('Private evidence')
  })

  it('does not expose a target the viewer cannot otherwise see', () => {
    const result = redactCopyrightNoticeForMember(makeRecord(), {
      visibleTargetReference: null,
      publicClaimant: null,
      activeRestrictionCount: 1,
      visibleTargetHumanReviewAction: null,
    })

    expect(result.target_reference).toBeNull()
  })

  it('rejects a received complaint until it has been accepted', () => {
    const record = makeRecord()
    record.accepted_at = null

    expect(() =>
      redactCopyrightNoticeForMember(record, {
        visibleTargetReference: 'placement:abc',
        publicClaimant: null,
        activeRestrictionCount: 0,
        visibleTargetHumanReviewAction: null,
      }),
    ).toThrow('Unaccepted copyright notices are not member-visible')
  })

  it.each([
    ['confirm', 'restriction active'],
    ['reverse', 'restriction active'],
  ] as const)('publishes the allowlisted %s human-review outcome', (action, expected) => {
    const record = makeRecord()
    expect(
      redactCopyrightNoticeForMember(record, {
        visibleTargetReference: 'placement:abc',
        publicClaimant: null,
        activeRestrictionCount: 1,
        visibleTargetHumanReviewAction: action,
      }).restriction_label,
    ).toBe(expected)
  })
})
