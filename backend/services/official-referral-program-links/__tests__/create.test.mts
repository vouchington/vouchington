import { beforeAll, describe, it } from 'vitest'
import assert from 'node:assert/strict'
import type { PrivateUser } from '@services/users/types'
import { createReferralProgramFixture, createTestUser, WEB_PROVENANCE } from '@voucha/test-helpers'
import { upsertSystemUser } from '@services/users/system-users'
import { createOfficialReferralLink } from '../create.mts'

describe('createOfficialReferralLink', () => {
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
    testHostname = `official-create-${randomSuffix}.example.com`

    const fixture = await createReferralProgramFixture({
      createdById: admin.id,
      randomSuffix,
      hostname: testHostname,
      pathname: '/refer/%',
    })
    referralProgramId = fixture.referralProgramId
  }, 30_000)

  it('admin can create an official referral link', async () => {
    const suffix = Math.random().toString(36).slice(7)
    const link = await createOfficialReferralLink(WEB_PROVENANCE, admin, {
      referral_program_id: referralProgramId,
      url: `https://${testHostname}/refer/${suffix}`,
      label: 'Official test link',
    })
    assert.ok(link.id)
    assert.equal(link.referral_program_id, referralProgramId)
    assert.equal(link.label, 'Official test link')
    assert.ok(link.activated_at)
    assert.equal(link.created_by_id, admin.id)
    assert.equal(link.deleted_by_id, null)
  })

  it('non-admin gets 403 Forbidden', async () => {
    const suffix = Math.random().toString(36).slice(7)
    await assert.rejects(
      () =>
        createOfficialReferralLink(WEB_PROVENANCE, regularUser, {
          referral_program_id: referralProgramId,
          url: `https://${testHostname}/refer/${suffix}`,
        }),
      { status: 403 },
    )
  })

  it('anonymous user gets 401 Unauthorized', async () => {
    const suffix = Math.random().toString(36).slice(7)
    await assert.rejects(
      () =>
        createOfficialReferralLink(WEB_PROVENANCE, null, {
          referral_program_id: referralProgramId,
          url: `https://${testHostname}/refer/${suffix}`,
        }),
      { status: 401 },
    )
  })

  it('invalid URL gets 422', async () => {
    await assert.rejects(
      () =>
        createOfficialReferralLink(WEB_PROVENANCE, admin, {
          referral_program_id: referralProgramId,
          url: 'https://not-a-referral-program.invalid/other',
        }),
      { status: 422 },
    )
  })
})
