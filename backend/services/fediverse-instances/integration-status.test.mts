import { expect, it, describe, beforeAll } from 'vitest'
import {
  getLatestIntegrationStatusChange,
  setIntegrationStatusAsAdmin,
} from './integration-status.mts'
import { beginTransaction, createTestTopic, createTestUser } from '@voucha/test-helpers'
import {
  getTestFediverseInstanceIntegrationStatus,
  insertTestFediverseInstanceExtension,
  insertTestFediverseInstanceIntegrationChange,
} from '@voucha/test-helpers/entities/fediverse-instances'
import type { PrivateUser } from '@services/users/types'

describe('integration-status', () => {
  let admin: PrivateUser
  let member: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    member = await createTestUser()
  })

  async function createTestInstanceTopic(hostnamePrefix: string): Promise<string> {
    const random = Math.random().toString(36).slice(2, 15)
    const topic = await createTestTopic({
      user: admin,
      topic_type: 'fediverse_instance',
      hostname: `${hostnamePrefix}-${random}.example.com`,
    })
    await insertTestFediverseInstanceExtension({ topicId: topic.id })
    return topic.id
  }

  it('setIntegrationStatusAsAdmin inserts a change and the trigger syncs the denormalized status', async () => {
    const topicId = await createTestInstanceTopic('sync')

    const result = await setIntegrationStatusAsAdmin(admin, {
      topicId,
      integrationStatus: 'approved',
      reason: 'looks legit',
    })
    expect(result).toBe('updated')

    const status = await getTestFediverseInstanceIntegrationStatus(topicId)
    expect(status).toBe('approved')

    const latest = await getLatestIntegrationStatusChange(topicId)
    expect(latest?.integration_status).toBe('approved')
    expect(latest?.changed_by_id).toBe(admin.id)
    expect(latest?.reason).toBe('looks legit')
  })

  it('setIntegrationStatusAsAdmin no-ops when the requested status already matches the latest row', async () => {
    const topicId = await createTestInstanceTopic('noop')

    await expect(
      setIntegrationStatusAsAdmin(admin, { topicId, integrationStatus: 'blocked' }),
    ).resolves.toBe('updated')
    await expect(
      setIntegrationStatusAsAdmin(admin, { topicId, integrationStatus: 'blocked' }),
    ).resolves.toBe('noop')
  })

  it('rejects a non-administrator current user', async () => {
    const topicId = await createTestInstanceTopic('forbidden')

    await expect(
      setIntegrationStatusAsAdmin(member, { topicId, integrationStatus: 'approved' }),
    ).rejects.toMatchObject({ status: 403 })

    const status = await getTestFediverseInstanceIntegrationStatus(topicId)
    expect(status).toBe('pending')
  })

  it('rejects a reason longer than 1000 characters', async () => {
    const topicId = await createTestInstanceTopic('long-reason')

    await expect(
      setIntegrationStatusAsAdmin(admin, {
        topicId,
        integrationStatus: 'approved',
        reason: 'x'.repeat(1001),
      }),
    ).rejects.toMatchObject({ status: 400 })

    const status = await getTestFediverseInstanceIntegrationStatus(topicId)
    expect(status).toBe('pending')
  })

  it('updates status when called with an existing transaction query', async () => {
    const topicId = await createTestInstanceTopic('nested-tx')
    await using transaction = await beginTransaction()
    const result = await setIntegrationStatusAsAdmin(
      admin,
      { topicId, integrationStatus: 'approved' },
      { query: transaction },
    )
    await transaction.commit()
    expect(result).toBe('updated')

    const status = await getTestFediverseInstanceIntegrationStatus(topicId)
    expect(status).toBe('approved')
  })

  it('getLatestIntegrationStatusChange returns null when no change has ever been recorded', async () => {
    const topicId = await createTestInstanceTopic('no-change')

    const latest = await getLatestIntegrationStatusChange(topicId)
    expect(latest).toBeNull()
  })

  it('trigger reads the highest-id row rather than trusting the just-inserted row (out-of-order commit defense)', async () => {
    const topicId = await createTestInstanceTopic('out-of-order')
    const now = new Date()

    // Simulate a transaction that logically happened later (later timestamp, higher
    // UUIDv7 id) committing to the database FIRST.
    await insertTestFediverseInstanceIntegrationChange({
      topicId,
      integrationStatus: 'approved',
      createdAt: new Date(now.getTime() + 60_000),
    })

    // A transaction that logically happened earlier (earlier timestamp, lower UUIDv7
    // id) commits SECOND — its AFTER INSERT trigger fires last, but must not blindly
    // trust NEW.integration_status ('blocked'); it must re-read the MAX(id) row.
    await insertTestFediverseInstanceIntegrationChange({
      topicId,
      integrationStatus: 'blocked',
      createdAt: now,
    })

    const status = await getTestFediverseInstanceIntegrationStatus(topicId)
    expect(status).toBe('approved')
  })
})
