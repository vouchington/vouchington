import {
  optionArgs,
  callStructuredMcpTool,
  expectMcpToolFunctionThrows,
} from '@voucha/test-helpers/mcp-tool-contract'
import { createReferralProgramFixture } from '@voucha/test-helpers/entities/referral-programs'
import { createTestUser } from '@voucha/test-helpers'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'
import { getUserReferralLink, type UserReferralLink } from '@services/user-referral-program-links'
import { addUserRole } from '@services/users/roles-permissions'
import { describe, expect, it } from 'vitest'

const SCOPES = ['referral-links:read', 'referral-links:write'] as const
type LinkResult = { referral_link: UserReferralLink }

describe('referral link administrator policy — real DB', () => {
  it('keeps an official account from creating or editing while allowing activation and deletion', async () => {
    const admin = { ...(await createTestUser()), membership_plan: 'plus' as const }
    await addUserRole(admin.id, 'administrator')
    const owner = { ...(await createTestUser()), membership_plan: 'plus' as const }
    const fixture = await createReferralProgramFixture({ createdById: owner.id })
    const createArgs = {
      referral_program_id: fixture.referralProgramId,
      url: `https://${fixture.hostname}/ref/${crypto.randomUUID().slice(0, 8)}`,
    }
    const created = await callStructuredMcpTool(
      owner,
      'create_referral_link',
      { ...createArgs, label: 'Owner link' },
      SCOPES,
    )
    const { id } = (created as LinkResult).referral_link
    const official = { status: 403, code: OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN }

    await expectMcpToolFunctionThrows(admin, 'create_referral_link', createArgs, official)
    await expectMcpToolFunctionThrows(
      admin,
      'update_referral_link',
      { link_id: id, label: 'Staff label' },
      official,
    )
    const call = (
      name: 'remove_referral_link' | 'activate_referral_link',
      option: 'activation' | 'link' = 'activation',
    ) =>
      callStructuredMcpTool(
        admin,
        name,
        name === 'remove_referral_link' ? optionArgs(option, { link_id: id }) : { link_id: id },
        SCOPES,
      )
    const off = (await call('remove_referral_link')) as LinkResult
    const on = (await call('activate_referral_link')) as LinkResult
    expect(off.referral_link.deactivated_at).toEqual(expect.any(String))
    expect(on.referral_link).toMatchObject({ id, label: 'Owner link', deactivated_at: null })

    expect(await call('remove_referral_link', 'link')).toEqual({ success: true })
    expect(await getUserReferralLink(id)).toBeNull()
  })
})
