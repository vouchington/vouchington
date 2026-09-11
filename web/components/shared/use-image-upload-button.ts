'use client'

import { useState } from 'react'
import {
  ImageBlockedError,
  ImageProcessingTimeoutError,
  uploadImageFile,
} from '@/lib/api/client/images'
import { toast } from 'sonner'
import { validateImageFile } from '@/lib/utils/image-types'
import {
  countRejected,
  showModerationAndTimeoutErrors,
  showOtherMultipleUploadErrors,
  showSingleUploadError,
} from './image-upload-toasts'

interface UseImageUploadButtonOptions {
  maxFiles?: number
  multiple: boolean
  onUploaded: (imageId: string) => void | Promise<void>
  onUploadEnd?: () => void
  onUploadStart?: () => void
}

export function useImageUploadButton({
  maxFiles,
  multiple,
  onUploaded,
  onUploadEnd,
  onUploadStart,
}: UseImageUploadButtonOptions) {
  const [uploading, setUploading] = useState(false)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [processingCount, setProcessingCount] = useState(0)

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (!e.target.files || e.target.files.length === 0) return

    if (!multiple) {
      const file = e.target.files[0]!
      e.target.value = ''
      await handleSingleFile(file)
      return
    }

    await handleMultipleFiles(e.target.files)
    e.target.value = ''
  }

  async function handleMultipleFiles(fileList: FileList) {
    let files = [...fileList]
    const selectedCount = files.length

    if (maxFiles !== undefined && files.length > maxFiles) {
      toast.error(
        `Only ${maxFiles} more image${maxFiles === 1 ? '' : 's'} can be added. The rest were skipped.`,
      )
      files = files.slice(0, maxFiles)
    }

    const validFiles = validateSelectedFiles(files, selectedCount)
    if (validFiles.length === 0) return

    setUploading(true)
    setUploadingCount(validFiles.length)
    onUploadStart?.()

    try {
      const uploadResults = await uploadFiles(validFiles)
      await showMultipleUploadResults(validFiles.length, uploadResults)
    } finally {
      resetUploadState()
    }
  }

  async function handleSingleFile(file: File) {
    const validationError = validateImageFile(file)
    if (validationError) {
      toast.error(validationError)
      return
    }

    setUploading(true)
    setUploadingCount(1)
    onUploadStart?.()
    try {
      const imageId = await uploadImageFile(file, {
        onPhase: phase => {
          if (phase === 'processing') setProcessingCount(1)
        },
      })
      await onUploaded(imageId)
    } catch (error) {
      showSingleUploadError(error)
    } finally {
      resetUploadState()
    }
  }

  async function uploadFiles(validFiles: File[]) {
    return Promise.allSettled(
      validFiles.map(file =>
        uploadImageFile(file, {
          onPhase: phase => {
            if (phase === 'processing') setProcessingCount(count => count + 1)
          },
        }),
      ),
    )
  }

  async function showMultipleUploadResults(
    validFileCount: number,
    uploadResults: PromiseSettledResult<string>[],
  ) {
    const blockedCount = countRejected(uploadResults, ImageBlockedError)
    const timeoutCount = countRejected(uploadResults, ImageProcessingTimeoutError)
    const uploadFailures = uploadResults.filter(result => result.status === 'rejected').length
    const successfulIds = uploadResults.flatMap(result =>
      result.status === 'fulfilled' ? [result.value] : [],
    )
    const callbackFailures = await notifyUploadedImages(successfulIds)
    const failCount = uploadFailures + callbackFailures

    showModerationAndTimeoutErrors(blockedCount, timeoutCount)
    showOtherMultipleUploadErrors(validFileCount, failCount, blockedCount, timeoutCount)
  }

  async function notifyUploadedImages(successfulIds: string[]) {
    let callbackFailures = 0
    await successfulIds.reduce(async (prev, id) => {
      await prev
      try {
        await onUploaded(id)
      } catch {
        callbackFailures += 1
      }
    }, Promise.resolve())
    return callbackFailures
  }

  function resetUploadState() {
    setUploading(false)
    setUploadingCount(0)
    setProcessingCount(0)
    onUploadEnd?.()
  }

  return {
    handleFileSelect,
    processingCount,
    uploading,
    uploadingCount,
  }
}

function validateSelectedFiles(files: File[], selectedCount: number) {
  const validFiles: File[] = []
  for (const file of files) {
    const validationError = validateImageFile(file)
    if (validationError) {
      toast.error(selectedCount > 1 ? `${file.name}: ${validationError}` : validationError)
    } else {
      validFiles.push(file)
    }
  }
  return validFiles
}
