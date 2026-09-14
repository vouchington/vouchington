import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { countDynamicConfigAuditRows, createTestUser } from '@voucha/test-helpers'
import {
  closeScopedDynamicConfigContext,
  createDynamicConfigTestKey,
} from '@voucha/test-helpers/dynamic-config'
import { DynamicConfig } from '@data-stores/valkey'
import {
  dynamicConfigRegistry,
  type DynamicConfigRegistryEntry,
} from '@services/dynamic-config-admin'
import type { PrivateUser } from '@services/users/types'

describe('dynamic-config', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser
  const temporaryEntries: DynamicConfigRegistryEntry[] = []

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser({ administrator: false })
  })

  afterEach(async () => {
    for (const entry of temporaryEntries.splice(0)) {
      const index = dynamicConfigRegistry.indexOf(entry)
      if (index >= 0) dynamicConfigRegistry.splice(index, 1)
      await closeScopedDynamicConfigContext([entry.config as DynamicConfig])
    }
  })

  describe('GET /api/v1/dynamic-config/namespaces', () => {
    it('returns 401 without authentication', async () => {
      const request = createRequest()
      await request.get('/api/v1/dynamic-config/namespaces').expect(401)
    })

    it('lists all registered namespaces for administrators', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request.get('/api/v1/dynamic-config/namespaces').expect(200)

      expect(response.body.namespaces.map((item: { namespace: string }) => item.namespace)).toEqual(
        expect.arrayContaining([
          'feature-flags',
          'vote-weight-config',
          'recaptcha-config',
          'post-content-limits-config',
          'rate-limit-thresholds',
          'route-rate-limit-config',
          'bloom-filter-config',
          'rss-feed-discoverability-config',
          'rss-feed-crawl-config',
          'user-import-export-config',
          'web-risk-config',
        ]),
      )
    })

    it('hides namespaces from non-admin users without namespace grants', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      const response = await request.get('/api/v1/dynamic-config/namespaces').expect(200)

      expect(response.body.namespaces).toEqual([])
    })
  })

  describe('GET /api/v1/dynamic-config/namespaces/:namespace', () => {
    it('returns a namespace with field metadata for administrators', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const response = await request
        .get('/api/v1/dynamic-config/namespaces/feature-flags')
        .expect(200)

      expect(response.body.namespace.namespace).toBe('feature-flags')
      expect(response.body.namespace.fields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ name: 'memberships', type: 'boolean' }),
          expect.objectContaining({ name: 'chat', type: 'boolean' }),
        ]),
      )
    })

    it('returns 403 for non-admin users without namespace grants', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request.get('/api/v1/dynamic-config/namespaces/feature-flags').expect(403)
    })

    it('returns 404 for unknown namespaces', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      await request.get('/api/v1/dynamic-config/namespaces/not-a-config').expect(404)
    })
  })

  describe('PATCH /api/v1/dynamic-config/namespaces/:namespace', () => {
    it('updates a field, records audit history, and returns changed fields', async () => {
      const { namespace } = await registerTemporaryConfig({ enabled: false })
      const request = createRequest()
      await request.authenticateAs(admin)

      const patchResponse = await request
        .patch(`/api/v1/dynamic-config/namespaces/${namespace}`)
        .send({ config: { enabled: true } })
        .expect(200)

      expect(patchResponse.body.changed).toBe(true)
      expect(patchResponse.body.namespace.config.enabled).toBe(true)

      const historyResponse = await request
        .get(`/api/v1/dynamic-config/namespaces/${namespace}/history`)
        .expect(200)

      expect(historyResponse.body.history[0]).toMatchObject({
        namespace,
        changed_by: { id: admin.id },
        changed_fields: {
          enabled: { previous: false, next: true },
        },
      })
    })

    it('does not write audit rows for no-op updates', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)
      const before = await request
        .get('/api/v1/dynamic-config/namespaces/recaptcha-config')
        .expect(200)
      const enabled = before.body.namespace.config.enabled as boolean
      const beforeCount = await countDynamicConfigAuditRows('recaptcha-config')

      const response = await request
        .patch('/api/v1/dynamic-config/namespaces/recaptcha-config')
        .send({ config: { enabled } })
        .expect(200)

      expect(response.body.changed).toBe(false)
      expect(await countDynamicConfigAuditRows('recaptcha-config')).toBe(beforeCount)
    })

    it('returns validation errors for invalid updates', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      await request
        .patch('/api/v1/dynamic-config/namespaces/feature-flags')
        .send({ config: { memberships: 'yes' } })
        .expect(400)

      await request.patch('/api/v1/dynamic-config/namespaces/feature-flags').send({}).expect(400)

      await request
        .patch('/api/v1/dynamic-config/namespaces/recaptcha-config')
        .send({ config: { block_threshold: 2 } })
        .expect(400)

      await request
        .patch('/api/v1/dynamic-config/namespaces/vote-weight-config')
        .send({ config: { threshold_30_days_ms: 1 } })
        .expect(400)

      await request
        .patch('/api/v1/dynamic-config/namespaces/post-content-limits-config')
        .send({ config: { data_point_topic_ids_max_items: 0 } })
        .expect(400)

      await request
        .patch('/api/v1/dynamic-config/namespaces/rss-feed-crawl-config')
        .send({ config: { tier2_sla_ms: 1 } })
        .expect(400)

      await request
        .patch('/api/v1/dynamic-config/namespaces/user-import-export-config')
        .send({ config: { sync_export_max_items: 50_001 } })
        .expect(400)

      await request
        .patch('/api/v1/dynamic-config/namespaces/web-risk-config')
        .send({ config: { enabled: 'yes' } })
        .expect(400)
    })

    it('enforces the ActivityPub inbox rate-limit ranges', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      await request
        .patch('/api/v1/dynamic-config/namespaces/route-rate-limit-config')
        .send({
          config: {
            activitypub_inbox_attempt_max_requests: 300,
            activitypub_inbox_attempt_window_seconds: 60,
          },
        })
        .expect(200)

      for (const config of [
        { activitypub_inbox_attempt_max_requests: 0 },
        { activitypub_inbox_attempt_max_requests: 10_001 },
        { activitypub_inbox_attempt_window_seconds: 0 },
        { activitypub_inbox_attempt_window_seconds: 3_601 },
        { activitypub_inbox_attempt_window_seconds: 1.5 },
        { activitypub_inbox_max_requests: 0 },
        { activitypub_inbox_max_requests: 10_001 },
        { activitypub_inbox_window_seconds: 0 },
        { activitypub_inbox_window_seconds: 3_601 },
        { activitypub_inbox_window_seconds: 1.5 },
      ]) {
        await request
          .patch('/api/v1/dynamic-config/namespaces/route-rate-limit-config')
          .send({ config })
          .expect(400)
      }
    })

    it('allows namespaces with valid non-positive numeric thresholds', async () => {
      const { namespace } = await registerTemporaryConfig({ threshold: -4 })
      const request = createRequest()
      await request.authenticateAs(admin)

      await request
        .patch(`/api/v1/dynamic-config/namespaces/${namespace}`)
        .send({ config: { threshold: -5 } })
        .expect(200)
    })

    it('returns 403 for non-admin users without namespace grants', async () => {
      const request = createRequest()
      await request.authenticateAs(regularUser)
      await request
        .patch('/api/v1/dynamic-config/namespaces/feature-flags')
        .send({ config: { memberships: true } })
        .expect(403)
    })
  })

  describe('removed specialized dynamic config routes', () => {
    it('returns 404 for old dynamic config-specific admin routes', async () => {
      const request = createRequest()
      await request.authenticateAs(admin)

      await request.get('/api/v1/vote-weight-config').expect(404)
      await request.get('/api/v1/recaptcha-config').expect(404)
      await request.get('/api/v1/post-content-limits-config').expect(404)
      await request.get('/api/v1/rate-limit-config').expect(404)
      await request.get('/api/v1/rate-limit-config/route').expect(404)
      await request.get('/api/v1/valkey/bloom-filter-config').expect(404)
    })
  })

  async function registerTemporaryConfig(
    defaultFields: Record<string, boolean | number | string>,
  ): Promise<DynamicConfigRegistryEntry> {
    const namespace = createDynamicConfigTestKey('api')
    const config = new DynamicConfig({
      key: namespace,
      fieldTypes: Object.fromEntries(
        Object.entries(defaultFields).map(([name, value]) => [name, typeof value]),
      ) as Record<string, 'boolean' | 'number' | 'string'>,
      defaultFields,
    })
    await config.waitForInitialization()
    const entry: DynamicConfigRegistryEntry = {
      namespace,
      label: 'Temporary test config',
      description: 'Worker-unique DynamicConfig API persistence fixture.',
      config,
      access: { update_roles: ['developer'] },
      fields: Object.fromEntries(
        Object.keys(defaultFields).map(name => [name, { description: 'Temporary test field.' }]),
      ),
    }
    dynamicConfigRegistry.push(entry)
    temporaryEntries.push(entry)
    return entry
  }
})
