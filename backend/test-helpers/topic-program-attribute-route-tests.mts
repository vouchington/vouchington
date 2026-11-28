import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'

type TopicProgramKind = 'referral' | 'rewards'
type TopicProgramRoute = 'get' | 'patch'

type TopicProgramSpec = {
  kind: TopicProgramKind
  label: 'Referral' | 'Rewards'
  topicType: 'referral_program' | 'rewards_program'
  route: 'referral-program' | 'rewards-program'
  companySlugPart: '' | 'ref-'
  expectedPatchKeys: readonly string[]
}

const topicPrograms: Record<TopicProgramKind, TopicProgramSpec> = {
  referral: {
    kind: 'referral',
    label: 'Referral',
    topicType: 'referral_program',
    route: 'referral-program',
    companySlugPart: 'ref-',
    expectedPatchKeys: [
      'company_topic_id',
      'created_at',
      'disabled_at',
      'enabled_at',
      'topic_id',
      'updated_at',
    ],
  },
  rewards: {
    kind: 'rewards',
    label: 'Rewards',
    topicType: 'rewards_program',
    route: 'rewards-program',
    companySlugPart: '',
    expectedPatchKeys: ['company_topic_id', 'created_at', 'topic_id', 'updated_at'],
  },
}

const randomToken = () => Math.random().toString(36).slice(2, 8)
const programRoute = (spec: TopicProgramSpec, topicId: string) =>
  `/api/v1/topics/${topicId}/${spec.route}`

function attributesFromBody(
  body: Record<string, Record<string, unknown>>,
  spec: TopicProgramSpec,
): Record<string, unknown> {
  return spec.kind === 'referral'
    ? body.referral_program_attributes!
    : body.rewards_program_attributes!
}

const insertProgramTopic = (
  spec: TopicProgramSpec,
  ownerId: string,
  slug: string,
  random: string,
) =>
  insertTestTopic({
    name: `Test ${spec.label} Program ${random}`,
    slug,
    createdById: ownerId,
    topicType: spec.topicType,
  })

const insertCompanyTopic = (ownerId: string, slug: string, random: string) =>
  insertTestTopic({ name: `Test Company ${random}`, slug, createdById: ownerId })

/** Shared referral and rewards program attribute routes. Call from a literal `describe`. */
export function registerTopicProgramAttributeRouteTests(
  kind: TopicProgramKind,
  routes: readonly TopicProgramRoute[],
  longPublicCacheControl: string,
): void {
  const spec = topicPrograms[kind]
  if (routes.includes('get')) registerGetTests(spec, longPublicCacheControl)
  if (routes.includes('patch')) registerPatchTests(spec)
}

function registerGetTests(spec: TopicProgramSpec, longPublicCacheControl: string): void {
  describe(`GET /api/v1/topics/:idOrSlug/${spec.route}`, () => {
    it(`should return ${spec.kind} program attributes`, async () => {
      const admin = await createTestUser({ administrator: true })
      const random = randomToken()
      const topicId = await insertProgramTopic(
        spec,
        admin.id,
        `test-${spec.kind}-${random}`,
        random,
      )
      const companyId = await insertCompanyTopic(
        admin.id,
        `test-company-${spec.companySlugPart}get-${random}`,
        random,
      )
      const request = createRequest()
      await request.authenticateAs(admin)

      await request
        .patch(programRoute(spec, topicId))
        .send({ company_topic_id: companyId })
        .expect(200)

      const response = await request.get(programRoute(spec, topicId)).expect(200)
      expect(attributesFromBody(response.body, spec).company_topic_id).toBe(companyId)
      expect(response.headers['cache-control']).toBe(longPublicCacheControl)
    })

    it(`should return 400 for non-${spec.kind}-program topic`, async () => {
      const user = await createTestUser()
      const random = randomToken()
      const topicId = await insertTestTopic({
        name: `Test Topic ${random}`,
        slug: `test-topic-${spec.kind}-400-${random}`,
        createdById: user.id,
      })
      const request = createRequest()
      await request.get(programRoute(spec, topicId)).expect(400)
    })

    it(`should return 404 when ${spec.kind} program attributes are missing`, async () => {
      const user = await createTestUser()
      const random = randomToken()
      const topicId = await insertProgramTopic(
        spec,
        user.id,
        `test-${spec.kind}-missing-${random}`,
        random,
      )
      const request = createRequest()
      await request.get(programRoute(spec, topicId)).expect(404)
    })
  })
}

function registerPatchTests(spec: TopicProgramSpec): void {
  describe(`PATCH /api/v1/topics/:idOrSlug/${spec.route}`, () => {
    it(`should update ${spec.kind} program attributes when authenticated`, async () => {
      const admin = await createTestUser({ administrator: true })
      const random = randomToken()
      const topicId = await insertProgramTopic(
        spec,
        admin.id,
        `test-${spec.kind}-patch-${random}`,
        random,
      )
      const companyId = await insertCompanyTopic(
        admin.id,
        `test-company-${spec.companySlugPart}${random}`,
        random,
      )
      const request = createRequest()
      await request.authenticateAs(admin)

      const response = await request
        .patch(programRoute(spec, topicId))
        .send({ company_topic_id: companyId })
        .expect(200)

      const attributes = attributesFromBody(response.body, spec)
      expect(Object.keys(attributes).toSorted()).toEqual(spec.expectedPatchKeys)
      expect(attributes.company_topic_id).toBe(companyId)
      expect(attributes.topic_id).toBe(topicId)
      expect(attributes.created_at).toEqual(expect.any(String))
      expect(attributes.updated_at).toEqual(expect.any(String))
    })

    it('should return 401 when not authenticated', async () => {
      const user = await createTestUser()
      const random = randomToken()
      const topicId = await insertProgramTopic(
        spec,
        user.id,
        `test-${spec.kind}-401-${random}`,
        random,
      )
      const request = createRequest()
      await request.patch(programRoute(spec, topicId)).send({ company_topic_id: null }).expect(401)
    })

    it('should return 403 when user is not admin', async () => {
      const user = await createTestUser()
      const random = randomToken()
      const topicId = await insertProgramTopic(
        spec,
        user.id,
        `test-${spec.kind}-403-${random}`,
        random,
      )
      const request = createRequest()
      await request.authenticateAs(user)
      await request.patch(programRoute(spec, topicId)).send({ company_topic_id: null }).expect(403)
    })
  })
}
