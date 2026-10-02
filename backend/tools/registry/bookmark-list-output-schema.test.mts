import { documentedResponseProperty } from '@voucha/test-helpers/openapi-documented-response'
import { describe, expect, it } from 'vitest'
import addListItemTool from '../add-list-item.mts'
import createListTool from '../create-list.mts'
import setBookmarkTool from '../set-bookmark.mts'
import updateListTool from '../update-list.mts'

type JsonSchema = Record<string, unknown>

const properties = (schema: unknown): Record<string, unknown> =>
  (schema as JsonSchema)['properties'] as Record<string, unknown>

const BOOKMARK_ROUTE = '/api/v1/bookmarks/{entityType}/{entityId}/{predicate}'

// The bookmark and list routes document their bodies inline, so these tools own their output
// schemas. Wherever the generated OpenAPI document describes the same entity, the tool must keep
// the schema the document gives it.
describe('bookmark and list tool output schemas stay pinned to the documented REST twins', () => {
  it.each([
    [createListTool, 'post', '/api/v1/lists', '201', 'list'],
    [updateListTool, 'patch', '/api/v1/lists/{id}', '200', 'list'],
    [addListItemTool, 'post', '/api/v1/lists/{id}/items/posts', '201', 'list_item'],
    [addListItemTool, 'post', '/api/v1/lists/{id}/items/rss-feed-items', '201', 'list_item'],
  ] as const)(
    'takes %# result entity from the documented REST body',
    (tool, method, path, status, key) => {
      expect(properties(tool.meta?.outputSchema)[key]).toEqual(
        documentedResponseProperty(method, path, status, key),
      )
    },
  )

  it('takes the bookmark fields from the stored relation the PUT route returns', () => {
    const bookmark = properties(setBookmarkTool.meta?.outputSchema)['bookmark']
    const documented = properties(
      documentedResponseProperty('put', BOOKMARK_ROUTE, '200', 'bookmark'),
    )

    expect(Object.keys(properties(bookmark)).toSorted()).toEqual([
      'created_at',
      'created_by_id',
      'id',
      'object_id',
      'subject_id',
    ])
    for (const [field, schema] of Object.entries(properties(bookmark))) {
      expect(schema).toEqual(documented[field])
    }
  })
})
