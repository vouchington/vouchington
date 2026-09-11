import { ImageBlockedError, ImageProcessingTimeoutError } from '@/lib/api/client/images'
import { ApiError } from '@/lib/api/error'
import { toast } from 'sonner'

export function countRejected<T extends new (...args: never[]) => Error>(
  uploadResults: PromiseSettledResult<string>[],
  ErrorClass: T,
) {
  return uploadResults.filter(
    result => result.status === 'rejected' && result.reason instanceof ErrorClass,
  ).length
}

export function showModerationAndTimeoutErrors(blockedCount: number, timeoutCount: number) {
  if (blockedCount > 0) {
    toast.error(
      blockedCount === 1
        ? 'Image blocked by content moderation.'
        : `${blockedCount} images blocked by content moderation.`,
    )
  }

  if (timeoutCount > 0) {
    toast.error(
      timeoutCount === 1
        ? 'Image is still processing. Please refresh in a moment.'
        : `${timeoutCount} images are still processing. Please refresh in a moment.`,
    )
  }
}

export function showOtherMultipleUploadErrors(
  validFileCount: number,
  failCount: number,
  blockedCount: number,
  timeoutCount: number,
) {
  const otherFailCount = failCount - blockedCount - timeoutCount
  if (otherFailCount === 0) return

  const successCount = validFileCount - failCount
  if (successCount === 0 && blockedCount === 0 && timeoutCount === 0) {
    toast.error(
      validFileCount === 1
        ? 'Failed to upload image. Please try again.'
        : 'Failed to upload images. Please try again.',
    )
    return
  }

  toast.error(`${otherFailCount} of ${validFileCount} images failed to upload or process.`)
}

export function showSingleUploadError(err: unknown) {
  if (err instanceof ImageBlockedError) {
    toast.error('Image blocked by content moderation.')
  } else if (err instanceof ImageProcessingTimeoutError) {
    toast.error('Image is still processing. Please refresh in a moment.')
  } else if (err instanceof ApiError) {
    toast.error(err.message || 'Failed to upload image. Please try again.')
  } else {
    toast.error('Failed to upload image. Please try again.')
  }
}
