import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createParsedCopyrightEmailIntake } from '@services/copyright-notices/email-intake-test-fixtures'
import { createCopyrightFormFixture } from '@services/copyright-notices/route-test-fixtures'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { readCopyrightEmailIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'
import type { HostedPostAudience } from '@voucha/test-helpers/services/copyright-notices/hosted-post-audience'

type Fixture = Awaited<ReturnType<typeof createCopyrightFormFixture>>

async function submitForm(fixture: Fixture, form: Fixture['form'], key = crypto.randomUUID()) {
  const request = createRequest()
  await request.authenticateAs(fixture.claimant)
  const response = await request
    .post('/api/v1/copyright-notices')
    .set('Idempotency-Key', key)
    .send(form)
  return { key, request, response }
}

function withMissingTarget(form: Fixture['form']): Fixture['form'] {
  const [target] = form.targets
  return {
    ...form,
    targets: [{ ...target!, post_id: crypto.randomUUID(), image_id: crypto.randomUUID() }],
  }
}

describe('copyright notice targets are limited to posts the claimant can view', () => {
  useCopyrightIntakeEnvironment()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each([
    ['a public post', 'public'],
    ['a signed-in-only post', 'users'],
    ['a followers-only post, as a follower', 'followers'],
    ['a private-community post, as a member', 'private-community'],
    ['an archived post', 'archived'],
    ["a suspended author's post", 'suspended-author'],
  ] as const)('accepts a claimant naming %s', async (_name, audience) => {
    const fixture = await createCopyrightFormFixture(audience, { claimantHasAccess: true })
    const { response } = await submitForm(fixture, fixture.form)
    expect(response.status).toBe(202)
  })

  it.each([
    ['a followers-only post, as a non-follower', 'followers', false],
    ['a private-community post, as a non-member', 'private-community', false],
    ['a post awaiting community review, even as a member', 'awaiting-community-review', true],
    ['an unapproved draft, as a non-author', 'draft', false],
  ] as const)(
    'answers a claimant naming %s exactly like a target that does not exist',
    async (_name, audience, claimantHasAccess) => {
      const fixture = await createCopyrightFormFixture(audience, { claimantHasAccess })
      const missing = await submitForm(fixture, withMissingTarget(fixture.form))
      const hidden = await submitForm(fixture, fixture.form)

      expect(missing.response.status).toBe(422)
      expect(hidden.response.status).toBe(missing.response.status)
      expect(hidden.response.body).toEqual(missing.response.body)
      expect(hidden.response.text).toBe(missing.response.text)
      // A recorded notice would make a replay of the same key return 200 with `is_duplicate`.
      const replay = await hidden.request
        .post('/api/v1/copyright-notices')
        .set('Idempotency-Key', hidden.key)
        .send(fixture.form)
      expect(replay.status).toBe(422)
      expect(replay.text).toBe(missing.response.text)
    },
  )

  it.each([
    'users',
    'followers',
    'private-community',
    'awaiting-community-review',
    'draft',
    'archived',
    'suspended-author',
  ] satisfies HostedPostAudience[])(
    'lets staff approve an emailed notice naming a %s post',
    async audience => {
      const fixture = await createCopyrightFormFixture(audience)
      const intake = await createParsedCopyrightEmailIntake()
      const staff = createRequest()
      await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))

      const approved = await staff
        .post(`/api/v1/copyright-email-intakes/${intake.id}/approvals`)
        .send({
          ...fixture.form,
          rationale: 'The email supplies a complete notice.',
          manual_fallback_reason: 'No recommendation is available.',
        })

      expect(approved.status).toBe(201)
      await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.not.toEqual([])
    },
  )

  it('still reports a missing target to staff as not found', async () => {
    const fixture = await createCopyrightFormFixture()
    const intake = await createParsedCopyrightEmailIntake()
    const staff = createRequest()
    await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))

    const refused = await staff
      .post(`/api/v1/copyright-email-intakes/${intake.id}/approvals`)
      .send({
        ...withMissingTarget(fixture.form),
        rationale: 'The email supplies a complete notice.',
        manual_fallback_reason: 'No recommendation is available.',
      })

    expect(refused.status).toBe(422)
    expect(refused.body.message).toBe('Hosted image placement was not found')
    await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])
  })
})
