import { beforeAll, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import type { PrivateUser } from '@services/users/types'
import { createReferralProgramFixture, createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { upsertSystemUser } from '@services/users/system-users'
import { createOfficialReferralLink } from '../create.mts'
import { deleteOfficialReferralLink } from '../delete.mts'
import { getOfficialReferralLink } from '../get.mts'

describe('deleteOfficialReferralLink', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser
  let referralProgramId: string
  let testHostname: string

  beforeAll(async () => {
    // Ensure the @voucha system user exists
    await upsertSystemUser('voucha')

    const adminUser = await createTestUser({ administrator: true })
    if (!adminUser) throw new Error('Failed to create admin user')
    admin = adminUser

    const nonAdmin = await createTestUser()
    if (!nonAdmin) throw new Error('Failed to create regular user')
    regularUser = nonAdmin

    const randomSuffix = Math.random().toString(36).slice(7)
    testHostname = `official-delete-${randomSuffix}.example.com`

    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix,
      hostname: testHostname,
      pathname: '/refer/%',
    })
    referralProgramId = fixture.referralProgramId
  }, 30_000)

  it('admin can soft-delete an official link (sets deleted_at and deleted_by_id)', async () => {
    const suffix = Math.random().toString(36).slice(7)
    const link = await createOfficialReferralLink(WEB_PROVENANCE, admin, {
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/refer/${suffix}`,
    })
    assert.ok(link.id)

    await deleteOfficialReferralLink(admin, link.id)

    // getOfficialReferralLink filters deleted_at IS NULL — should return null
    const deleted = await getOfficialReferralLink(link.id)
    assert.equal(deleted, null)
  })

  it('non-admin gets 403 Forbidden', async () => {
    const suffix = Math.random().toString(36).slice(7)
    const link = await createOfficialReferralLink(WEB_PROVENANCE, admin, {
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/refer/${suffix}`,
    })

    await assert.rejects(() => deleteOfficialReferralLink(regularUser, link.id), { status: 403 })
  })

  it('anonymous user gets 401 Unauthorized', async () => {
    const suffix = Math.random().toString(36).slice(7)
    const link = await createOfficialReferralLink(WEB_PROVENANCE, admin, {
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/refer/${suffix}`,
    })

    await assert.rejects(() => deleteOfficialReferralLink(null, link.id), { status: 401 })
  })

  it('returns 404 when link does not exist', async () => {
    const nonExistentId = '0196b2c0-1234-7000-8000-000000000099'
    await assert.rejects(() => deleteOfficialReferralLink(admin, nonExistentId), { status: 404 })
  })
})
