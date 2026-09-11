import { describe, expect, it } from 'vitest'
import { createTestUser, softDeleteUser } from '@voucha/test-helpers'
import { recordDynamicConfigChange } from '@services/dynamic-config-audit'
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

  it('returns null changed_by for soft-deleted users in namespace history', async () => {
    const admin = await createTestUser({ administrator: true })
    const actor = await createTestUser()
    await recordDynamicConfigChange(
      actor.id,
      'feature-flags',
      { memberships: false },
      { memberships: true },
    )
    await softDeleteUser(actor.id)

    const history = await listDynamicConfigNamespaceHistory(admin, 'feature-flags')

    expect(history?.[0]?.changed_by).toBeNull()
  })
})
