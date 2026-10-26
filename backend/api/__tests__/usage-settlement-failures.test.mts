import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { readApiUsageRows } from '@voucha/test-helpers/api-usage-analytics'
import { useRestUsageMetering, usageQuotaKeys } from '@voucha/test-helpers/rest-usage-meter'
import { registerFailingUsageResolverRoute } from '@voucha/test-helpers/usage-settlement-failures'
import { withResponseUsageSettlements } from '@voucha/test-helpers/usage-settlement'

const BASE = `/api/v1/__tests__/usage-failure-${crypto.randomUUID()}`
const resolverFailure = new Error('Owned units resolver failed')
registerFailingUsageResolverRoute(`${BASE}/resolver`, resolverFailure)

describe('HTTP usage settlement failure isolation', () => {
  const observedQuotaKeys = useRestUsageMetering('usage-settlement-failure-')

  it('keeps HTTP success without charging usage when the units resolver fails', async () => {
    const user = await createTestUser()
    const response = await withResponseUsageSettlements([user], async request =>
      request.get(`${BASE}/resolver`).expect(200),
    )
    expect(response.body).toEqual({ ok: true })
    expect(await readApiUsageRows(user.id)).toEqual([])
    expect(observedQuotaKeys().filter(key => key.includes(user.id))).toEqual([])
    expect(await usageQuotaKeys([`rest_user:user:${user.id}`])).toEqual([])
  })
})
