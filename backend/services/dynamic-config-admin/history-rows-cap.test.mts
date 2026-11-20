import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { getDynamicConfigAuditRowId } from '@voucha/test-helpers/sql-dynamic-config'
import { cleanupHistoryFixtureIds } from '@voucha/test-helpers/history-retention-reads'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { recordDynamicConfigChange } from '@services/dynamic-config-audit'
import { listDynamicConfigNamespaceHistory } from './service.mts'
import { dynamicConfigAdminWorkConfig } from './work-limits.mts'

describe('namespace history rows limit', () => {
  it('lists only the configured number of newest audit rows', async () => {
    const admin = await createTestUser({ administrator: true })
    const auditIds: string[] = []
    for (let index = 0; index < 3; index++) {
      const actor = await createTestUser()
      await recordDynamicConfigChange(
        actor.id,
        'feature-flags',
        { memberships: false },
        { memberships: true },
      )
      auditIds.push(await getDynamicConfigAuditRowId('feature-flags', actor.id))
    }
    const restore = overrideDynamicConfigFieldsForTest(dynamicConfigAdminWorkConfig, {
      namespace_history_rows: 2,
    })
    try {
      const limited = await listDynamicConfigNamespaceHistory(admin, 'feature-flags')
      expect(limited).toHaveLength(2)
      overrideDynamicConfigFieldsForTest(dynamicConfigAdminWorkConfig, {
        namespace_history_rows: 3,
      })
      const widened = await listDynamicConfigNamespaceHistory(admin, 'feature-flags')
      expect(widened).toHaveLength(3)
    } finally {
      restore()
      await cleanupHistoryFixtureIds('dynamic_configuration_revisions', auditIds)
    }
  })
})
