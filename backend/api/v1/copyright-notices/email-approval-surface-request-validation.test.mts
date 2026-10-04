import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CloudFrontClient } from '@aws-sdk/client-cloudfront'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { createParsedCopyrightEmailIntake } from '@services/copyright-notices/email-intake-test-fixtures'
import { createCopyrightFormFixture } from '@services/copyright-notices/route-test-fixtures'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { readCopyrightEmailIntakeReview } from '@voucha/test-helpers/data-stores/psql/copyright-email-intakes'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

describe('copyright email approval surface target contract', () => {
  useCopyrightIntakeEnvironment()
  beforeEach(() => {
    vi.spyOn(CloudFrontClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
    vi.spyOn(DynamoDBClient.prototype, 'send').mockResolvedValue({ $metadata: {} } as never)
  })
  afterEach(() => vi.restoreAllMocks())

  it.each<[string, (target: Record<string, unknown>) => Record<string, unknown>, string]>([
    [
      'missing surface',
      target => ({ ...target, surface: undefined }),
      'targets[].surface is invalid',
    ],
    [
      'unknown surface',
      target => ({ ...target, surface: 'video-image' }),
      'targets[].surface is invalid',
    ],
    [
      'missing branch owner',
      target => ({ ...target, community_id: undefined }),
      'targets[].community_id must be a UUID',
    ],
    [
      'wrong branch owner',
      target => ({ ...target, post_id: crypto.randomUUID() }),
      'Invalid request body',
    ],
    ['extra key', target => ({ ...target, injected: true }), 'Invalid request body'],
  ])('rejects a community image with %s before promotion', async (_label, mutate, message) => {
    const { form } = await createCopyrightFormFixture()
    const intake = await createParsedCopyrightEmailIntake()
    const staff = createRequest()
    await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
    const target = {
      surface: 'community-banner-image',
      community_id: crypto.randomUUID(),
      image_id: crypto.randomUUID(),
      target_url: 'https://voucha.ai/communities/example',
    }
    const response = await staff
      .post(`/api/v1/copyright-email-intakes/${intake.id}/approvals`)
      .send({
        ...form,
        targets: [mutate(target)],
        rationale: 'Staff reviewed the email.',
        manual_fallback_reason: 'No recommendation is available.',
      })
      .expect(422)
    expect(response.body.message).toBe(message)
    await expect(readCopyrightEmailIntakeReview(intake.id)).resolves.toEqual([])
  })
})
