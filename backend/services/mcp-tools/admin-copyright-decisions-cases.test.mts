import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { useCopyrightMcpDecisionTools } from '@voucha/test-helpers/copyright-mcp-write-fixtures'

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

describe('registered copyright case write tools', () => {
  useCopyrightMcpDecisionTools()

  it('keeps the REST appeal recommendation exclusivity and legal-hold coherence checks', async () => {
    const admin = await createTestUser({ administrator: true })
    const id = crypto.randomUUID()
    const appeal = await callTestCopyrightWriteTool(admin, 'review_copyright_appeal', {
      id,
      rationale: 'Human review of the appealed restriction.',
      decisions: [{ restriction_id: crypto.randomUUID(), action: 'confirm' }],
    })
    expect(appeal.isError).toBe(true)
    const appealError = appeal.content[0]
    if (appealError?.type !== 'text') throw new Error('Expected appeal validation error')
    expect(JSON.parse(appealError.text)).toMatchObject({
      error: { status: 422 },
    })

    const hold = await callTestCopyrightWriteTool(admin, 'assess_copyright_legal_hold', {
      id,
      rationale: 'Review of the asserted proceeding.',
      is_from_original_claimant: true,
      is_same_material: true,
      target_ids: [crypto.randomUUID()],
      proceeding_kind: 'ccb',
      commenced_at: '2026-10-01',
    })
    expect(hold.isError).toBe(true)
    const holdError = hold.content[0]
    if (holdError?.type !== 'text') throw new Error('Expected hold validation error')
    expect(JSON.parse(holdError.text)).toMatchObject({ error: { status: 422 } })
  })
})
