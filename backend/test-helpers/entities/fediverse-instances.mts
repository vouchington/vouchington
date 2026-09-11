import { randomUUID } from 'node:crypto'
import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { v7 as uuidv7 } from 'uuid'
import { insertTestTopic } from './topics/core.mts'
import { insertTestUrlHostname } from './url-hostnames/mutations.mts'
import { createTestUserDirect } from './users-direct.mts'

export async function insertApprovedTestFediverseInstance(hostname: string): Promise<void> {
  const [user, hostnameId] = await Promise.all([
    createTestUserDirect(),
    insertTestUrlHostname({ hostname }),
  ])
  if (!user) throw new Error('Failed to create user for approved test Fediverse instance')

  const suffix = randomUUID()
  const topicId = await insertTestTopic({
    name: `Approved Fediverse Instance ${suffix}`,
    slug: `approved-fediverse-instance-${suffix}`,
    createdById: user.id,
    topicType: 'fediverse_instance',
    hostnameId,
  })
  await insertTestFediverseInstanceExtension({ topicId, software: 'mastodon' })
  await insertTestFediverseInstanceIntegrationChange({
    topicId,
    integrationStatus: 'approved',
  })
}

export async function insertTestFediverseInstanceExtension(data: {
  topicId: string
  software?: string
  openRegistrations?: boolean
}): Promise<void> {
  await write(sql`/* insertTestFediverseInstanceExtension */
    INSERT INTO topics__fediverse_instances (topic_id, software, open_registrations)
    VALUES (${data.topicId}, ${data.software ?? null}, ${data.openRegistrations ?? null})
    ON CONFLICT (topic_id) DO NOTHING
  `)
}

export async function getTestFediverseInstanceIntegrationStatus(
  topicId: string,
): Promise<string | null> {
  const { rows } = await read(sql`/* getTestFediverseInstanceIntegrationStatus */
    SELECT integration_status FROM topics__fediverse_instances WHERE topic_id = ${topicId}
  `)
  return (rows[0]?.integration_status as string | undefined) ?? null
}

// Inserts a row directly into fediverse_instance_integration_changes, bypassing the
// service layer, so tests can control the row's UUIDv7 id (and therefore its
// insert-order relative to other rows) to simulate out-of-order transaction commits.
export async function insertTestFediverseInstanceIntegrationChange(data: {
  topicId: string
  integrationStatus: string
  changedById?: string | null
  reason?: string | null
  createdAt?: Date
}): Promise<string> {
  const id = data.createdAt ? uuidv7({ msecs: data.createdAt.getTime() }) : null
  const changedById = data.changedById === undefined ? null : data.changedById
  const reason = data.reason === undefined ? null : data.reason
  const { rows } = await write(sql`/* insertTestFediverseInstanceIntegrationChange */
    INSERT INTO fediverse_instance_integration_changes (id, topic_id, integration_status, changed_by_id, reason)
    VALUES (
      COALESCE(${id}::uuid, uuidv7()),
      ${data.topicId},
      ${data.integrationStatus},
      ${changedById},
      ${reason}
    )
    RETURNING id
  `)
  return rows[0].id as string
}
