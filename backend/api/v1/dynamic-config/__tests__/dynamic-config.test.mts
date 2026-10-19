import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { countDynamicConfigAuditRows, createTestUser } from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { dynamicConfigRegistry } from '@services/dynamic-config-admin/registry'
import { withIsolatedDynamicConfigForTest } from '@voucha/test-helpers/isolated-dynamic-config'

describe('PATCH /api/v1/dynamic-config/namespaces/:namespace audit failure', () => {
  it('returns a server error without changing the config when its audit insert fails', async () => {
    const developer = await createTestUser({ extraRoles: ['developer'] })
    const request = createRequest()
    await request.authenticateAs(developer)
    const requestId = crypto.randomUUID()
    const namespace = 'feature-flags'
    const entry = dynamicConfigRegistry.get(namespace)!
    await withIsolatedDynamicConfigForTest(entry, async config => {
      const previous = config.getFields().memberships
      const next = !previous
      const beforeCount = await countDynamicConfigAuditRows(namespace, developer.id)
      const { result: response, error } = await withPostgresPoolQueryFailureForTest(
        '/* recordDynamicConfigChange */',
        () =>
          request
            .patch(`/api/v1/dynamic-config/namespaces/${namespace}`)
            .set('x-request-id', requestId)
            .send({ config: { memberships: next } })
            .expect(500),
        { command: 'INSERT', requestId },
      )

      expect(error).toMatchObject({ code: '25P02' })
      expect(response.body).toMatchObject({
        code: '25P02',
        message: error.message,
        request_id: requestId,
      })
      expect(config.getFields().memberships).toBe(previous)
      await config.refresh()
      expect(config.getFields().memberships).toBe(previous)
      await expect(countDynamicConfigAuditRows(namespace, developer.id)).resolves.toBe(beforeCount)
    })
  })
})
