import assert from 'http-assert'
import { isUUID } from '@modules/utils'
import { normalizeUrlForUrlTable } from '@modules/utils/urls'
import { getUrlById } from '@services/urls'
import type { QueryOptions } from '@data-stores/psql/types'
import type { CreatePostInput } from '../types.mts'

/** Link posts resolve their URL source; other authored post types cannot supply one. */
export async function validateCreatePostUrl(
  updates: CreatePostInput,
  options: QueryOptions,
): Promise<void> {
  if (updates.post_type === 'link') {
    assert(
      updates.url_id != null || updates.url != null,
      422,
      'url or url_id is required for link posts',
    )
    if (updates.url_id != null) {
      assert(isUUID(updates.url_id), 422, 'url_id must be a valid UUID')
      const existingUrl = await getUrlById(updates.url_id, options)
      assert(existingUrl != null, 422, 'url_id does not exist')
    }
    if (updates.url != null) {
      assert(/^https:\/\//i.test(updates.url), 422, 'url must be a valid https URL')
      try {
        normalizeUrlForUrlTable(updates.url)
      } catch {
        assert(false, 422, 'url must be a valid https URL')
      }
    }
  } else {
    assert(updates.url_id == null, 422, 'url_id is only allowed for link posts')
    assert(updates.url == null, 422, 'url is only allowed for link posts')
  }
}
