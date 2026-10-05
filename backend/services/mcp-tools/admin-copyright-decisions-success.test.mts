import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import {
  listCopyrightGuestCapabilityEvents,
  readCopyrightGuestCapabilityState,
} from '@voucha/test-helpers/data-stores/psql/copyright-guest-lifecycle'
import { useCopyrightMcpDecisionTools } from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { recordTestClaimantEmailReceipt } from '@voucha/test-helpers/services/copyright-notices/claimant-delivery'
import {
  createCopyrightCounterNotice,
  createCopyrightAppeal,
  issueCopyrightGuestCapability,
} from '@services/copyright-notices'
import { getPrivateUserByAny } from '@services/users/get'

import { callMcpTool } from './call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from './config.mts'
import type { PrivateUser } from '@services/users/types'

const callTestCopyrightWriteTool = (user: PrivateUser, name: string, args: unknown) =>
  callMcpTool(
    name,
    args,
    { ...user, membership_plan: null },
    ['copyright-notices:read', 'copyright-notices:write'],
    ADMIN_MCP_SERVER_CONFIG,
    true,
  )

describe('registered copyright case and capability decisions', () => {
  useCopyrightMcpDecisionTools()

  it('records a restriction human review with the credential owner as actor', async () => {
    const restricted = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const admin = await createTestUser({ administrator: true })
    const result = await callTestCopyrightWriteTool(admin, 'review_copyright_restriction', {
      id: restricted.noticeId,
      restrictionId: restricted.restrictionId,
      action: 'confirm',
      rationale: 'The evidence supports this restriction.',
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      copyright_restriction: { id: restricted.restrictionId },
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
    expect(aggregate?.restrictions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: restricted.restrictionId,
          human_review_action: 'confirm',
          human_reviewed_by_id: admin.id,
        }),
      ]),
    )
  })

  it('accepts a signed counter-notice through the registered tool and stores the staff actor', async () => {
    const image = await createTestCopyrightImageFixture('post-image')
    const restricted = await createTestCopyrightRestrictionForImage(image)
    await recordTestClaimantEmailReceipt(restricted.noticeId)
    const poster = await getPrivateUserByAny(image.actorUserId)
    if (!poster) throw new Error('Poster fixture missing')
    const counter = await createCopyrightCounterNotice(
      poster,
      restricted.noticeId,
      crypto.randomUUID(),
      {
        name: 'Poster',
        address: '1 Main Street',
        telephone: '555-0100',
        consentToFederalJurisdiction: true,
        consentToServiceOfProcess: true,
        goodFaithMisidentificationUnderPenaltyOfPerjury: true,
        electronicSignature: 'Poster',
        targetIds: [restricted.targetId],
      },
    )
    const admin = await createTestUser({ administrator: true })
    const result = await callTestCopyrightWriteTool(admin, 'review_copyright_counter_notice', {
      id: counter.submission.id,
      is_accepted: true,
      rationale: 'The signed counter-notice has the required declarations.',
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      copyright_notice: { id: restricted.noticeId },
      assessment_id: expect.any(String),
      deadline_id: expect.any(String),
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
    expect(aggregate?.counterNoticeReviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          is_accepted: true,
          reviewed_by_id: admin.id,
        }),
      ]),
    )
  })

  it('reviews an authenticated appeal with a server-side staff actor', async () => {
    const image = await createTestCopyrightImageFixture('post-image')
    const restricted = await createTestCopyrightRestrictionForImage(image)
    const poster = await getPrivateUserByAny(image.actorUserId)
    if (!poster) throw new Error('Poster fixture missing')
    const appeal = await createCopyrightAppeal(poster, restricted.noticeId, crypto.randomUUID(), {
      reason: 'I created this image.',
      targetIds: [restricted.targetId],
    })
    const admin = await createTestUser({ administrator: true })
    const result = await callTestCopyrightWriteTool(admin, 'review_copyright_appeal', {
      id: appeal.submission.id,
      decisions: [{ restriction_id: restricted.restrictionId, action: 'confirm' }],
      manual_fallback_reason: 'The human reviewer has sufficient direct evidence.',
      rationale: 'The record still supports this restriction.',
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      copyright_notice: { id: restricted.noticeId },
      review_ids: [expect.any(String)],
    })
    const aggregate = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
    expect(aggregate?.appealReviews).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'confirm',
          reviewed_by_id: admin.id,
        }),
      ]),
    )
  })

  it('revokes a guest capability on its case and persists the credential owner', async () => {
    const restricted = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const admin = await createTestUser({ administrator: true })
    const capability = await issueCopyrightGuestCapability({
      currentUser: admin,
      noticeId: restricted.noticeId,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    const result = await callTestCopyrightWriteTool(admin, 'revoke_copyright_guest_capability', {
      id: restricted.noticeId,
      capabilityId: capability.id,
      rationale: 'The guest token is no longer needed.',
    })
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      copyright_guest_capability: {
        id: capability.id,
        revoked_at: expect.any(String),
      },
    })
    expect(await readCopyrightGuestCapabilityState(capability.id)).toMatchObject({
      issued_by_id: admin.id,
      revoked_at: expect.any(Date),
    })
    expect(await listCopyrightGuestCapabilityEvents(capability.id)).toEqual([
      { change_type: 'guest_capability_issued', changed_by_id: admin.id },
      { change_type: 'guest_capability_revoked', changed_by_id: admin.id },
    ])
  })
})
