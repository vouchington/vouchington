import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createTestMembership } from '@voucha/test-helpers/entities/memberships'
import type { PrivateUser } from '@services/users/types'
import {
  buildMembershipBenefitCatalog,
  MEMBERSHIP_BENEFIT_CATALOG_VERSION,
  membershipBenefitCatalog,
  type MembershipBenefitCatalog,
} from '@services/memberships/benefit-catalog'
import { responseBody } from '@voucha/test-helpers/api-fixtures/static-response-bodies'
import * as providerCatalog from '@services/memberships/provider-catalog'

import { v7 } from 'uuid'

describe('index', () => {
  let regularUser: PrivateUser

  beforeAll(async () => {
    regularUser = await createTestUser()
  })
  describe('GET /api/v1/memberships/plans', () => {
    beforeEach(() => {
      vi.spyOn(providerCatalog, 'getActiveMembershipCatalogFromPrimary').mockResolvedValue([
        {
          id: '00000000-0000-7000-8000-000000000006',
          plan: 'plus',
          interval: 'monthly',
          providers: [
            {
              provider: 'stripe',
              environment: 'test',
              application_id: 'voucha-web',
              product_id: 'price_index_plans_fixture',
              base_plan_id: null,
              offer_id: null,
              sku_id: null,
              price: { amount: 500, currency: 'usd' },
            },
          ],
        },
      ])
    })
    afterEach(() => vi.restoreAllMocks())

    it('rejects catalog entries that do not have live service-boundary enforcement', () => {
      const catalog = {
        version: MEMBERSHIP_BENEFIT_CATALOG_VERSION,
        groups: [{ id: 'research', benefits: [{ id: 'future_unenforced_benefit' }] }],
      } as unknown as MembershipBenefitCatalog

      expect(() => buildMembershipBenefitCatalog(catalog)).toThrow(
        'Membership benefit is not enforced: future_unenforced_benefit',
      )
    })

    it('rejects duplicate groups through the package catalog validation', () => {
      const catalog = {
        version: MEMBERSHIP_BENEFIT_CATALOG_VERSION,
        groups: [
          { id: 'research', benefits: [] },
          { id: 'research', benefits: [] },
        ],
      } as unknown as MembershipBenefitCatalog

      expect(() => buildMembershipBenefitCatalog(catalog)).toThrow(
        'Duplicate membership benefit group: research',
      )
    })

    it('keeps the public catalog locked to the versioned fixture source', () => {
      const fixture = responseBody('native.memberships.plans.default') as {
        benefit_catalog: MembershipBenefitCatalog
      }
      expect(membershipBenefitCatalog).toEqual(fixture.benefit_catalog)
    })

    it('returns a versioned plan-static benefit catalog', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/memberships/plans').expect(200)

      expect(response.body.benefit_catalog).toMatchObject({
        version: 1,
        groups: expect.arrayContaining([
          expect.objectContaining({ id: 'contribute' }),
          expect.objectContaining({ id: 'research' }),
          expect.objectContaining({ id: 'communities' }),
          expect.objectContaining({ id: 'support' }),
          expect.objectContaining({ id: 'referrals' }),
        ]),
      })
    })

    it('advertises support service level with qualitative values only', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/memberships/plans').expect(200)
      const benefits = response.body.benefit_catalog.groups.flatMap(
        (group: { id: string; benefits: Array<{ id: string; values: unknown }> }) =>
          group.benefits.map(benefit => ({ groupId: group.id, ...benefit })),
      ) as Array<{
        groupId: string
        id: string
        values: Record<string, { kind: string; level?: string }>
      }>
      const support = benefits.find(item => item.id === 'support_service_level')

      expect(support).toMatchObject({
        groupId: 'support',
        values: {
          free: { kind: 'level', level: 'standard' },
          plus: { kind: 'level', level: 'priority' },
          pro: { kind: 'level', level: 'highest_priority' },
        },
      })
      const serialized = JSON.stringify(response.body.benefit_catalog).toLowerCase()
      expect(serialized).not.toMatch(/faster|\bsla\b|queue score|1\/2\/3/)
    })

    it('never exposes private vote-weight mechanics in the benefit catalog', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/memberships/plans').expect(200)
      const serialized = JSON.stringify(response.body.benefit_catalog).toLowerCase()

      expect(serialized).not.toContain('vote_weight')
      expect(serialized).not.toContain('multiplier')
      expect(serialized).not.toContain('50x')
      expect(serialized).not.toContain('200x')
    })

    it('describes dynamic limits with qualitative values instead of numeric quotas', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/memberships/plans').expect(200)
      const benefits = response.body.benefit_catalog.groups.flatMap(
        (group: { benefits: Array<{ id: string }> }) => group.benefits,
      ) as Array<{ id: string; values: Record<string, Record<string, unknown>> }>

      for (const benefitId of [
        'contribution_capacity',
        'manual_topic_tags',
        'automatic_post_topics',
        'research_agent_requests',
        'api_allowance_boost',
      ]) {
        const benefit = benefits.find(item => item.id === benefitId)
        expect(benefit).toBeDefined()
        expect(Object.values(benefit!.values).every(value => value['kind'] === 'level')).toBe(true)
        expect(JSON.stringify(benefit)).not.toMatch(/daily|quota|limit|\d{2,}/i)
      }
    })

    it('returns products', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/memberships/plans').expect(200)

      expect(response.body).toHaveProperty('products')
      expect(Array.isArray(response.body.products)).toBe(true)
    })

    it('sets Cache-Control for unauthenticated requests', async () => {
      const request = createRequest()
      const response = await request.get('/api/v1/memberships/plans').expect(200)

      expect(response.headers['cache-control']).toMatch(/public/)
      expect(response.headers['cache-control']).toMatch(/max-age=/)
    })

    it('does not set Cache-Control for authenticated requests', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      const response = await request.get('/api/v1/memberships/plans').expect(200)

      expect(response.headers['cache-control']).toBeUndefined()
    })

    it('includes catalog products', async () => {
      const sku = { id: '00000000-0000-7000-8000-000000000006' }
      const request = createRequest()
      const response = await request.get('/api/v1/memberships/plans').expect(200)

      const products = response.body.products as Array<{ id: string }>
      const found = products.find((product: { id: string }) => product.id === sku.id)
      expect(found).toBeDefined()
    })

    it('returns SKU fields in response', async () => {
      const sku = { id: '00000000-0000-7000-8000-000000000006' }
      const request = createRequest()
      const response = await request.get('/api/v1/memberships/plans').expect(200)

      const products = response.body.products as Array<{
        id: string
        providers: Array<{ provider: string; price: unknown; product_id: string }>
      }>
      const found = products.find(product => product.id === sku.id)
      expect(found).toMatchObject({
        id: sku.id,
        plan: 'plus',
        providers: expect.arrayContaining([
          expect.objectContaining({
            provider: 'stripe',
            price: { amount: 500, currency: 'usd' },
            product_id: 'price_index_plans_fixture',
          }),
        ]),
      })
      expect(found).toHaveProperty('interval')
    })
  })

  describe('GET /api/v1/memberships/me', () => {
    it('returns 401 without authentication', async () => {
      const request = createRequest()
      await request.get('/api/v1/memberships/me').expect(401)
    })

    it('returns null when user has no membership', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      const response = await request.get('/api/v1/memberships/me').expect(200)

      expect(response.body.membership).toBeNull()
    })

    it('returns membership without Stripe IDs', async () => {
      const memberUser = await createTestUser()
      await createTestMembership({ user_id: memberUser.id, plan: 'plus' })

      const request = createRequest()
      await request.authenticateAs(memberUser)
      const response = await request.get('/api/v1/memberships/me').expect(200)

      expect(response.body.membership).toBeDefined()
      expect(response.body.membership.plan).toBe('plus')
      expect(response.body.membership.status).toBe('active')
      expect(response.body.membership).not.toHaveProperty('stripe_subscription_id')
      expect(response.body.membership).not.toHaveProperty('stripe_customer_id')
      expect(response.body.management).toBeNull()
    })

    it('returns membership with expected fields', async () => {
      const memberUser = await createTestUser()
      await createTestMembership({ user_id: memberUser.id, plan: 'plus' })

      const request = createRequest()
      await request.authenticateAs(memberUser)
      const response = await request.get('/api/v1/memberships/me').expect(200)

      const m = response.body.membership
      expect(m).toHaveProperty('id')
      expect(m).toHaveProperty('user_id', memberUser.id)
      expect(m).toHaveProperty('plan', 'plus')
      expect(m).toHaveProperty('status', 'active')
      expect(m).toHaveProperty('started_at')
    })
  })

  // keep generated shard bindings live for typecheck
  void (0 as unknown as typeof v7)
})
