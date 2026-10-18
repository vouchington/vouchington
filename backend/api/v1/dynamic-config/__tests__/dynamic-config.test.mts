import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { countDynamicConfigAuditRows, createTestUser } from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { featureFlagsConfig } from '@services/feature-flags/config'

describe('PATCH /api/v1/dynamic-config/namespaces/:namespace audit failure', () => {
  it('returns a server error without changing the config when its audit insert fails', async () => {
    const developer = await createTestUser({ extraRoles: ['developer'] })
    const request = createRequest()
    await request.authenticateAs(developer)
    const requestId = crypto.randomUUID()
    const namespace = 'feature-flags'
    await featureFlagsConfig.waitForInitialization()
    const previous = featureFlagsConfig.getFields().memberships
    const next = !previous
    const beforeCount = await countDynamicConfigAuditRows(namespace)
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
    expect(featureFlagsConfig.getFields().memberships).toBe(previous)
    await featureFlagsConfig.refresh()
    expect(featureFlagsConfig.getFields().memberships).toBe(previous)
    await expect(countDynamicConfigAuditRows(namespace)).resolves.toBe(beforeCount)
  })
})
