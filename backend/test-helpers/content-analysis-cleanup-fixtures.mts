import { randomBytes } from 'node:crypto'
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { vi } from 'vitest'
import { userTag } from '../../ts-shared/cache/cache-tags.mts'
import { write } from '@data-stores/psql'
import { createTestUser } from './entities/users.mts'
import { setUserMarkdown } from './entities/users-lifecycle.mts'
import { createImageUploadUrl } from '../services/images/create-upload-url.mts'
import {
  claimImageUpload,
  persistPromotedImageKey,
} from '../services/images/complete-upload-state.mts'
import { persistImageHashWhileProcessing } from '../services/images/complete-upload-digest.mts'
import { markImageUploadFailed } from '../services/images/upload-state.mts'
import { getImageByIdFromPrimary } from '../services/images/get.mts'
import { imagesWorkMaxValues } from '../services/images/work-limits.mts'
import { imageUploadsQueue } from '../queues/image-uploads/queues.mts'
import { cachePurge } from '../queues/cache-purge/queues.mts'

/** Natural upload timestamps stay immutable; only the invocation clock advances. */
export async function createContentAnalysisCleanupFixtures() {
  const ownedUser = await createTestUser()
  const foreignUser = await createTestUser()
  if (!ownedUser.username || !foreignUser.username)
    throw new Error('Cleanup users need owned slugs')
  const markdown = 'This profile describes a community that enjoys reading books together.'
  await setUserMarkdown(ownedUser.id, markdown)
  await setUserMarkdown(foreignUser.id, markdown)
  const upload = async (user: { id: string }) =>
    (
      await createImageUploadUrl(user, {
        contentType: 'image/jpeg',
        contentLength: 1024,
        dependencies: { presignImageUploadUrl: async () => 'https://example.com/owned-upload' },
      })
    ).image_id
  const uploads = await Promise.allSettled([
    upload(ownedUser),
    upload(ownedUser),
    upload(foreignUser),
    upload(foreignUser),
    upload(foreignUser),
  ])
  const errors = uploads.flatMap(result => (result.status === 'rejected' ? [result.reason] : []))
  if (errors.length)
    throw new AggregateError(errors, 'Upload fixture creation failed', { cause: errors[0] })
  const [ownedRecovery, ownedPending, foreignRecovery, foreignFailed, foreignPending] = uploads.map(
    result => {
      if (result.status === 'rejected') throw result.reason
      return result.value
    },
  )
  const promote = async (userId: string, id: string) => {
    const hash = randomBytes(32)
    await claimImageUpload(userId, id)
    await persistImageHashWhileProcessing(hash, id)
    await persistPromotedImageKey(id, hash, hash.toString('hex'))
  }
  await promote(ownedUser.id, ownedRecovery)
  await promote(foreignUser.id, foreignRecovery)
  await claimImageUpload(foreignUser.id, foreignFailed)
  await markImageUploadFailed(foreignFailed, 'Owned foreign-exclusion control')
  const foreignIds = [foreignRecovery, foreignFailed, foreignPending]
  const foreignBefore = await Promise.all(foreignIds.map(id => getImageByIdFromPrimary(id, true)))
  const owned = await getImageByIdFromPrimary(ownedRecovery)
  if (!owned?.upload_staged_at) throw new Error('Recovery fixture has no staged source')
  const now = new Date(
    owned.upload_staged_at.getTime() +
      (imagesWorkMaxValues.abandoned_threshold_hours + 1) * 60 * 60 * 1000,
  )
  return {
    recoveryQueue: imageUploadsQueue,
    purgeQueue: cachePurge,
    ownedUserTags: [ownedUser.id, ownedUser.username].map(userTag),
    foreignUserTags: [foreignUser.id, foreignUser.username].map(userTag),
    ownedRecovery,
    ownedPending,
    foreignIds,
    foreignBefore,
    foreignUserId: foreignUser.id,
    foreignLanguageBefore: await readContentAnalysisUserLanguage(foreignUser.id),
    scope: { imageIds: [ownedRecovery, ownedPending], entityIds: [ownedUser.id], now },
  }
}

/** Answer only owned deletes at the external SDK edge; record attempted foreign work too. */
export function installContentAnalysisCleanupStorage(ownedIds: readonly string[]) {
  const deletedKeys: string[] = []
  const s3 = vi.spyOn(S3Client.prototype, 'send').mockImplementation(async (command: unknown) => {
    if (!(command instanceof DeleteObjectCommand) || !command.input.Key) {
      throw new Error('Unexpected S3 operation in cleanup worker')
    }
    deletedKeys.push(command.input.Key)
    if (!ownedIds.includes(command.input.Key)) throw new Error('Foreign storage deletion')
    return { $metadata: {} }
  })
  return { deletedKeys, restore: () => s3.mockRestore() }
}

export async function readContentAnalysisUserLanguage(userId: string) {
  const { rows } = await write<{
    lingua_rs_input_sha256: Buffer | null
    lingua_rs_detected_at: Date | null
  }>(
    `/* readContentAnalysisUserLanguage */
      SELECT lingua_rs_input_sha256, lingua_rs_detected_at FROM users WHERE id = $1`,
    [userId],
  )
  if (!rows[0]) throw new Error('Owned language fixture is missing')
  return rows[0]
}
