import { write } from '@data-stores/psql'

type UpdateUrlOptions = {
  canonical_url_id?: string
  media_type_id?: string | number
}

/**
 * @public Retained provisionally under issue #1360; external production use is unconfirmed and this
 * export may be made private or removed after intended-use review. Evidence: `docs/overview/architecture/services/urls/README.md`.
 */
export const updateUrl = (id: string, options: UpdateUrlOptions) => {
  const sets: string[] = []
  const values: unknown[] = [id]
  for (const key of Object.keys(options) as Array<keyof UpdateUrlOptions>) {
    const value = options[key]
    switch (key) {
      case 'canonical_url_id':
        sets.push(`canonical_url_id = $${values.push(value)}`)
        break
      case 'media_type_id':
        sets.push(`media_type_id = $${values.push(value)}`)
        break
      default:
        break
    }
  }
  if (sets.length === 0) return null

  return write(
    `/* updateUrl */
    UPDATE urls
    SET ${sets.join(', ')}
    WHERE id = $1
    RETURNING *
  `,
    values,
  ).then(({ rows }) => rows[0])
}
