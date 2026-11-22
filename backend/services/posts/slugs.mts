import { uuidv7RandomToBase36, createSlugFromTitle, isUUID, validateSlug } from '@modules/utils'
import { write } from '@data-stores/psql'
import { isUniqueViolation } from '@vouchington/postgres'
import type { QueryOptions } from '@data-stores/psql/types'
import assert from 'http-assert'
import sql from 'sql-template-strings'
export const createPostSlug = async (
  post: { id: string; title: string | null },
  _slug: string | undefined,
  options: QueryOptions,
) => {
  assert(post.title, 422, 'Title is required')
  const slug = _slug || `${createSlugFromTitle(post.title, 50)}-${uuidv7RandomToBase36(post.id)}`
  validateSlug(slug)
  // Post detail routes resolve UUID-shaped :idOrSlug as IDs before consulting post_slugs,
  // so a UUID-shaped slug would 404. Reject it here.
  assert(!isUUID(slug), 422, 'Slug must not be a UUID')

  try {
    const result = await write(
      sql`/* createPostSlug */
      INSERT INTO post_slugs (post_id, slug)
      VALUES (${post.id}, ${slug})
    `,
      options,
    )
    return result
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      assert(false, 409, `Slug "${slug}" already exists`)
    }
    throw err
  }
}
