import { it, expect, beforeAll, describe, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityInvite,
  getTestCommunityInviteStorage,
} from '@voucha/test-helpers'
import { interceptPostgresTransactionQueriesForTest } from '@voucha/test-helpers/injected-transaction-queries'
import { hashCommunityInviteCode } from './code.mts'
import { searchInvites } from './get.mts'
import { createInvite } from './create.mts'
import { redeemInviteCode } from './redeem.mts'
import { loadCommunityWithViewer } from '../load-with-viewer.mts'
import { getCommunityMember } from '../members/get.mts'
import type { PrivateUser } from '@services/users/types'
import type { Community, CreatedCommunityInvite } from '../types.mts'

describe('index', () => {
  let owner: PrivateUser
  let community: Community

  beforeAll(async () => {
    owner = await createTestUser()
    community = await insertTestCommunity({ createdById: owner.id })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id, role: 'owner' })
  })

  it('reinviting an email rotates the sole pending invite code', async () => {
    const invitee = await createTestUser()
    const first = await createInvite(
      owner.id,
      (await loadCommunityWithViewer(community.id, owner.id))!,
      { email: invitee.email_address! },
    )
    const second = await createInvite(
      owner.id,
      (await loadCommunityWithViewer(community.id, owner.id))!,
      {
        email: invitee.email_address!.toUpperCase(),
      },
    )
    expect(second.id).toBe(first.id)
    expect(second.code).not.toBe(first.code)
    await expect(redeemInviteCode(invitee.id, first.code)).rejects.toMatchObject({ status: 404 })
    const redeemed = await redeemInviteCode(invitee.id, second.code)
    expect(redeemed.accepted_by_id).toBe(invitee.id)
    expect(await getCommunityMember(community.id, invitee.id)).not.toBeNull()
  })

  it('rejects an old code when reinviting rotates it after redemption reads the invite', async () => {
    const invitee = await createTestUser()
    const loaded = await loadCommunityWithViewer(community.id, owner.id)
    const first = await createInvite(owner.id, loaded, { email: invitee.email_address! })
    let replacement: CreatedCommunityInvite | undefined
    const restore = interceptPostgresTransactionQueriesForTest(
      (statement, values) =>
        statement.includes('redeemInviteCode:accept') && values.includes(first.id),
      async () => {
        restore()
        replacement = await createInvite(owner.id, loaded, { email: invitee.email_address! })
      },
    )
    onTestFinished(restore)

    await expect(redeemInviteCode(invitee.id, first.code)).rejects.toMatchObject({ status: 409 })
    expect(replacement?.id).toBe(first.id)
    expect(replacement?.code).not.toBe(first.code)
    expect(await getCommunityMember(community.id, invitee.id)).toBeNull()
    expect(await getTestCommunityInviteStorage(first.id)).toMatchObject({
      code_hash: hashCommunityInviteCode(replacement!.code),
      accepted_at: null,
      revoked_at: null,
    })
    await expect(redeemInviteCode(invitee.id, first.code)).rejects.toMatchObject({ status: 404 })
    const redeemed = await redeemInviteCode(invitee.id, replacement!.code)
    expect(redeemed.accepted_by_id).toBe(invitee.id)
    expect(await getCommunityMember(community.id, invitee.id)).not.toBeNull()
  })

  describe('searchInvites', () => {
    it('returns the community invite without its code or hash', async () => {
      const invitee = await createTestUser()
      const invite = await insertTestCommunityInvite({
        communityId: community.id,
        invitedById: owner.id,
        invitedUserId: invitee.id,
      })
      const result = await searchInvites(community.id)
      const listed = result.results.find(row => row.id === invite.id)
      expect(listed?.invited_user_id).toBe(invitee.id)
      expect(listed).not.toHaveProperty('code')
      expect(listed).not.toHaveProperty('code_hash')
    })
  })
})
