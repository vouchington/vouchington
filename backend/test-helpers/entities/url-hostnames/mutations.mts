import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function updateUrlHostnameBlocked(
  hostnameId: string,
  blocked: boolean,
): Promise<void> {
  if (blocked) {
    // Insert a block history row; the trigger keeps url_hostnames.blocked in sync.
    await write(sql`/* updateUrlHostnameBlocked:block */
      INSERT INTO url_hostname_blocks (url_hostname_id, blocked_source)
      VALUES (${hostnameId}, 'admin')
    `)
  } else {
    // Lift all active blocks; the trigger keeps url_hostnames.blocked in sync.
    await write(sql`/* updateUrlHostnameBlocked:unblock */
      UPDATE url_hostname_blocks
      SET lifted_at = CURRENT_TIMESTAMP
      WHERE url_hostname_id = ${hostnameId}
        AND lifted_at IS NULL
    `)
  }
}

export async function setHostnameAsValidForCrawlSearch(hostnameId: string): Promise<void> {
  // Lift any active blocks (trigger keeps url_hostnames.blocked in sync).
  await write(sql`/* setHostnameAsValidForCrawlSearch:unblock */
    UPDATE url_hostname_blocks
    SET lifted_at = CURRENT_TIMESTAMP
    WHERE url_hostname_id = ${hostnameId}
      AND lifted_at IS NULL
  `)
  await write(sql`/* setHostnameAsValidForCrawlSearch:crawlable */
    UPDATE url_hostnames
    SET crawlable = true
    WHERE id = ${hostnameId}
  `)
}

export async function updateUrlHostnameCrawlable(
  hostnameId: string,
  crawlable: boolean,
): Promise<void> {
  await write(sql`UPDATE url_hostnames SET crawlable = ${crawlable} WHERE id = ${hostnameId}`)
}

export async function updateUrlHostnameUnreliableStatusCodes(
  hostnameId: string,
  statusCodes: number[] | null,
): Promise<void> {
  await write(sql`/* updateUrlHostnameUnreliableStatusCodes */
    UPDATE url_hostnames
    SET unreliable_status_codes = ${statusCodes}
    WHERE id = ${hostnameId}
  `)
}

export async function insertUrlHostname(
  hostname: string,
  options: {
    emailable?: boolean | null
    blocked?: boolean | null
    crawlable?: boolean | null
  } = {},
): Promise<void> {
  await write(buildInsertUrlHostnameQuery(hostname, options, false))
}

export async function insertTestUrlHostname(options: {
  hostname: string
  emailable?: boolean | null
  blocked?: boolean | null
  crawlable?: boolean | null
}): Promise<string> {
  const result = await write(buildInsertUrlHostnameQuery(options.hostname, options, true))
  const hostnameId = result.rows[0].id as string
  // If blocked is requested, insert a history row so getTestHostnameRow returns consistent results.
  if (options.blocked === true) {
    await write(sql`/* insertTestUrlHostname:block */
      INSERT INTO url_hostname_blocks (url_hostname_id, blocked_source)
      VALUES (${hostnameId}, 'admin')
    `)
  }
  return hostnameId
}

function buildInsertUrlHostnameQuery(
  hostname: string,
  options: { emailable?: boolean | null; blocked?: boolean | null; crawlable?: boolean | null },
  returningId: boolean,
) {
  const { emailable, crawlable } = options
  let query = sql`INSERT INTO url_hostnames (hostname`
  let values = sql`${hostname}`
  if (emailable !== undefined) {
    query = query.append(sql`, emailable`)
    values = values.append(sql`, ${emailable}`)
  }
  if (crawlable !== undefined) {
    query = query.append(sql`, crawlable`)
    values = values.append(sql`, ${crawlable}`)
  }
  query = query
    .append(sql`) VALUES (`)
    .append(values)
    .append(sql`)`)
  return returningId ? query.append(sql` RETURNING id`) : query
}
