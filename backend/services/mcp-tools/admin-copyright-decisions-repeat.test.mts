import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { confirmTestRepeatInfringerNotice } from '@voucha/test-helpers/services/copyright-notices/repeat-infringer'
import { useCopyrightMcpDecisionTools } from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { listCopyrightRepeatInfringerAccountsForNotice } from '@services/copyright-notices'
import { getCopyrightRepeatInfringerAccount } from '@services/copyright-notices/repeat-infringer-incidents'
import { unsuspendUser } from '@services/users/suspension'
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

describe('registered repeat-infringer decisions', () => {
  useCopyrightMcpDecisionTools()

  it('records a disposition on the persisted incident with the credential owner', async () => {
    const poster = await createTestUser()
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const noticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const accountRows = await listCopyrightRepeatInfringerAccountsForNotice(moderator, noticeId)
    const incidentId = accountRows[0]?.incident_id
    if (!incidentId) throw new Error('Incident fixture missing')
    const admin = await createTestUser({ administrator: true })
    const result = await callTestCopyrightWriteTool(
      admin,
      'record_copyright_repeat_infringer_disposition',
      {
        id: incidentId,
        disposition: 'duplicate',
        rationale: 'This incident duplicates an earlier determination.',
      },
    )
    expect(result.isError).not.toBe(true)
    expect(result.structuredContent).toMatchObject({
      copyright_repeat_infringer_disposition: { incident_id: incidentId },
    })
    const account = await getCopyrightRepeatInfringerAccount(poster.id)
    expect(account.incidents).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: incidentId, is_operative: false })]),
    )
  })

  it('terminates after the threshold and reinstates through separate registered decisions', async () => {
    const poster = await createTestUser()
    const moderator = await createTestUser({ extraRoles: ['moderator'] })
    const firstNoticeId = await confirmTestRepeatInfringerNotice(poster.id, moderator)
    await confirmTestRepeatInfringerNotice(poster.id, moderator)
    const accounts = await listCopyrightRepeatInfringerAccountsForNotice(moderator, firstNoticeId)
    const reviewId = accounts[0]?.open_review_id
    if (!reviewId) throw new Error('Open repeat-infringer review missing')
    const admin = await createTestUser({ administrator: true })
    const outcome = await callTestCopyrightWriteTool(
      admin,
      'record_copyright_repeat_infringer_outcome',
      {
        id: reviewId,
        outcome: 'terminate',
        rationale: 'Two independently confirmed notices satisfy the threshold.',
      },
    )
    expect(outcome.isError).not.toBe(true)
    expect(outcome.structuredContent).toMatchObject({
      copyright_repeat_infringer_review: {
        id: reviewId,
        account_user_id: poster.id,
        outcome: 'terminate',
      },
    })
    expect(await getPrivateUserByAny(poster.id)).toMatchObject({
      suspended_at: expect.any(Date),
    })

    const reinstatement = await callTestCopyrightWriteTool(
      admin,
      'reinstate_copyright_repeat_infringer',
      {
        accountUserId: poster.id,
        rationale: 'Human review supports reinstatement after the prior outcome.',
      },
    )
    expect(reinstatement.isError).not.toBe(true)
    expect(reinstatement.structuredContent).toMatchObject({
      copyright_repeat_infringer_review: {
        account_user_id: poster.id,
        outcome: 'reinstatement',
      },
    })
    await unsuspendUser(admin, poster.id)
    expect(await getPrivateUserByAny(poster.id)).toMatchObject({
      suspended_at: null,
    })
  })
})
