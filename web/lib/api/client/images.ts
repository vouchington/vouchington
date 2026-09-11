'use client'

import { ApiError } from '../error'
import { completeImageUpload, getImageUploadState, getImageUploadUrl } from './image-upload-api'
import {
  InternalImageBlockedError,
  InternalImageProcessingTimeoutError,
} from './image-upload-errors'
import {
  INTERNAL_POLL_INTERVAL_MS,
  INTERNAL_POLL_MAX_ERRORS,
  INTERNAL_POLL_TIMEOUT_MS,
  internalPollImageUntilTerminal,
} from './image-upload-polling'
import { pollImageUntilUploaded } from './image-upload-wait'

export const ImageBlockedError = InternalImageBlockedError
export const ImageProcessingTimeoutError = InternalImageProcessingTimeoutError
export const POLL_INTERVAL_MS = INTERNAL_POLL_INTERVAL_MS
export const POLL_MAX_ERRORS = INTERNAL_POLL_MAX_ERRORS
export const POLL_TIMEOUT_MS = INTERNAL_POLL_TIMEOUT_MS
/** Waits for moderation terminal state when callers explicitly need ready/blocked/failed. */
export const pollImageUntilTerminal = internalPollImageUntilTerminal
export { pollImageUntilUploaded } from './image-upload-wait'
const CROSS_USER_DEDUP_MESSAGE = 'Image upload matched an image that is not available to this user'

export type UploadPhase = 'uploading' | 'processing'

interface UploadOptions {
  onPhase?: (phase: UploadPhase) => void
  signal?: AbortSignal
}

export async function uploadImageFile(file: File, options: UploadOptions = {}): Promise<string> {
  options.onPhase?.('uploading')
  const { image_id, upload_url, content_type } = await getImageUploadUrl(file.type, file.size)
  const uploadUrl = new URL(upload_url)
  if (uploadUrl.protocol !== 'https:' && !isLocalHttpUploadUrl(uploadUrl)) {
    throw new ApiError('Invalid upload URL', 500)
  }

  // upload_url is a backend-issued presigned object-storage URL; CI uses localhost HTTP.
  const s3Response = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': content_type },
  })

  if (!s3Response.ok) {
    throw new ApiError(`Failed to upload image: ${s3Response.statusText}`, s3Response.status)
  }

  const result = await completeImageUpload(image_id)
  options.onPhase?.('processing')
  const dedupedImage = result.id !== image_id
  if (dedupedImage) {
    try {
      const state = await getImageUploadState(result.id, options.signal)
      if (state.blocked) {
        throw new ImageBlockedError(result.id)
      }
      if (state.upload_status === 'failed') {
        throw new ApiError(state.upload_error ?? 'Image processing failed', 422)
      }
      if (state.upload_status === 'complete' || state.ready) return result.id
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw new ApiError(CROSS_USER_DEDUP_MESSAGE, 409)
      }
      if (!(error instanceof ApiError) || (error.status < 500 && error.status !== 429)) {
        throw error
      }
      // Transient probe failures should not block the upload wait below.
    }
  }
  try {
    await pollImageUntilUploaded(result.id, { signal: options.signal })
  } catch (error) {
    if (dedupedImage && error instanceof ApiError && error.status === 404) {
      throw new ApiError(CROSS_USER_DEDUP_MESSAGE, 409)
    }
    throw error
  }
  return result.id
}

function isLocalHttpUploadUrl(url: URL): boolean {
  const hostname = url.hostname.replace(/^\[(.*)\]$/, '$1')
  return (
    url.protocol === 'http:' &&
    (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1')
  )
}
