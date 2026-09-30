/* oxlint-disable vitest/consistent-test-it, jest/consistent-test-it -- oxfmt rewrites it() to test() outside *.test.* files, and jest/no-export forbids exporting this registrar from a test file */
import { describe, expect, test } from 'vitest'
import { createTestUser, insertTestTopic } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'

type TopicProgramKind = 'referral' | 'rewards'
type TopicProgramRoute = 'get' | 'patch'

type TopicProgramSpec = {
  kind: TopicProgramKind
  label: 'Referral' | 'Rewards'
  topicType: 'referral_program' | 'rewards_program'
  route: 'referral-program' | 'rewards-program'
  attributesKey: 'referral_program_attributes' | 'rewards_program_attributes'
  companySlugPart: '' | 'ref-'
}

const topicPrograms: Record<TopicProgramKind, TopicProgramSpec> = {
  referral: {
    kind: 'referral',
    label: 'Referral',
    topicType: 'referral_program',
    route: 'referral-program',
    attributesKey: 'referral_program_attributes',
    companySlugPart: 'ref-',
  },
  rewards: {
    kind: 'rewards',
    label: 'Rewards',
    topicType: 'rewards_program',
    route: 'rewards-program',
    attributesKey: 'rewards_program_attributes',
    companySlugPart: '',
  },
}

function randomToken(): string {
  return Math.random().toString(36).slice(2, 8)
}

function programRoute(spec: TopicProgramSpec, topicId: string): string {
  return `/api/v1/topics/${topicId}/${spec.route}`
}

function companyIdFromBody(
  body: {
    referral_program_attributes: { company_id: string }
    rewards_program_attributes: { company_id: string }
  },
  spec: TopicProgramSpec,
): string {
  return spec.kind === 'referral'
    ? body.referral_program_attributes.company_id
    : body.rewards_program_attributes.company_id
}

async function insertProgramTopic(
  spec: TopicProgramSpec,
  ownerId: string,
  slug: string,
  random: string,
): Promise<string> {
  return insertTestTopic({
    name: `Test ${spec.label} Program ${random}`,
    slug,
    createdById: ownerId,
    topicType: spec.topicType,
  })
}

async function insertCompanyTopic(ownerId: string, slug: string, random: string): Promise<string> {
  return insertTestTopic({
    name: `Test Company ${random}`,
    slug,
    createdById: ownerId,
  })
}

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
    test(`should return ${spec.kind} program attributes`, async () => {
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

      await request.patch(programRoute(spec, topicId)).send({ company_id: companyId }).expect(200)

      const response = await request.get(programRoute(spec, topicId)).expect(200)
      expect(companyIdFromBody(response.body, spec)).toBe(companyId)
      expect(response.headers['cache-control']).toBe(longPublicCacheControl)
    })

    test(`should return 400 for non-${spec.kind}-program topic`, async () => {
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

    test(`should return 404 when ${spec.kind} program attributes are missing`, async () => {
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
    test(`should update ${spec.kind} program attributes when authenticated`, async () => {
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
        .send({ company_id: companyId })
        .expect(200)

      expect(companyIdFromBody(response.body, spec)).toBe(companyId)
    })

    test('should return 401 when not authenticated', async () => {
      const user = await createTestUser()
      const random = randomToken()
      const topicId = await insertProgramTopic(
        spec,
        user.id,
        `test-${spec.kind}-401-${random}`,
        random,
      )
      const request = createRequest()
      await request.patch(programRoute(spec, topicId)).send({ company_id: null }).expect(401)
    })

    test('should return 403 when user is not admin', async () => {
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
      await request.patch(programRoute(spec, topicId)).send({ company_id: null }).expect(403)
    })
  })
}
