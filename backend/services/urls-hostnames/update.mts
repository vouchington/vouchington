import { beginTransaction } from '@data-stores/psql'
import { enqueueHostnameCacheInvalidation } from '@services/entity-cache/hostname-invalidation-work'
import { drainHostnameCacheInvalidationWork } from '@services/entity-cache/hostname-invalidation-drain'
import onError from '@modules/on-error'
import { lockHostnameOwnership } from './ownership-lock.mts'

type UpdateUrlHostnameOptions = {
  is_crawlable?: boolean
  should_skip_web_risk?: boolean
  should_follow_link_rel?: boolean
  should_ignore_robots_txt?: boolean | null
  unreliable_status_codes?: number[] | null
}

export const updateUrlHostname = async (
  id: string,
  changes: UpdateUrlHostnameOptions,
  options: { introducePublicly?: boolean } = {},
): Promise<string | null> => {
  const sets: string[] = []
  const values: unknown[] = [id]
  for (const key of Object.keys(changes) as Array<keyof UpdateUrlHostnameOptions>) {
    const value = changes[key]
    switch (key) {
      case 'is_crawlable':
      case 'should_skip_web_risk':
      case 'should_follow_link_rel':
      case 'should_ignore_robots_txt':
      case 'unreliable_status_codes':
        if (value !== undefined) {
          sets.push(`${key} = $${values.push(value)}`)
        }
        break
      default:
        break
    }
  }

  if (options.introducePublicly) {
    sets.push('publicly_introduced_at = COALESCE(publicly_introduced_at, CURRENT_TIMESTAMP)')
  }

  if (sets.length === 0) return null

  await using transaction = await beginTransaction()
  if (options.introducePublicly) await lockHostnameOwnership(transaction, [id])
  const { rows } = await transaction(
    `/* updateUrlHostname */
    UPDATE url_hostnames
    SET ${sets.join(', ')}
    WHERE id = $1
    RETURNING id, hostname
  `,
    values,
  )
  const updatedHostname = rows[0] as { id: string; hostname: string } | undefined
  if (updatedHostname) await enqueueHostnameCacheInvalidation(transaction, [updatedHostname.id])
  await transaction.commit()
  if (updatedHostname)
    await drainHostnameCacheInvalidationWork({ hostnameIds: [updatedHostname.id] }).catch(onError)
  return updatedHostname?.id || null
}
