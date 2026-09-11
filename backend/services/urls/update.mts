import { write } from '@data-stores/psql'

type UpdateUrlOptions = {
  canonical_url_id?: string
  url_content_type_id?: string | number
}

export const updateUrl = (id: string, options: UpdateUrlOptions) => {
  const sets: string[] = []
  const values: unknown[] = [id]
  for (const key of Object.keys(options) as Array<keyof UpdateUrlOptions>) {
    const value = options[key]
    switch (key) {
      case 'canonical_url_id':
        sets.push(`canonical_url_id = $${values.push(value)}`)
        break
      case 'url_content_type_id':
        sets.push(`url_content_type_id = $${values.push(value)}`)
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
