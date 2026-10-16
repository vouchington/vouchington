import sql from 'sql-template-strings'
import { write } from '@data-stores/psql'

/** Writes a paused control row directly, without publishing the change to workers. */
export async function insertPausedQueueDomainControlForTest(domain: string): Promise<void> {
  await write(
    sql`/* insertPausedQueueDomainControlForTest */
      INSERT INTO queue_domain_controls (domain, paused_at) VALUES (${domain}, clock_timestamp())`,
  )
}

/** Removes the control rows a test created for its synthetic domains. */
export async function removeQueueDomainControlsForTest(domains: readonly string[]): Promise<void> {
  await write(
    sql`/* removeQueueDomainControlsForTest */
      DELETE FROM queue_domain_controls WHERE domain = ANY(${domains})`,
  )
}
