import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createParsedCopyrightEmailIntake } from '@services/copyright-notices/email-intake-test-fixtures'
import { createCopyrightFormFixture } from '@services/copyright-notices/route-test-fixtures'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { readCopyrightEmailIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

type Fixture = Awaited<ReturnType<typeof createCopyrightFormFixture>>

const NON_PUBLIC_POSTS = {
  private: { privacy: 'private', broadcast: 'users' },
  draft: { clearanceStatus: 'pending' },
  'followers-only': { broadcast: 'followers' },
} as const

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

describe('copyright notice targets on posts that are not publicly visible', () => {
  useCopyrightIntakeEnvironment()

  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(Object.entries(NON_PUBLIC_POSTS))(
    'answers a claimant naming a %s post exactly like a target that does not exist',
    async (_name, visibility) => {
      const fixture = await createCopyrightFormFixture(visibility)
      const missing = await submitForm(fixture, withMissingTarget(fixture.form))
      const nonPublic = await submitForm(fixture, fixture.form)

      expect(missing.response.status).toBe(422)
      expect(nonPublic.response.status).toBe(missing.response.status)
      expect(nonPublic.response.body).toEqual(missing.response.body)
      expect(nonPublic.response.text).toBe(missing.response.text)
      // A recorded notice would make a replay of the same key return 200 with `is_duplicate`.
      const replay = await nonPublic.request
        .post('/api/v1/copyright-notices')
        .set('Idempotency-Key', nonPublic.key)
        .send(fixture.form)
      expect(replay.status).toBe(422)
      expect(replay.text).toBe(missing.response.text)
    },
  )

  it('still accepts a claimant naming a publicly visible post', async () => {
    const fixture = await createCopyrightFormFixture()
    const { response } = await submitForm(fixture, fixture.form)
    expect(response.status).toBe(202)
  })

  it('tells staff when an emailed notice names a post that is not publicly visible', async () => {
    const fixture = await createCopyrightFormFixture(NON_PUBLIC_POSTS.private)
    const publicFixture = await createCopyrightFormFixture()
    const intake = await createParsedCopyrightEmailIntake()
    const staff = createRequest()
    await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    const approve = (form: Fixture['form']) =>
      staff.post(`/api/v1/copyright-email-intakes/${intake.id}/approvals`).send({
        ...form,
        rationale: 'The email supplies a complete notice.',
        manual_fallback_reason: 'No recommendation is available.',
      })

    const refused = await approve(fixture.form)
    expect(refused.status).toBe(422)
    expect(refused.body.message).toBe('Hosted image placement is not publicly visible')
    await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])

    expect((await approve(withMissingTarget(publicFixture.form))).body.message).toBe(
      'Hosted image placement was not found',
    )
    // The refusal consumed nothing, so staff can still approve the intake with a visible target.
    expect((await approve(publicFixture.form)).status).toBe(201)
  })
})
