import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import {
  appliedThreshold,
  createThresholdManagementCase,
} from '@voucha/test-helpers/data-stores/psql/classifier-threshold-management'
import {
  rssItemSubject,
  seedGlobalDecision,
  seedMoment,
} from '@voucha/test-helpers/data-stores/psql/classifier-comparison-seeding'
import { setClassifierCandidateThreshold } from '@services/classifiers'
import { addUserRole } from '@services/users/roles-permissions'
import { getPrivateUserByAny } from '@services/users/get'
import type { PrivateUser } from '@services/users/types'

type ThresholdCase = Awaited<ReturnType<typeof createThresholdManagementCase>>

const WINDOW_QUERY = `from=${seedMoment(-6).toISOString()}&to=${seedMoment(6).toISOString()}`
const ABSENT_ID = '00000000-0000-7000-8000-00000000dead'

const classifierPath = (kase: ThresholdCase) =>
  `/api/v1/admin/classifiers/${kase.scope.classifierId}`
const historyPath = (kase: ThresholdCase, candidateId = kase.scope.candidateId) =>
  `${classifierPath(kase)}/candidates/${candidateId}/thresholds`

describe('admin classifier read routes', () => {
  let admin: PrivateUser
  let moderator: PrivateUser
  let regularUser: PrivateUser
  let kase: ThresholdCase

  const readRoutes: Array<[string, () => string]> = [
    ['the classifier list', () => '/api/v1/admin/classifiers?limit=1'],
    ['the candidate list', () => `${classifierPath(kase)}/candidates`],
    ['the threshold history', () => historyPath(kase)],
    [
      'the human vote comparison',
      () => `${classifierPath(kase)}/human-vote-comparison?${WINDOW_QUERY}`,
    ],
  ]

  beforeAll(async () => {
    ;[admin, regularUser, kase] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser(),
      createThresholdManagementCase(),
    ])
    const user = await createTestUser()
    await addUserRole(user.id, 'moderator')
    moderator = (await getPrivateUserByAny(user.id))!
  })

  it.each(readRoutes)('requires a signed-in user to read %s', async (_name, path) => {
    await createRequest().get(path()).expect(401)
  })

  it.each(readRoutes)('refuses a regular user reading %s', async (_name, path) => {
    const request = createRequest()
    await request.authenticateAs(regularUser)
    await request.get(path()).expect(403)
  })

  it.each(readRoutes)('lets a site moderator read %s', async (_name, path) => {
    const request = createRequest()
    await request.authenticateAs(moderator)
    await request.get(path()).expect(200)
  })

  it.each(readRoutes)('lets an administrator read %s', async (_name, path) => {
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get(path()).expect(200)
  })

  it('lists classifiers with a page of one and a cursor to continue', async () => {
    const request = createRequest()
    await request.authenticateAs(moderator)

    const response = await request.get('/api/v1/admin/classifiers?limit=1').expect(200)

    expect(response.body.results).toHaveLength(1)
    expect(response.body.results[0]).toEqual(
      expect.objectContaining({ id: expect.any(String), slug: expect.any(String) }),
    )
    // The fixture creates two classifiers, so another page always follows a page of one.
    expect(response.body.page_info).toMatchObject({ has_next_page: true })
    expect(typeof response.body.page_info.end_cursor).toBe('string')
  })

  it('lists the global and the community candidates with their effective thresholds', async () => {
    const { fixture } = kase
    const request = createRequest()
    await request.authenticateAs(moderator)
    const path = `${classifierPath(kase)}/candidates`

    const global = await request.get(path).expect(200)
    const community = await request.get(`${path}?community_id=${fixture.communityId}`).expect(200)

    expect(global.body.results).toMatchObject([
      {
        id: fixture.topicCandidateId,
        community_id: null,
        active_threshold: { effective_lower_threshold: 0.25, effective_upper_threshold: 0.75 },
      },
    ])
    expect(community.body.results).toMatchObject([
      {
        id: fixture.communityCandidateId,
        community_id: fixture.communityId,
        active_threshold: { lower_threshold_override: 0.3, effective_lower_threshold: 0.3 },
      },
    ])
  })

  it('pages a threshold history newest first with the cursor it returns', async () => {
    const { fixture, actor } = await createThresholdManagementCase()
    const scope = { classifierId: fixture.classifierId, candidateId: fixture.communityCandidateId }
    const changed = appliedThreshold(
      await setClassifierCandidateThreshold(actor.id, scope, { lower: 0.2, upper: 0.9 }),
    )
    const request = createRequest()
    await request.authenticateAs(moderator)
    const path = `/api/v1/admin/classifiers/${scope.classifierId}/candidates/${scope.candidateId}/thresholds`

    const first = await request.get(`${path}?limit=1`).expect(200)
    const second = await request
      .get(`${path}?limit=1&after=${first.body.page_info.end_cursor}`)
      .expect(200)

    expect(first.body.results).toMatchObject([{ id: changed.id, is_active: true }])
    expect(first.body.page_info.has_next_page).toBe(true)
    expect(second.body.results).toMatchObject([
      { id: fixture.communityThresholdId, is_active: false, deactivated_by_id: actor.id },
    ])
    expect(second.body.page_info.has_next_page).toBe(false)
  })

  it('refuses a history cursor that belongs to another candidate', async () => {
    const request = createRequest()
    await request.authenticateAs(moderator)
    const first = await request.get(`${historyPath(kase)}?limit=1`).expect(200)

    const response = await request.get(
      `${historyPath(kase, kase.fixture.communityCandidateId)}?after=${first.body.page_info.end_cursor}`,
    )

    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(response.status).toBeLessThan(500)
  })

  it('answers 404 for a classifier or candidate that does not exist', async () => {
    const request = createRequest()
    await request.authenticateAs(moderator)

    await request.get(`/api/v1/admin/classifiers/${ABSENT_ID}/candidates`).expect(404)
    await request.get(historyPath(kase, ABSENT_ID)).expect(404)
    await request
      .get(`/api/v1/admin/classifiers/${ABSENT_ID}/human-vote-comparison?${WINDOW_QUERY}`)
      .expect(404)
  })

  it('answers 422 for a path id that is not a UUID', async () => {
    const request = createRequest()
    await request.authenticateAs(moderator)

    await request.get('/api/v1/admin/classifiers/not-a-uuid/candidates').expect(422)
    await request.get(historyPath(kase, 'not-a-uuid')).expect(422)
  })
})

describe('GET /api/v1/admin/classifiers/:classifierId/human-vote-comparison', () => {
  let moderator: PrivateUser
  let kase: ThresholdCase

  const comparisonPath = () => `${classifierPath(kase)}/human-vote-comparison`

  beforeAll(async () => {
    const user = await createTestUser()
    await addUserRole(user.id, 'moderator')
    moderator = (await getPrivateUserByAny(user.id))!
    kase = await createThresholdManagementCase()
    await seedGlobalDecision(kase.fixture, { probability: 0.9, at: seedMoment(0) })
    await seedGlobalDecision(kase.fixture, {
      probability: 0.1,
      at: seedMoment(1),
      subject: rssItemSubject(kase.fixture),
    })
  })

  async function compare(query: string) {
    const request = createRequest()
    await request.authenticateAs(moderator)
    return request.get(`${comparisonPath()}?${query}`)
  }

  it('returns the aggregate cells of the requested window', async () => {
    const response = await compare(WINDOW_QUERY)

    expect(response.status).toBe(200)
    expect(response.body).toMatchObject({
      classifier_id: kase.scope.classifierId,
      batches_examined: 2,
      truncated: false,
      min_human_cohort: 20,
      cells: [
        { probability_lower: 0.1, classifier_vote: -1, decisions: 1, human: null },
        { probability_lower: 0.9, classifier_vote: 1, decisions: 1, human: null },
      ],
    })
  })

  it('narrows to a post, a feed item and a community', async () => {
    const { fixture } = kase

    const post = await compare(`${WINDOW_QUERY}&post_id=${fixture.postId}`)
    const item = await compare(`${WINDOW_QUERY}&rss_feed_item_id=${fixture.rssFeedItemId}`)
    const community = await compare(`${WINDOW_QUERY}&community_id=${fixture.communityId}`)

    expect(post.body).toMatchObject({ post_id: fixture.postId, batches_examined: 1 })
    expect(post.body.cells).toMatchObject([{ probability_lower: 0.9 }])
    expect(item.body).toMatchObject({
      rss_feed_item_id: fixture.rssFeedItemId,
      batches_examined: 1,
    })
    expect(item.body.cells).toMatchObject([{ probability_lower: 0.1 }])
    expect(community.body).toMatchObject({ community_id: fixture.communityId, batches_examined: 0 })
  })

  it.each([
    ['no window', ''],
    ['no end', `from=${seedMoment(-6).toISOString()}`],
    ['a window without an offset', 'from=2026-03-10T00:00:00&to=2026-03-11T00:00:00'],
    ['a window that is not a date', 'from=yesterday&to=today'],
    [
      'a window that ends before it starts',
      `from=${seedMoment(6).toISOString()}&to=${seedMoment(-6).toISOString()}`,
    ],
    ['a window longer than 31 days', 'from=2026-01-01T00:00:00Z&to=2026-03-01T00:00:00Z'],
    [
      'a post and a feed item together',
      `${WINDOW_QUERY}&post_id=${randomUUID()}&rss_feed_item_id=${randomUUID()}`,
    ],
    ['a community that is not a UUID', `${WINDOW_QUERY}&community_id=nope`],
  ])('answers 422 for %s', async (_name, query) => {
    const response = await compare(query)

    expect(response.status).toBe(422)
  })

  it('answers 422 for a classifier that does not choose topics', async () => {
    const request = createRequest()
    await request.authenticateAs(moderator)
    const storyPath = `/api/v1/admin/classifiers/${kase.fixture.storyClassifierId}`

    await request.get(`${storyPath}/human-vote-comparison?${WINDOW_QUERY}`).expect(422)
  })
})
