import { onGracefulShutdown } from '@data-stores/graceful-shutdown'
import { afterAll, describe, expect, it } from 'vitest'
import {
  insertRegistryRecordWithWrongImage,
  insertSurfaceChildForPostFamilyBinding,
} from '../../../test-helpers/data-stores/psql/schema-retained-media.mts'
import { insertTestImage } from '../../../test-helpers/entities/images-insert.mts'
import { createTestUser } from '../../../test-helpers/entities/users.mts'

describe('retained media binding behavior', () => {
  afterAll(() => onGracefulShutdown('SIGTERM'))

  it('rejects a surface child for a post-family binding', async () => {
    const user = await createTestUser()
    const imageId = await insertTestImage(user.id)
    await expect(insertSurfaceChildForPostFamilyBinding(user.id, imageId)).rejects.toMatchObject({
      code: '23503',
    })
  })

  it('rejects a registry image other than the retained placement image', async () => {
    const user = await createTestUser()
    const imageId = await insertTestImage(user.id)
    const wrongImageId = await insertTestImage(user.id)
    await expect(insertRegistryRecordWithWrongImage(imageId, wrongImageId)).rejects.toMatchObject({
      code: '23503',
    })
  })
})
