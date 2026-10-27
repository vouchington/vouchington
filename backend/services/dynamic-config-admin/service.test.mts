import { describe, expect, it } from 'vitest'
import { createTestUser, softDeleteUser } from '@voucha/test-helpers'
import {
  countDynamicConfigAuditRows,
  getDynamicConfigAuditRowId,
} from '@voucha/test-helpers/sql-dynamic-config'
import { cleanupHistoryFixtureIds } from '@voucha/test-helpers/history-retention-reads'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { recordDynamicConfigChange } from '@services/dynamic-config-audit'
import { copyrightConfig } from '@services/copyright-notices/config'
import { getAutomaticWithholdingWindow } from '@services/copyright-notices/automatic-withholding-since'
import {
  getDynamicConfigNamespace,
  listDynamicConfigNamespaceHistory,
  updateDynamicConfigNamespace,
} from './service.mts'
import type { DynamicConfigUser } from './types.mts'

describe('dynamic-config-admin service authorization guards', () => {
  const regularUser: DynamicConfigUser = {
    id: 'user_regular',
    roles: [],
  }

  it('returns null when reading unknown or unauthorized namespaces', async () => {
    await expect(getDynamicConfigNamespace(regularUser, 'not-a-config')).resolves.toBeNull()
    await expect(getDynamicConfigNamespace(regularUser, 'feature-flags')).resolves.toBeNull()
  })

  it('returns null when updating unknown or unauthorized namespaces', async () => {
    await expect(
      updateDynamicConfigNamespace(regularUser, 'not-a-config', { memberships: true }),
    ).resolves.toBeNull()
    await expect(
      updateDynamicConfigNamespace(regularUser, 'feature-flags', { memberships: true }),
    ).resolves.toBeNull()
  })

  it('returns null when listing unauthorized namespace history', async () => {
    await expect(
      listDynamicConfigNamespaceHistory(regularUser, 'feature-flags'),
    ).resolves.toBeNull()
  })

  it('rejects a caller-supplied switch-on timestamp before recording an audit row', async () => {
    const admin = await createTestUser({ administrator: true })
    await expect(
      updateDynamicConfigNamespace(admin, 'copyright', {
        automaticProvisionalWithholdingSince: '2026-01-01T00:00:00.000Z',
      }),
    ).rejects.toThrow('automaticProvisionalWithholdingSince is managed by the switch')
    expect(await countDynamicConfigAuditRows('copyright', admin.id)).toBe(0)
  })

  it('publishes the on-period with the switch and retains it after audit deletion', async () => {
    const admin = await createTestUser({ administrator: true })
    await copyrightConfig.waitForInitialization()
    const restore = overrideDynamicConfigFieldsForTest(copyrightConfig, {
      automaticProvisionalWithholding: false,
      automaticProvisionalWithholdingSince: '',
    })
    const ownedAuditIds: string[] = []
    try {
      const readPublishedSince = async () =>
        (await getDynamicConfigNamespace(admin, 'copyright'))?.config
          .automaticProvisionalWithholdingSince
      expect(await readPublishedSince()).toBe('')
      await expect(getAutomaticWithholdingWindow()).resolves.toEqual({
        enabled: false,
        since: null,
      })
      const result = await updateDynamicConfigNamespace(admin, 'copyright', {
        automaticProvisionalWithholding: true,
      })
      expect(result?.changed).toBe(true)
      const published = await readPublishedSince()
      if (typeof published !== 'string' || published === '') {
        throw new Error('expected the switch-on instant')
      }
      const since = new Date(published)
      expect(since.toISOString()).toBe(published)
      await expect(getAutomaticWithholdingWindow()).resolves.toEqual({ enabled: true, since })
      ownedAuditIds.push(await getDynamicConfigAuditRowId('copyright', admin.id))
      await cleanupHistoryFixtureIds('dynamic_configuration_revisions', ownedAuditIds)
      ownedAuditIds.length = 0
      expect(await readPublishedSince()).toBe(published)
      await expect(getAutomaticWithholdingWindow()).resolves.toEqual({ enabled: true, since })
      await updateDynamicConfigNamespace(admin, 'copyright', {
        automaticProvisionalWithholding: false,
      })
      ownedAuditIds.push(await getDynamicConfigAuditRowId('copyright', admin.id))
      expect(await readPublishedSince()).toBe('')
      await expect(getAutomaticWithholdingWindow()).resolves.toEqual({
        enabled: false,
        since: null,
      })
    } finally {
      await cleanupHistoryFixtureIds('dynamic_configuration_revisions', ownedAuditIds)
      restore()
    }
  })

  it('returns null changed_by for soft-deleted users in namespace history', async () => {
    const admin = await createTestUser({ administrator: true })
    const actor = await createTestUser()
    await recordDynamicConfigChange(
      actor.id,
      'feature-flags',
      { memberships: false },
      { memberships: true },
    )
    const auditId = await getDynamicConfigAuditRowId('feature-flags', actor.id)
    await softDeleteUser(actor.id)

    const history = await listDynamicConfigNamespaceHistory(admin, 'feature-flags')

    expect(history?.find(row => row.id === auditId)?.changed_by).toBeNull()
  })
})
