import { write } from '@data-stores/psql'
import assert from 'http-assert'
import onError from '@modules/on-error'
import sql from 'sql-template-strings'
import { penalizeBlockedHostnameAttempt } from '@services/hostname-blocking/penalize-blocked-hostname-attempt'
import { assertUrlAllowedByWebRisk } from '@services/web-risk/check'

/**
 * Throws 422 if any of the given URL IDs belong to a site-wide blocked hostname.
 * Used to prevent linking posts to blocked-hostname URLs.
 *
 * If `userId` is provided and a blocked hostname is found, a stacking 20% vote
 * weight penalty is applied to the user before throwing.
 */
export async function assertUrlsHaveNoBlockedHostnames(
  urlIds: string[],
  userId?: string | null,
): Promise<void> {
  if (urlIds.length === 0) return

  const { rows } = await write(sql`/* assertUrlsHaveNoBlockedHostnames */
    SELECT url_hostnames.id AS hostname_id
    FROM urls
    JOIN url_hostnames ON url_hostnames.id = urls.hostname_id
    WHERE urls.id = ANY(${urlIds}::uuid[])
      AND url_hostnames.blocked = TRUE
    LIMIT 1
  `)

  if (rows.length > 0 && userId) {
    try {
      await penalizeBlockedHostnameAttempt(userId)
    } catch (err) {
      onError(err as Error)
    }
  }

  assert(rows.length === 0, 422, 'URL hostname is blocked')

  const { rows: urlRows } = await write(sql`/* assertUrlsHaveNoBlockedHostnames_getUrls */
    SELECT url
    FROM urls
    WHERE id = ANY(${urlIds}::uuid[])
  `)
  await Promise.all(
    (urlRows as Array<{ url: string }>).map(row => assertUrlAllowedByWebRisk(row.url)),
  )
}
