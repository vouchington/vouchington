import { write } from '@data-stores/psql'
import { invalidate } from '@services/entity-cache/invalidate'

type UpdateUrlHostnameOptions = {
  crawlable?: boolean
  skip_web_risk?: boolean
  link_rel_follow?: boolean
  ignore_robots_txt?: boolean | null
  unreliable_status_codes?: number[] | null
}

export const updateUrlHostname = async (
  id: string,
  changes: UpdateUrlHostnameOptions,
): Promise<string | null> => {
  const sets: string[] = []
  const values: unknown[] = [id]
  for (const key of Object.keys(changes) as Array<keyof UpdateUrlHostnameOptions>) {
    const value = changes[key]
    switch (key) {
      case 'crawlable':
      case 'skip_web_risk':
      case 'link_rel_follow':
      case 'ignore_robots_txt':
      case 'unreliable_status_codes':
        if (value !== undefined) {
          sets.push(`${key} = $${values.push(value)}`)
        }
        break
      default:
        break
    }
  }

  if (sets.length === 0) return null

  const { rows } = await write(
    `/* updateUrlHostname */
    UPDATE url_hostnames
    SET ${sets.join(', ')}
    WHERE id = $1
    RETURNING id, hostname
  `,
    values,
  )
  const updatedHostname = rows[0] as { id: string; hostname: string } | undefined
  if (updatedHostname) {
    await invalidate.url_hostnames(updatedHostname)
  }
  return updatedHostname?.id || null
}
