import { describe, expect, it } from 'vitest'
import { DynamicConfig } from '@data-stores/valkey/dynamic-config'
import { createRequest } from '@voucha/test-helpers/api/server'
import { countDynamicConfigAuditRows, createTestUser } from '@voucha/test-helpers'
import {
  closeScopedDynamicConfigContext,
  createDynamicConfigTestKey,
} from '@voucha/test-helpers/dynamic-config'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import {
  dynamicConfigRegistry,
  type getDynamicConfigRegistryEntry,
} from '@services/dynamic-config-admin/registry'

describe('PATCH /api/v1/dynamic-config/namespaces/:namespace audit failure', () => {
  it('returns a server error without changing the config when its audit insert fails', async () => {
    const developer = await createTestUser({ extraRoles: ['developer'] })
    const request = createRequest()
    await request.authenticateAs(developer)
    const requestId = crypto.randomUUID()
    const namespace = createDynamicConfigTestKey('api-audit-failure')
    const config = new DynamicConfig({
      key: namespace,
      fieldTypes: { enabled: 'boolean' },
      defaultFields: { enabled: false },
    })
    const entry: NonNullable<ReturnType<typeof getDynamicConfigRegistryEntry>> = {
      namespace,
      label: 'Owned audit failure config',
      description: 'Isolated boolean configuration for an audit failure.',
      config,
      access: { update_roles: ['developer'] },
      fields: { enabled: { description: 'Enable this isolated configuration.' } },
    }
    dynamicConfigRegistry.push(entry)
    try {
      await config.waitForInitialization()
      expect(config.getFields()).toEqual({ enabled: false })
      const beforeCount = await countDynamicConfigAuditRows(namespace)
      const { result: response, error } = await withPostgresPoolQueryFailureForTest(
        '/* recordDynamicConfigChange */',
        () =>
          request
            .patch(`/api/v1/dynamic-config/namespaces/${namespace}`)
            .set('x-request-id', requestId)
            .send({ config: { enabled: true } })
            .expect(500),
        { command: 'INSERT', requestId },
      )

      expect(error).toMatchObject({ code: '25P02' })
      expect(response.body).toMatchObject({
        code: '25P02',
        message: error.message,
        request_id: requestId,
      })
      expect(config.getFields()).toEqual({ enabled: false })
      await config.refresh()
      expect(config.getFields()).toEqual({ enabled: false })
      await expect(countDynamicConfigAuditRows(namespace)).resolves.toBe(beforeCount)
    } finally {
      const index = dynamicConfigRegistry.indexOf(entry)
      if (index >= 0) dynamicConfigRegistry.splice(index, 1)
      await closeScopedDynamicConfigContext([config])
    }
  })
})
