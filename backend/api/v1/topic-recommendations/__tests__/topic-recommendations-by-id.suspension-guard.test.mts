import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  WEB_PROVENANCE,
  createRandomString,
  createTestUser,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { getPostByAny } from '@services/posts'
import { createTopicRecommendation } from '@services/topic-recommendations'

type Call = (
  request: ReturnType<typeof createRequest>,
  path: string,
) => PromiseLike<{ status: number; body: { code?: string } }>

const calls: Array<[string, Call]> = [
  [
    'PATCH',
    (request, path) => request.patch(path).send({ topic_title: 'Changed while suspended' }),
  ],
  ['DELETE', (request, path) => request.delete(path)],
]

async function storedTopicTitle(id: string) {
  return (await getPostByAny(id, { readOnly: false }))?.topic_recommendation?.topic_title
}

describe('topic recommendation suspension guards', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it.each(calls)(
    '%s /api/v1/topic-recommendations/:id refuses a suspended author without changing the recommendation',
    async (_method, call) => {
      const suffix = createRandomString(8).toLowerCase()
      const author = await createTestUser()
      const recommendation = await createTopicRecommendation(author, WEB_PROVENANCE, {
        markdown: `Why ${suffix}`,
        topic_title: `Guarded topic ${suffix}`,
        topic_slug: `guarded-topic-${suffix}`,
      })
      await suspendTestUser(author.id)
      suspendedUserIds.push(author.id)
      const request = createRequest()
      await request.authenticateAs(author)

      const response = await call(request, `/api/v1/topic-recommendations/${recommendation.id}`)

      expect(response.status).toBe(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
      expect(await storedTopicTitle(recommendation.id)).toBe(`Guarded topic ${suffix}`)
    },
  )

  it('PATCH /api/v1/topic-recommendations/:id still lets an active author edit', async () => {
    const suffix = createRandomString(8).toLowerCase()
    const author = await createTestUser()
    const recommendation = await createTopicRecommendation(author, WEB_PROVENANCE, {
      markdown: `Why ${suffix}`,
      topic_title: `Editable topic ${suffix}`,
      topic_slug: `editable-topic-${suffix}`,
    })
    const request = createRequest()
    await request.authenticateAs(author)

    await request
      .patch(`/api/v1/topic-recommendations/${recommendation.id}`)
      .send({ topic_title: `Edited topic ${suffix}` })
      .expect(200)

    expect(await storedTopicTitle(recommendation.id)).toBe(`Edited topic ${suffix}`)
  })
})
