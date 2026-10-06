import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createCopyrightFormFixture } from '@voucha/test-helpers/copyright-route-fixtures'
import { useCopyrightIntakeEnvironment } from '@voucha/test-helpers/services/copyright-notices/intake-environment'

describe('copyright duplicate targets', () => {
  useCopyrightIntakeEnvironment()

  it('rejects duplicate hosted placements before persisting a notice', async () => {
    const fixture = await createCopyrightFormFixture()
    const request = createRequest()
    await request.authenticateAs(fixture.claimant)
    const target = fixture.form.targets[0]!
    const response = await request
      .post('/api/v1/copyright-notices')
      .set('Idempotency-Key', crypto.randomUUID())
      .send({
        ...fixture.form,
        targets: [
          target,
          {
            surface: 'post-image',
            post_id: target.post_id.toUpperCase(),
            image_id: target.image_id.toUpperCase(),
            target_url: `${target.target_url}?duplicate=1`,
          },
        ],
      })
    expect(response.status).toBe(422)
    expect(response.body.message).toBe('targets must be unique')
  })
})
