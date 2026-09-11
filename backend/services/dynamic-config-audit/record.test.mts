import { describe, it, expect, beforeAll } from 'vitest'
import { randomBytes } from 'node:crypto'
import { createTestUser, getDynamicConfigChangeLogRows } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { recordDynamicConfigChange } from './record.mts'

describe('recordDynamicConfigChange', () => {
  let adminUser: PrivateUser

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
  })

  it('inserts a row into dynamic_config_change_logs', async () => {
    const configKey = `test-config-${randomBytes(4).toString('hex')}`
    const prev = { multiplier_mfa: 1.5 }
    const next = { multiplier_mfa: 2.0 }

    await recordDynamicConfigChange(adminUser.id, configKey, prev, next)

    const rows = await getDynamicConfigChangeLogRows(configKey)

    const row = rows[0]
    expect(row).toBeDefined()
    expect(row.config_key).toBe(configKey)
    expect(row.previous_fields).toMatchObject(prev)
    expect(row.next_fields).toMatchObject(next)
    expect(row.changed_by_id).toBe(adminUser.id)
  })

  it('records multiple changes for the same config key', async () => {
    const configKey = `test-multi-${randomBytes(4).toString('hex')}`
    const change1 = { multiplier_mfa: 1.5 }
    const change2 = { multiplier_mfa: 2.0 }
    const change3 = { multiplier_mfa: 3.0 }

    await recordDynamicConfigChange(adminUser.id, configKey, change1, change2)
    await recordDynamicConfigChange(adminUser.id, configKey, change2, change3)

    const rows = await getDynamicConfigChangeLogRows(configKey)

    expect(rows).toHaveLength(2)
    expect(rows[0].next_fields).toMatchObject(change3)
    expect(rows[1].next_fields).toMatchObject(change2)
  })

  it('resolves without error when writing a valid audit record', async () => {
    const configKey = `test-valid-${randomBytes(4).toString('hex')}`
    const prev = { foo: 'bar' }
    const next = { foo: 'baz' }

    await expect(
      recordDynamicConfigChange(adminUser.id, configKey, prev, next),
    ).resolves.toBeUndefined()

    const rows = await getDynamicConfigChangeLogRows(configKey)

    expect(rows[0].changed_by_id).toBe(adminUser.id)
  })
})
