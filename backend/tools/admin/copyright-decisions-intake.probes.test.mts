import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createRecommendedMcpCopyrightCorrespondence,
  useCopyrightMcpDecisionTools,
} from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { getCopyrightNoticePrivateAggregate } from '@voucha/test-helpers/services/copyright-notices/private-aggregate'

import { callMcpTool } from '../../services/mcp-tools/call-tool.mts'
import { ADMIN_MCP_SERVER_CONFIG } from '../../services/mcp-tools/config.mts'
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

const counterRecommendation = {
  submission_kind: 'counter_notice',
  counter_notice_name: 'Hosted-material poster',
  counter_notice_address: '1 Main Street, Example City',
  counter_notice_telephone: '555-0100',
  counter_notice_electronic_signature: 'Hosted-material poster',
  consent_to_federal_jurisdiction: true,
  consent_to_service_of_process: true,
  good_faith_misidentification_under_penalty_of_perjury: true,
}

describe('copyright MCP correspondence admission', () => {
  useCopyrightMcpDecisionTools()

  it('admits the recommendation-built counter-notice once and rejects a mismatched requested kind', async () => {
    const admin = await createTestUser({ administrator: true })
    const fixture = await createRecommendedMcpCopyrightCorrespondence(counterRecommendation)
    const args = {
      intake_id: fixture.intake.id,
      kind: 'counter_notice',
      target_ids: [fixture.targetId],
      rationale: 'Staff verified every statutory field.',
    }
    const first = await callTestCopyrightWriteTool(
      admin,
      'admit_copyright_email_correspondence',
      args,
    )
    expect(first.isError).not.toBe(true)
    expect(first.structuredContent).toMatchObject({
      copyright_notice: { id: fixture.noticeId },
      copyright_submission: { id: expect.any(String) },
      copyright_correspondence: { id: expect.any(String) },
      is_duplicate: false,
    })
    const replay = await callTestCopyrightWriteTool(
      admin,
      'admit_copyright_email_correspondence',
      args,
    )
    expect(replay.structuredContent).toMatchObject({ is_duplicate: true })
    const aggregate = await getCopyrightNoticePrivateAggregate(fixture.noticeId)
    expect(aggregate?.submissions.filter(row => row.kind === 'counter_notice')).toHaveLength(1)

    const mismatch = await createRecommendedMcpCopyrightCorrespondence({
      ...counterRecommendation,
      submission_kind: 'appeal',
      appeal_reason: 'I own the photograph.',
    })
    const denied = await callTestCopyrightWriteTool(admin, 'admit_copyright_email_correspondence', {
      intake_id: mismatch.intake.id,
      kind: 'counter_notice',
      target_ids: [mismatch.targetId],
      rationale: 'Staff reviewed the mismatched recommendation.',
    })
    expect(denied.isError).toBe(true)
    const block = denied.content[0]
    if (block?.type !== 'text') throw new Error('Expected a typed MCP error')
    expect(JSON.parse(block.text)).toMatchObject({ error: { status: 422 } })
    expect((await getCopyrightNoticePrivateAggregate(mismatch.noticeId))?.submissions).toHaveLength(
      1,
    )
  })
})
