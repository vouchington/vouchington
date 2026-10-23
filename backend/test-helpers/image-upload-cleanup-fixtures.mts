import { backdateImageUploadStagedAt } from './entities/images.mts'
import { createTestUser } from './entities/users.mts'
import { createImageUploadUrl } from '../services/images/create-upload-url.mts'

/** An owned staged upload with ordinary service and persistence writes. */
export async function createOwnedStagedImage(
  stagedAt: Date,
  processing = false,
  owner?: { id: string },
) {
  const user = owner ?? (await createTestUser())
  const upload = await createImageUploadUrl(user, {
    contentType: 'image/jpeg',
    contentLength: 1024,
    dependencies: { presignImageUploadUrl: async () => 'https://example.com/owned-upload' },
  })
  await backdateImageUploadStagedAt(
    upload.image_id,
    stagedAt,
    processing ? 'processing' : undefined,
  )
  return upload.image_id
}
