import { write } from '@data-stores/psql'
import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { FEDIVERSE_INSTANCES_CLASSIFY_JOB } from '@queues/background/enqueues/fediverse-instances-jobs'
import { classifyFediverseInstance } from '@services/fediverse-search/adapters/instance-classification'
import { invalidate } from '@services/entity-cache/invalidate'
import sql from 'sql-template-strings'

const enqueueClassification = createBackgroundEnqueue(FEDIVERSE_INSTANCES_CLASSIFY_JOB)

export function enqueueCreatedFediverseInstanceClassification(topicId: string, hostnameId: string) {
  return enqueueClassification(
    { topicId, hostnameId },
    {
      deduplication: { id: `fediverse_instance_classification__${topicId}`, mode: 'simple' },
    },
  )
}

/** Enriches an existing topic after the create request has returned. */
export async function classifyCreatedFediverseInstance(
  topicId: string,
  hostnameId: string,
  classifyInstance: typeof classifyFediverseInstance = classifyFediverseInstance,
): Promise<void> {
  const { rows } = await write<{
    hostname: string
  }>(sql`/* classifyCreatedFediverseInstance:hostname */
    SELECT h.hostname
    -- no-mistakes-disable-next-line postgres-required-predicates: merge repoints this topic reference to destination; deleted_at remains checked
    FROM fediverse_instance_topics fi
    JOIN topics t ON t.id = fi.topic_id
    JOIN url_hostnames h ON h.id = t.hostname_id
    WHERE fi.topic_id = ${topicId} AND h.id = ${hostnameId}
      AND t.deleted_at IS NULL
    LIMIT 1
  `)
  const hostname = rows[0]?.hostname
  if (!hostname) return
  const classified = await classifyInstance(hostname)
  if (classified.status !== 'ok') {
    if (classified.error_code === 'unsupported_host') return
    throw new Error('Fediverse instance classification provider failed')
  }
  const metadata = classified.metadata
  const updated = await write(sql`/* classifyCreatedFediverseInstance:update */
    UPDATE fediverse_instance_topics fi
    SET software = ${metadata.software}, protocol = ${metadata.protocol},
        nodeinfo_software_version = ${metadata.nodeinfo_software_version},
        total_users = ${metadata.total_users},
        monthly_active_users = ${metadata.monthly_active_users},
        is_open_for_registrations = ${metadata.is_open_for_registrations},
        nodeinfo_raw = ${JSON.stringify(metadata.nodeinfo_raw)}::jsonb
    FROM topics t
    WHERE fi.topic_id = ${topicId} AND t.id = fi.topic_id
      AND t.deleted_at IS NULL
    RETURNING fi.topic_id
  `)
  if (updated.rows.length > 0) await invalidate.topics(topicId)
}
