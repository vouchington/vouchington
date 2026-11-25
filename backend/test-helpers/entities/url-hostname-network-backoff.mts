import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { commitRelationWriteDuringCompetingMutationForTest } from '../relation-write-interleaving.mts'

export type TestHostnameNetworkBackoff = {
  consecutive_network_failures: number
  network_backoff_step: number
  network_backoff_ends_at: Date | null
  network_backoff_probe_claimed_at: Date | null
  consecutive_dns_failures: number
  is_crawlable: boolean
  updated_at: Date
}

export async function getTestHostnameNetworkBackoff(
  hostnameId: string,
): Promise<TestHostnameNetworkBackoff | undefined> {
  const { rows } = await write<TestHostnameNetworkBackoff>(sql`/* getTestHostnameNetworkBackoff */
    SELECT consecutive_network_failures, network_backoff_step, network_backoff_ends_at,
      network_backoff_probe_claimed_at, consecutive_dns_failures, is_crawlable, updated_at
    FROM url_hostnames
    WHERE id = ${hostnameId}
    LIMIT 1
  `)
  return rows[0]
}

/** Opens a step-1 backoff directly, for dispatch tests that do not exercise the trip. */
export async function openTestHostnameNetworkBackoff(hostnameId: string): Promise<void> {
  await write(sql`/* openTestHostnameNetworkBackoff */
    UPDATE url_hostnames
    SET network_backoff_step = 1, network_backoff_ends_at = CURRENT_TIMESTAMP + INTERVAL '1 hour'
    WHERE id = ${hostnameId}
  `)
}

/** Moves an open (or probing) backoff into the past instead of waiting for it to expire. */
export async function expireTestHostnameNetworkBackoff(hostnameId: string): Promise<void> {
  await write(sql`/* expireTestHostnameNetworkBackoff */
    UPDATE url_hostnames
    SET network_backoff_ends_at = CURRENT_TIMESTAMP - INTERVAL '1 second'
    WHERE id = ${hostnameId} AND network_backoff_ends_at IS NOT NULL
  `)
}

/** Opens or advances a backoff in a competing session before the reset can commit. */
export function changeTestBackoffDuringReset(
  hostnameId: string,
  step: 1 | 2,
  reset: () => Promise<void>,
): Promise<void> {
  return commitRelationWriteDuringCompetingMutationForTest(
    query =>
      query(sql`/* changeTestBackoffDuringReset */
      UPDATE url_hostnames SET network_backoff_step = ${step},
        consecutive_network_failures = 0,
        network_backoff_ends_at = CURRENT_TIMESTAMP + make_interval(hours => ${step})
      WHERE id = ${hostnameId}`),
    'resetHostnameFailures',
    reset,
  )
}
