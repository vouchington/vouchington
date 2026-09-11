'use client'

import { useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SUPPORTED_IMAGE_ACCEPT } from '@/lib/utils/image-types'
import { useImageUploadButton } from './use-image-upload-button'

interface ImageUploadButtonProps {
  onUploaded: (imageId: string) => void | Promise<void>
  onUploadStart?: () => void
  onUploadEnd?: () => void
  disabled?: boolean
  label?: string
  'data-pw'?: string
  multiple?: boolean
  maxFiles?: number
}

export function ImageUploadButton({
  onUploaded,
  onUploadStart,
  onUploadEnd,
  disabled,
  label = 'Upload image',
  'data-pw': dataPw = 'image-upload-button',
  multiple = false,
  maxFiles,
}: ImageUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { handleFileSelect, processingCount, uploading, uploadingCount } = useImageUploadButton({
    maxFiles,
    multiple,
    onUploaded,
    onUploadEnd,
    onUploadStart,
  })
  const uploadingLabel = getUploadingLabel(processingCount > 0, uploadingCount)

  return (
    <>
      <Button
        type='button'
        variant='outline'
        size='sm'
        onClick={() => fileInputRef.current?.click()}
        loading={uploading}
        disabled={disabled || uploading}
        {...(dataPw && { 'data-pw': `${dataPw}-trigger` })}
      >
        {uploading ? uploadingLabel : label}
      </Button>
      <Input
        ref={fileInputRef}
        type='file'
        accept={SUPPORTED_IMAGE_ACCEPT}
        className='hidden'
        onChange={handleFileSelect}
        data-pw={dataPw}
        multiple={multiple}
      />
    </>
  )
}

function getUploadingLabel(inProcessingPhase: boolean, uploadingCount: number) {
  if (inProcessingPhase) {
    return uploadingCount > 1 ? `Processing ${uploadingCount} images...` : 'Processing...'
  }

  return uploadingCount > 1 ? `Uploading ${uploadingCount} images...` : 'Uploading...'
}
