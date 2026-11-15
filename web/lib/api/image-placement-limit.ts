import { ApiError } from '@vouchington/api-client'

export const IMAGE_PLACEMENT_LIMIT_REACHED = 'IMAGE_PLACEMENT_LIMIT_REACHED'
export const IMAGE_PLACEMENT_LIMIT_MESSAGE =
  'This image is already used in many places. Remove it from another profile, topic, community, or post before adding it here.'

export function getPostImageUpdateFailureMessage(
  error: unknown,
  postImageLimitMessage?: string,
): string {
  if (!(error instanceof ApiError)) {
    return 'Post saved, but images could not be updated. Please try again.'
  }
  if (error.code === 'POST_IMAGE_LIMIT_REACHED' && postImageLimitMessage) {
    return postImageLimitMessage
  }
  const message =
    error.code === IMAGE_PLACEMENT_LIMIT_REACHED ? IMAGE_PLACEMENT_LIMIT_MESSAGE : error.message
  return `Post saved, but images failed: ${message}`
}
