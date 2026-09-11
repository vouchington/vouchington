'use client'

import { clientApi } from './instance'
import { ApiError } from '../error'

export interface UploadUrlResponse {
  image_id: string
  upload_url: string
  content_type: string
  expires_at: string
}

export interface CompleteUploadResponse {
  id: string
  upload_status: 'pending' | 'processing' | 'complete' | 'failed'
}

export interface UploadStateResponse {
  id: string
  upload_status: 'pending' | 'processing' | 'complete' | 'failed'
  upload_error: string | null
  ready: boolean
  blocked: boolean
}

export async function getImageUploadUrl(
  contentType: string,
  contentLength: number,
): Promise<UploadUrlResponse> {
  const { upload } = await clientApi.post<{ upload: UploadUrlResponse }>(
    '/api/v1/images/upload-url',
    {
      content_type: contentType,
      content_length: contentLength,
    },
  )
  return upload
}

export async function completeImageUpload(imageId: string): Promise<CompleteUploadResponse> {
  try {
    const { image } = await clientApi.post<{ image: CompleteUploadResponse }>(
      `/api/v1/images/${imageId}/completions`,
    )
    return image
  } catch (error) {
    /* c8 ignore next -- defensive re-throw for 4xx client errors; retry logic is covered */
    if (error instanceof ApiError && error.status < 500) throw error
    const { image } = await clientApi.post<{ image: CompleteUploadResponse }>(
      `/api/v1/images/${imageId}/completions`,
    )
    return image
  }
}

export async function getImageUploadState(
  imageId: string,
  signal?: AbortSignal,
): Promise<UploadStateResponse> {
  const { upload_state } = await clientApi.get<{ upload_state: UploadStateResponse }>(
    `/api/v1/images/${imageId}/upload-state`,
    { signal },
  )
  return upload_state
}
