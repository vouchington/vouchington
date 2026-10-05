import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createTestCopyrightImageFixture,
  createTestCopyrightRestrictionForImage,
} from '@voucha/test-helpers/copyright-surface-target-fixtures'
import { useCopyrightMcpDecisionTools } from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'
import { appendCopyrightNoticeSubmission } from '@services/copyright-notices'

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

describe('registered copyright legal-hold decisions', () => {
  useCopyrightMcpDecisionTools()

  it('assesses and resolves a hold submission with the credential owner recorded twice', async () => {
    const restricted = await createTestCopyrightRestrictionForImage(
      await createTestCopyrightImageFixture('post-image'),
    )
    const submission = await appendCopyrightNoticeSubmission({
      noticeId: restricted.noticeId,
      kind: 'court_or_ccb_hold',
      receivedAt: new Date(),
      sourceKind: 'email',
      submittedByUserId: null,
      bodyCiphertext: `hold-${crypto.randomUUID()}`,
    })
    const admin = await createTestUser({ administrator: true })
    const assessed = await callTestCopyrightWriteTool(admin, 'assess_copyright_legal_hold', {
      id: submission.id,
      is_from_original_claimant: false,
      is_same_material: false,
      target_ids: [restricted.targetId],
      rationale: 'The submission does not identify a qualifying proceeding.',
    })
    expect(assessed.isError).not.toBe(true)
    const assessment = assessed.structuredContent?.['copyright_legal_hold_assessment'] as
      | { id: string }
      | undefined
    expect(assessment?.id).toEqual(expect.any(String))
    const reviewed = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
    expect(reviewed?.holdAssessments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: assessment?.id,
          assessed_by_id: admin.id,
        }),
      ]),
    )

    const resolved = await callTestCopyrightWriteTool(admin, 'resolve_copyright_legal_hold', {
      id: assessment!.id,
      resolution_kind: 'dismissed',
      rationale: 'The asserted proceeding has been dismissed.',
    })
    expect(resolved.isError).not.toBe(true)
    expect(resolved.structuredContent).toMatchObject({
      copyright_legal_hold_resolution: {
        copyright_notice_legal_hold_assessment_id: assessment!.id,
        resolved_by_id: admin.id,
      },
    })
    const final = await getCopyrightNoticePrivateAggregate(restricted.noticeId)
    expect(final?.holdResolutions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          copyright_notice_legal_hold_assessment_id: assessment!.id,
          resolved_by_id: admin.id,
        }),
      ]),
    )
  })
})
