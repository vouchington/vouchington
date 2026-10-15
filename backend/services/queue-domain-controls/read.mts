import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { QueueDomainControl } from './types.mts'

export type QueueDomainControlRow = {
  domain: string
  paused_at: Date | null
  paused_by: string | null
  reason: string | null
}

export function toQueueDomainControl(row: QueueDomainControlRow): QueueDomainControl {
  return {
    domain: row.domain,
    paused: row.paused_at !== null,
    pausedAt: row.paused_at?.toISOString() ?? null,
    pausedBy: row.paused_by,
    reason: row.reason,
  }
}

export function runningQueueDomainControl(domain: string): QueueDomainControl {
  return { domain, paused: false, pausedAt: null, pausedBy: null, reason: null }
}

/** Every domain's control row; a domain with no row is running. One row per registered domain at most. */
export async function listQueueDomainControls(): Promise<QueueDomainControl[]> {
  const { rows } = await read<QueueDomainControlRow>(
    sql`/* listQueueDomainControls */
      SELECT domain, paused_at, paused_by, reason
      FROM queue_domain_controls
      ORDER BY domain
    `,
  )
  return rows.map(toQueueDomainControl)
}

export async function getQueueDomainControl(domain: string): Promise<QueueDomainControl> {
  const { rows } = await read<QueueDomainControlRow>(
    sql`/* getQueueDomainControl */
      SELECT domain, paused_at, paused_by, reason
      FROM queue_domain_controls
      WHERE domain = ${domain}
    `,
  )
  return rows[0] ? toQueueDomainControl(rows[0]) : runningQueueDomainControl(domain)
}
