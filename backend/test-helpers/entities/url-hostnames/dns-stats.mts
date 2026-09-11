import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export type TestHostnameDnsStats = {
  consecutive_dns_failures: number
  last_dns_failure_at: Date | null
  dns_disabled_at: Date | null
  crawlable: boolean | null
}

export async function getTestHostnameDnsStats(
  hostnameId: string,
): Promise<TestHostnameDnsStats | undefined> {
  const { rows } = await read(sql`/* getTestHostnameDnsStats */
    SELECT consecutive_dns_failures, last_dns_failure_at, dns_disabled_at, crawlable
    FROM url_hostnames
    WHERE id = ${hostnameId}
    LIMIT 1
  `)
  return rows[0] as TestHostnameDnsStats | undefined
}

export async function setTestHostnameStaleDnsFailures(
  hostnameId: string,
  count: number,
): Promise<void> {
  await write(sql`/* setTestHostnameStaleDnsFailures */
    UPDATE url_hostnames
    SET consecutive_dns_failures = ${count},
        last_dns_failure_at = CURRENT_TIMESTAMP - INTERVAL '8 days'
    WHERE id = ${hostnameId}
  `)
}
