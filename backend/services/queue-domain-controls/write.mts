import { write } from '@data-stores/psql'
import {
  QUEUE_DOMAIN_CONTROLS_CHANGED_KEY,
  queueDomainControlsPubSub,
} from '@data-stores/valkey-pubsub'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import {
  getQueueDomainControl,
  runningQueueDomainControl,
  toQueueDomainControl,
  type QueueDomainControlRow,
} from './read.mts'
import type { QueueDomainControl } from './types.mts'

/**
 * Pauses a domain. A domain that is already paused keeps its original pause time, user, and reason,
 * so repeating the call changes nothing.
 */
export async function pauseQueueDomain(
  domain: string,
  input: { userId: string; reason?: string | null },
): Promise<QueueDomainControl> {
  const { rows } = await write<QueueDomainControlRow>(
    sql`/* pauseQueueDomain */
      INSERT INTO queue_domain_controls (domain, paused_at, paused_by, reason)
      VALUES (${domain}, clock_timestamp(), ${input.userId}, ${input.reason ?? null})
      ON CONFLICT (domain) DO UPDATE
        SET paused_at = EXCLUDED.paused_at, paused_by = EXCLUDED.paused_by, reason = EXCLUDED.reason
        WHERE queue_domain_controls.paused_at IS NULL
      RETURNING domain, paused_at, paused_by, reason
    `,
  )
  announceQueueDomainChange(domain)
  return rows[0] ? toQueueDomainControl(rows[0]) : getQueueDomainControl(domain)
}

/** Resumes a domain. Its deferred jobs re-check on their next activation, so no wakeup is needed. */
export async function resumeQueueDomain(domain: string): Promise<QueueDomainControl> {
  await write(
    sql`/* resumeQueueDomain */
      UPDATE queue_domain_controls
      SET paused_at = NULL, paused_by = NULL, reason = NULL
      WHERE domain = ${domain} AND paused_at IS NOT NULL
    `,
  )
  announceQueueDomainChange(domain)
  return runningQueueDomainControl(domain)
}

// Pub/sub only shortens the window before workers re-read PostgreSQL; the cache TTL bounds it.
function announceQueueDomainChange(domain: string): void {
  queueDomainControlsPubSub.publish(QUEUE_DOMAIN_CONTROLS_CHANGED_KEY, { domain }).catch(onError)
}
