'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from '@/lib/i18n/use-translations'

/** Selected bytes are private to this editor, never an unbound public image route. */
export function UploadImagePreview({
  file,
  alt,
  className,
}: {
  file: File
  alt: string
  className?: string
}) {
  const t = useTranslations()
  const [failedFile, setFailedFile] = useState<File | null>(null)
  const attachPreview = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image) return
      const url = URL.createObjectURL(file)
      image.src = url
      return () => URL.revokeObjectURL(url)
    },
    [file],
  )
  if (failedFile === file) {
    return (
      <output className='text-xs text-muted-foreground'>
        {t('shared.images.uploadPreviewUnavailable')}
      </output>
    )
  }
  const Img = 'img' as const
  return (
    <Img
      data-pw='upload-image-preview'
      ref={attachPreview}
      alt={alt}
      className={className}
      onError={() => setFailedFile(file)}
    />
  )
}
