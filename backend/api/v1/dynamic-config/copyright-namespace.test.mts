import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { countDynamicConfigAuditRows, createTestUser } from '@voucha/test-helpers'
import { persistDynamicConfigTestBaseline } from '@voucha/test-helpers/dynamic-config'
import { copyrightConfig } from '@services/copyright-notices/config'

const path = '/api/v1/dynamic-config/namespaces/copyright'

describe('copyright dynamic-config namespace', () => {
  it('launches with automatic provisional withholding off and audits a developer enabling it', async () => {
    const [developer, moderator] = await Promise.all([
      createTestUser({ extraRoles: ['developer'] }),
      createTestUser({ extraRoles: ['moderator'] }),
    ])
    const request = createRequest()
    await request.authenticateAs(developer)
    const current = await request.get(path).expect(200)
    expect(current.body.namespace.config).toEqual({ automaticProvisionalWithholding: false })
    const moderatorRequest = createRequest()
    await moderatorRequest.authenticateAs(moderator)
    await moderatorRequest
      .patch(path)
      .send({ config: { automaticProvisionalWithholding: true } })
      .expect(403)
    const auditRows = await countDynamicConfigAuditRows('copyright')

    try {
      const updated = await request
        .patch(path)
        .send({ config: { automaticProvisionalWithholding: true } })
        .expect(200)

      expect(updated.body).toMatchObject({
        changed: true,
        namespace: { config: { automaticProvisionalWithholding: true } },
      })
      expect(await countDynamicConfigAuditRows('copyright')).toBe(auditRows + 1)
      const history = await request.get(`${path}/history`).expect(200)
      expect(history.body.history[0]).toMatchObject({
        namespace: 'copyright',
        changed_by: { id: developer.id },
        changed_fields: { automaticProvisionalWithholding: { previous: false, next: true } },
      })
    } finally {
      // The route persisted the switch to the shared test Valkey; put the launch default back.
      await persistDynamicConfigTestBaseline(copyrightConfig)
    }
  })
})
