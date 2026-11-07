import { describe, it, expect } from 'vitest'
import {
  createTestUser,
  createRandomString,
  insertTestPost,
  WEB_PROVENANCE,
} from '@voucha/test-helpers'
import { createList } from '../lists.mts'
import { addListItem, addListItems } from '../items.mts'

describe('addListItems', () => {
  it('adds a batch in one call, returns existing rows for repeats, and omits unknown ids', async () => {
    const user = await createTestUser()
    const list = await createList(user.id, WEB_PROVENANCE, {
      name: `Batch ${createRandomString(8)}`,
    })
    const [firstPostId, secondPostId] = await Promise.all(
      [0, 1].map(() =>
        insertTestPost({
          title: `Batch Post ${createRandomString(8)}`,
          slug: `batch-post-${createRandomString(8)}`,
          createdById: user.id,
          markdown: 'test content',
        }),
      ),
    )
    const existing = await addListItem(list.id, 'post', firstPostId!)

    const added = await addListItems(list.id, 'post', [
      firstPostId!,
      secondPostId!,
      secondPostId!,
      crypto.randomUUID(),
    ])

    expect([...added.keys()].toSorted()).toEqual([firstPostId!, secondPostId!].toSorted())
    expect(added.get(firstPostId!)!.id).toBe(existing.id)
    expect(added.get(secondPostId!)!.list_id).toBe(list.id)
  })
})
