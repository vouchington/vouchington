import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@voucha/types/entities/user'
import { MediaError } from '@vouchington/media'

const validateMediaUploadMock = vi.hoisted(() =>
  vi.fn<typeof import('@vouchington/media').validateMediaUpload>(),
)

vi.mock<typeof import('@vouchington/media')>(
  import('@vouchington/media'),
  async importOriginal => ({
    ...(await importOriginal<typeof import('@vouchington/media')>()),
    validateMediaUpload: validateMediaUploadMock,
  }),
)

const { createImageUploadUrl } = await import('./create-upload-url.mts')

describe('createImageUploadUrl utility failures', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('preserves typed validation failures outside the image policy contract', async () => {
    const error = new MediaError('POLICY_INVALID', 'unexpected validation failure')
    validateMediaUploadMock.mockImplementationOnce(() => {
      throw error
    })

    await expect(
      createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
      }),
    ).rejects.toBe(error)
  })
})
