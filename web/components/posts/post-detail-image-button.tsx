'use client'

import { Button } from '@/components/ui/button'
import { PostImage } from '@/components/shared/post-image'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ReactNode } from 'react'

interface ImageButtonProps {
  alt: string
  ariaLabel?: string
  imageId: string
  placement: { id: string; revision: number }
  onClick: () => void
  priority: boolean
  children?: ReactNode
}

export function ImageButton({
  alt,
  ariaLabel,
  imageId,
  placement,
  onClick,
  priority,
  children,
}: ImageButtonProps) {
  const t = useTranslations()
  return (
    <Button
      variant='ghost'
      className='h-auto w-full cursor-zoom-in p-0 hover:bg-transparent'
      onClick={onClick}
      aria-label={
        ariaLabel ?? t('extracted.posts.postDetailImageButton.viewFullSizeImage_bc5ba906')
      }
      data-pw='post-detail-image-button'
    >
      {children !== undefined ? (
        children
      ) : (
        <PostImage
          imageId={imageId}
          placement={placement}
          width={1200}
          height={1200}
          alt={alt}
          className='max-h-[60vh] w-auto rounded-md object-contain'
          priority={priority}
        />
      )}
    </Button>
  )
}
