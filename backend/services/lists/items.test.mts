import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestList, insertTestPost } from '@voucha/test-helpers'
import { withPostgresPoolQueryFailureForTest } from '@voucha/test-helpers/postgres-pool-query-failure'
import { addListItem, searchListItems } from './items.mts'

describe('list item storage errors', () => {
  it('rethrows the real pool error and permits retry after the failed client is destroyed', async () => {
    const user = await createTestUser()
    const list = await insertTestList({ ownerUserId: user.id, name: `List ${user.id}` })
    const postId = await insertTestPost({
      createdById: user.id,
      title: 'Pool failure fixture',
      slug: `pool-failure-${user.id}`,
      markdown: 'Owned list fixture',
    })
    const failure = await withPostgresPoolQueryFailureForTest('/* addListItem */', () =>
      addListItem(list.id, 'post', postId).catch((err: unknown) => err),
    )

    expect(failure.result).toMatchObject({ code: '25P02' })
    expect(failure.result).toBe(failure.error)
    expect((await searchListItems(list.id)).results).toEqual([])
    await expect(addListItem(list.id, 'post', postId)).resolves.toMatchObject({ entity_id: postId })
    expect((await searchListItems(list.id)).results).toHaveLength(1)
  })

  it('leaves matching SQL in another async context healthy while the fault is installed', async () => {
    const user = await createTestUser()
    const [targetList, outsideList, postId] = await Promise.all([
      insertTestList({ ownerUserId: user.id, name: `Target ${user.id}` }),
      insertTestList({ ownerUserId: user.id, name: `Outside ${user.id}` }),
      insertTestPost({
        createdById: user.id,
        title: 'Pool failure fixture',
        slug: `pool-failure-${user.id}`,
        markdown: 'Owned list fixture',
      }),
    ])
    const installed = Promise.withResolvers<void>()
    const completed = Promise.withResolvers<void>()
    const outside = (async () => {
      await installed.promise
      try {
        return await addListItem(outsideList.id, 'post', postId)
      } finally {
        completed.resolve()
      }
    })()

    const failure = await withPostgresPoolQueryFailureForTest('/* addListItem */', async () => {
      installed.resolve()
      await completed.promise
      return addListItem(targetList.id, 'post', postId).catch((err: unknown) => err)
    })

    expect(failure.result).toBe(failure.error)
    expect(failure.result).toMatchObject({ code: '25P02' })
    expect(await outside).toMatchObject({ list_id: outsideList.id, entity_id: postId })
    expect((await searchListItems(targetList.id)).results).toEqual([])
    expect((await searchListItems(outsideList.id)).results).toHaveLength(1)
    await expect(addListItem(targetList.id, 'post', postId)).resolves.toMatchObject({
      entity_id: postId,
    })
  })
})
