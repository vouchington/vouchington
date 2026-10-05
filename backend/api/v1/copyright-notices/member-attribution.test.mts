import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient, type CreateInvalidationCommandOutput } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient, type PutItemCommandOutput } from '@aws-sdk/client-dynamodb'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  connectTestOAuthAccount,
  createTestUser,
  insertTestOAuthAccount,
  setTestOAuthAccountData,
  softDeleteUser,
  updateUserUsername,
} from '@voucha/test-helpers'
import { readCopyrightAcceptedNoticeCursorBefore } from '@voucha/test-helpers/data-stores/psql/copyright-notice-reads'
import { setUserDisplayNameFrom } from '@voucha/test-helpers/data-stores/psql/views/view-users'
import { createCopyrightFormFixture } from '@voucha/test-helpers/copyright-route-fixtures'
import { createCopyrightFormIntake, reviewCopyrightFormIntake } from '@services/copyright-notices'
import { createAcceptedCopyrightNotice } from '@voucha/test-helpers/services/copyright-notices/accepted-notice'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

describe('copyright notice member claimant attribution', () => {
  useCopyrightIntakeEnvironment()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockImplementation(
      vi
        .fn<VitestLooseMock>()
        .mockResolvedValue({ $metadata: {} } satisfies CreateInvalidationCommandOutput),
    )
    vi.spyOn(DynamoDBClient.prototype, 'send').mockImplementation(
      vi.fn<VitestLooseMock>().mockResolvedValue({ $metadata: {} } satisfies PutItemCommandOutput),
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns only the current claimant public profile on member list, detail, and participant reads', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createAcceptedCopyrightNotice(fixture)
    const member = createRequest()
    await member.authenticateAs(await createTestUser())

    const after = await readCopyrightAcceptedNoticeCursorBefore(noticeId)
    const list = await member
      .get(`/api/v1/copyright-notices?after=${encodeURIComponent(after)}&limit=1`)
      .expect(200)
    const summary = list.body.copyright_notices[0]
    expect(summary.id).toBe(noticeId)
    expect(summary).toMatchObject({
      claimant: { user_id: fixture.claimant.id, display_name: fixture.claimant.username },
    })
    const detail = await member.get(`/api/v1/copyright-notices/${noticeId}`).expect(200)
    expect(detail.body.copyright_notice).toMatchObject({
      claimant: { user_id: fixture.claimant.id, display_name: fixture.claimant.username },
    })
    const participant = createRequest()
    await participant.authenticateAs(fixture.claimant)
    const participantResponse = await participant
      .get(`/api/v1/copyright-notices/${noticeId}/participant`)
      .expect(200)
    expect(participantResponse.body.copyright_notice).toMatchObject({
      claimant: { user_id: fixture.claimant.id, display_name: fixture.claimant.username },
    })
    const memberBodies = [list.body, detail.body, participantResponse.body]
    for (const body of memberBodies) {
      const serialized = JSON.stringify(body)
      expect(serialized).not.toContain(fixture.form.claimant_display_name)
      expect(serialized).not.toContain(fixture.form.claimant_contact)
      expect(serialized).not.toContain(fixture.form.claimant_email)
      expect(serialized).not.toContain(fixture.form.work_description)
      expect(serialized).not.toContain(fixture.form.electronic_signature)
    }
  })

  it('updates claimant attribution after a username change and removes it after erasure', async () => {
    const fixture = await createCopyrightFormFixture()
    const noticeId = await createAcceptedCopyrightNotice(fixture)
    const member = createRequest()
    await member.authenticateAs(await createTestUser())
    const currentUsername = `copyright-claimant-${crypto.randomUUID()}`
    await updateUserUsername(fixture.claimant.id, currentUsername)
    const providerUserId = `facebook-${crypto.randomUUID()}`
    await insertTestOAuthAccount('facebook', providerUserId)
    await connectTestOAuthAccount('facebook', fixture.claimant.id, providerUserId)
    await setTestOAuthAccountData('facebook', providerUserId, { name: 'Current public claimant' })
    await setUserDisplayNameFrom(fixture.claimant.id, 'facebook')
    const after = await readCopyrightAcceptedNoticeCursorBefore(noticeId)

    expect(
      (await member.get(`/api/v1/copyright-notices/${noticeId}`).expect(200)).body.copyright_notice,
    ).toMatchObject({
      claimant: { user_id: fixture.claimant.id, display_name: 'Current public claimant' },
    })
    expect(
      (
        await member
          .get(`/api/v1/copyright-notices?after=${encodeURIComponent(after)}&limit=1`)
          .expect(200)
      ).body.copyright_notices[0],
    ).toMatchObject({
      claimant: { user_id: fixture.claimant.id, display_name: 'Current public claimant' },
    })
    await softDeleteUser(fixture.claimant.id)
    expect(
      (await member.get(`/api/v1/copyright-notices/${noticeId}`).expect(200)).body.copyright_notice,
    ).toMatchObject({ claimant: null })
    const erasedDetail = await member.get(`/api/v1/copyright-notices/${noticeId}`).expect(200)
    expect(JSON.stringify(erasedDetail.body)).not.toContain(fixture.claimant.id)
    expect(JSON.stringify(erasedDetail.body)).not.toContain('Current public claimant')
    expect(
      (
        await member
          .get(`/api/v1/copyright-notices?after=${encodeURIComponent(after)}&limit=1`)
          .expect(200)
      ).body.copyright_notices[0],
    ).toMatchObject({ claimant: null })
  })

  it('returns null claimant attribution for guest notices without exposing private form fields', async () => {
    const fixture = await createCopyrightFormFixture()
    const guest = await createCopyrightFormIntake({
      currentUser: null,
      requesterIdentity: `guest:${crypto.randomUUID()}`,
      idempotencyKey: crypto.randomUUID(),
      request: {
        jurisdiction: 'us_dmca',
        claimantDisplayName: 'Guest legal claimant',
        claimantContact: 'guest-address-private',
        claimantEmail: 'guest-private@example.test',
        workDescription: 'Guest copyright work description',
        goodFaithBelief: true,
        accuracyAuthorityUnderPenaltyOfPerjury: true,
        electronicSignature: 'Guest signature private',
        claimantTargets: fixture.form.targets.map(target => ({
          surfaceKind: 'post-image' as const,
          postId: target.post_id,
          imageId: target.image_id,
          hostedUseUrl: target.target_url,
        })),
      },
    })
    await reviewCopyrightFormIntake({
      intakeId: guest.intake.id,
      currentUser: await createTestUser({ extraRoles: ['moderator'] }),
      is_accepted: true,
      rationale: 'The guest notice is complete.',
    })
    const member = createRequest()
    await member.authenticateAs(await createTestUser())

    const response = await member
      .get(`/api/v1/copyright-notices/${guest.intake.copyright_notice_id}`)
      .expect(200)
    expect(response.body.copyright_notice).toMatchObject({ claimant: null })
    const after = await readCopyrightAcceptedNoticeCursorBefore(guest.intake.copyright_notice_id)
    const list = await member
      .get(`/api/v1/copyright-notices?after=${encodeURIComponent(after)}&limit=1`)
      .expect(200)
    expect(list.body.copyright_notices[0]).toMatchObject({
      id: guest.intake.copyright_notice_id,
      claimant: null,
    })
    const body = JSON.stringify(response.body)
    expect(body).not.toContain('Guest legal claimant')
    expect(body).not.toContain('guest-address-private')
    expect(body).not.toContain('guest-private@example.test')
    expect(body).not.toContain('Guest signature private')
  })
})
