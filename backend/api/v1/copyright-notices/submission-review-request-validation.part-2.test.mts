import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'

const SUBMISSIONS = '/api/v1/copyright-submissions'
const ROUTES = ['appeal-reviews', 'counter-notice-reviews', 'legal-hold-assessments']

describe('copyright submission review non-object bodies', () => {
  // A JSON `null` used to throw a TypeError (500) when the shared review reader read `rationale`.
  // An unknown submission is the service's 404, so a 422 here means the request never reached it
  // and no review or assessment was recorded.
  it.each(ROUTES.flatMap(route => ['null', '[]'].map(raw => [route, raw])))(
    'answers 422 on %s for the body %s before the service runs',
    async (route, raw) => {
      const staff = createRequest()
      await staff.authenticateAs(await createTestUser({ extraRoles: ['moderator'] }))
      const response = await staff
        .post(`${SUBMISSIONS}/${crypto.randomUUID()}/${route}`)
        .set('Content-Type', 'application/json')
        .send(raw)
        .expect(422)
      expect(response.body.message).toBe('Invalid request body')
    },
  )
})
