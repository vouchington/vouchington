import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { QueueDomainControl } from './types.mts'

export type QueueDomainControlRow = {
  domain: string
  paused_at: Date | null
  paused_by_user_id: string | null
  reason: string | null
}

export function toQueueDomainControl(row: QueueDomainControlRow): QueueDomainControl {
  return {
    domain: row.domain,
    paused: row.paused_at !== null,
    pausedAt: row.paused_at?.toISOString() ?? null,
    pausedBy: row.paused_by_user_id,
    reason: row.reason,
  }
}

export function runningQueueDomainControl(domain: string): QueueDomainControl {
  return { domain, paused: false, pausedAt: null, pausedBy: null, reason: null }
}

/** One control per requested domain, in the order given; a domain with no row is running. */
export async function listQueueDomainControls(
  domains: readonly string[],
): Promise<QueueDomainControl[]> {
  const { rows } = await read<QueueDomainControlRow>(
    sql`/* listQueueDomainControls */
      SELECT domain, paused_at, paused_by_user_id, reason
      FROM queue_domain_controls
      WHERE domain = ANY(${domains})
    `,
  )
  const controls = new Map(rows.map(row => [row.domain, toQueueDomainControl(row)]))
  return domains.map(domain => controls.get(domain) ?? runningQueueDomainControl(domain))
}

export async function getQueueDomainControl(domain: string): Promise<QueueDomainControl> {
  const { rows } = await read<QueueDomainControlRow>(
    sql`/* getQueueDomainControl */
      SELECT domain, paused_at, paused_by_user_id, reason
      FROM queue_domain_controls
      WHERE domain = ${domain}
    `,
  )
  return rows[0] ? toQueueDomainControl(rows[0]) : runningQueueDomainControl(domain)
}
