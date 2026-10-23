import { it, beforeAll, describe, expect } from 'vitest'
import type { PrivateUser } from '@services/users/types'
import assert from 'node:assert/strict'
import {
  createReferralProgramFixture,
  createTestUser,
  deleteForeignKeyTargetDuringInsertForTest,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN } from '@modules/on-error/error-codes'
import { createUserReferralLink } from './create.mts'
import { deactivateUserReferralLink } from './activate.mts'
import { withPostgresQueryFailureForTest } from '@voucha/test-helpers/postgres-query-failure'

describe('create', () => {
  let user: PrivateUser
  let referralProgramId: string | null = null
  let testHostname: string | null = null

  beforeAll(async () => {
    const testUser = await createTestUser()
    if (!testUser) throw new Error('Failed to create test user')
    user = testUser
    const randomSuffix = Math.random().toString(36).slice(7)
    testHostname = `create-test-${randomSuffix}.com`

    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix,
      hostname: testHostname,
      pathname: '/refer',
    })
    referralProgramId = fixture.referralProgramId
  })
  it('createUserReferralLink creates link with valid URL', async () => {
    const link = await createUserReferralLink(user, WEB_PROVENANCE, {
      user_id: user.id,
      referral_program_id: referralProgramId!,
      url: `https://${testHostname}/refer`,
      label: 'My referral link',
    })
    assert.ok(link.id)
    assert.equal(link.user_id, user.id)
    assert.equal(link.referral_program_id, referralProgramId)
    assert.equal(link.label, 'My referral link')
    assert.ok(link.activated_at)
  })

  it('returns REST not-found semantics before validating URLs for a missing program', async () => {
    await assert.rejects(
      () =>
        createUserReferralLink(user, WEB_PROVENANCE, {
          user_id: user.id,
          referral_program_id: '00000000-0000-7000-8000-000000000111',
          url: 'https://example.com/refer',
        }),
      { status: 404, message: 'Topic not found' },
    )
  })

  it('maps a referral-program deletion during the insert FK check to not found', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)
    const hostname = `create-race-${randomSuffix}.com`
    const fixture = await createReferralProgramFixture({
      createdById: user.id,
      randomSuffix,
      hostname,
      pathname: '/refer',
    })
    const outcome = await deleteForeignKeyTargetDuringInsertForTest({
      queryMarker: '/* createUserReferralLink */',
      lockTarget: async query => {
        await query(
          '/* lockTestReferralProgramTopic */ SELECT topic_id FROM referral_program_topics WHERE topic_id = $1 FOR UPDATE',
          [fixture.referralProgramId],
        )
      },
      deleteTarget: async query => {
        await query(
          '/* deleteTestReferralProgramTopic */ DELETE FROM referral_program_topics WHERE topic_id = $1',
          [fixture.referralProgramId],
        )
      },
      operation: () =>
        createUserReferralLink(user, WEB_PROVENANCE, {
          user_id: user.id,
          referral_program_id: fixture.referralProgramId,
          url: `https://${hostname}/refer?race=${randomSuffix}`,
        }),
    })

    expect(outcome).toMatchObject({ error: { status: 404, message: 'Topic not found' } })
  })

  it('preserves unrelated database errors during link creation', async () => {
    const failure = await withPostgresQueryFailureForTest('/* createUserReferralLink */', () =>
      createUserReferralLink(user, WEB_PROVENANCE, {
        user_id: user.id,
        referral_program_id: referralProgramId!,
        url: `https://${testHostname}/refer?failure=${Math.random().toString(36).slice(7)}`,
      }).catch((err: unknown) => err),
    )

    expect(failure.result).toMatchObject({ code: '25P02' })
    expect(failure.result).toBe(failure.error)
  })

  it('createUserReferralLink upserts duplicate links and reactivates deactivated rows', async () => {
    const randomSuffix = Math.random().toString(36).slice(7)
    const url = `https://${testHostname}/refer?dedupe=${randomSuffix}`

    const first = await createUserReferralLink(user, WEB_PROVENANCE, {
      user_id: user.id,
      referral_program_id: referralProgramId!,
      url,
      label: 'Initial label',
    })
    await deactivateUserReferralLink(user, first.id)

    const second = await createUserReferralLink(user, WEB_PROVENANCE, {
      user_id: user.id,
      referral_program_id: referralProgramId!,
      url,
      label: 'Updated label',
    })

    assert.equal(second.id, first.id)
    assert.equal(second.label, 'Updated label')
    assert.ok(second.activated_at)
    assert.equal(second.deactivated_at, null)
  })

  it('createUserReferralLink fails with invalid URL', async () => {
    try {
      await createUserReferralLink(user, WEB_PROVENANCE, {
        user_id: user.id,
        referral_program_id: referralProgramId!,
        url: 'https://invalid.com/other',
      })
      assert.fail('Should have thrown')
    } catch (err: unknown) {
      assert.ok(err && typeof err === 'object' && 'status' in err)
      assert.equal(err.status, 422)
    }
  })

  it('createUserReferralLink requires authentication', async () => {
    try {
      await createUserReferralLink(null, WEB_PROVENANCE, {
        user_id: user.id,
        referral_program_id: referralProgramId!,
        url: 'https://example.com/refer',
      })
      assert.fail('Should have thrown')
    } catch (err: unknown) {
      assert.ok(err && typeof err === 'object' && 'status' in err)
      assert.equal(err.status, 401)
    }
  })

  it('createUserReferralLink rejects official accounts', async () => {
    const admin = await createTestUser({ administrator: true })

    await assert.rejects(
      () =>
        createUserReferralLink(admin, WEB_PROVENANCE, {
          user_id: admin.id,
          referral_program_id: referralProgramId!,
          url: `https://${testHostname}/refer?official=1`,
          label: 'Official link',
        }),
      {
        status: 403,
        code: OFFICIAL_ACCOUNT_TRUST_SIGNAL_FORBIDDEN,
        message:
          'Official and automated accounts cannot publish personal referral-link endorsements.',
      },
    )
  })
})
