import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  insertTestReportIntegrityFlag,
  insertTestUrlHostname,
} from '@voucha/test-helpers'
import { applyReportAbusePenalty } from './apply-penalty.mts'

describe('applyReportAbusePenalty hostname output', () => {
  it('keeps the hostname fact in the resolved flag', async () => {
    const suffix = randomBytes(8).toString('hex')
    const adminUser = await createTestUserDirect({ username: `test-ri-host-${suffix}` })
    const hostname = `report-penalty-${suffix}.example.com`
    const hostnameId = await insertTestUrlHostname({ hostname })
    const flagId = await insertTestReportIntegrityFlag({ hostnameId })

    const result = await applyReportAbusePenalty(adminUser.id, flagId)
    expect(result.flag).toMatchObject({ hostname_id: hostnameId, hostname })
  })
})
