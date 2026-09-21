'use client'

import { ImageUploadButton } from '@/components/shared/image-upload-button'
import { PostImage } from '@/components/shared/post-image'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react'
import { useTranslations } from '@/lib/i18n/use-translations'

export interface ImageEntry {
  key: string
  image_id: string
  placement_id?: string
  placement_revision?: number
  order_index: number
  caption: string
}

export function ImagesFieldset({
  images,
  onImageUploaded,
  setIsUploading,
  moveImage,
  updateCaption,
  removeImage,
}: {
  images: ImageEntry[]
  onImageUploaded: (imageId: string) => void
  setIsUploading: (value: boolean) => void
  moveImage: (index: number, direction: -1 | 1) => void
  updateCaption: (index: number, caption: string) => void
  removeImage: (index: number) => void
}) {
  const t = useTranslations()
  return (
    <fieldset className='space-y-2'>
      <legend className='text-sm font-medium leading-none'>
        {t('extracted.posts.postFormImagesFieldset.images_be7e2f20')}
      </legend>
      <ImageUploadButton
        onUploaded={onImageUploaded}
        onUploadStart={() => setIsUploading(true)}
        onUploadEnd={() => setIsUploading(false)}
        disabled={images.length >= 20}
        label={t('extracted.posts.postFormImagesFieldset.addImage_d0e5e03b')}
        multiple
        maxFiles={20 - images.length}
        data-pw='post-image-upload'
      />
      {images.map((img, index) => (
        <div
          key={img.key}
          className='flex items-center gap-2 rounded-md border p-2'
        >
          <div className='flex flex-col gap-0.5'>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => moveImage(index, -1)}
              disabled={index === 0}
              aria-label={t('extracted.posts.postFormImagesFieldset.moveUp_c66feb5e')}
              className='min-h-11 min-w-11 p-0'
            >
              <ChevronUp className='h-3 w-3' />
            </Button>
            <Button
              type='button'
              variant='ghost'
              size='sm'
              onClick={() => moveImage(index, 1)}
              disabled={index === images.length - 1}
              aria-label={t('extracted.posts.postFormImagesFieldset.moveDown_40bb50da')}
              className='min-h-11 min-w-11 p-0'
            >
              <ChevronDown className='h-3 w-3' />
            </Button>
          </div>
          <div className='flex min-w-0 flex-1 items-center gap-2'>
            <div className='flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted'>
              <PostImage
                imageId={img.image_id}
                width={100}
                placement={
                  img.placement_id != null && img.placement_revision != null
                    ? { id: img.placement_id, revision: img.placement_revision }
                    : undefined
                }
                alt={
                  img.caption || t('extracted.posts.postFormImagesFieldset.uploadedImage_01b76eb9')
                }
                className='h-full w-full object-cover'
              />
            </div>
            <div className='flex-1'>
              <Input
                aria-label={t(
                  'extracted.posts.postFormImagesFieldset.captionForImageIndex_007adbff',
                  {
                    index: index + 1,
                  },
                )}
                autoComplete='off'
                value={img.caption}
                onChange={e => updateCaption(index, e.target.value)}
                onBlur={e => updateCaption(index, e.target.value.trim())}
                placeholder={t('extracted.posts.postFormImagesFieldset.captionOptional_a5665337')}
                maxLength={1000}
                data-pw='post-form-image-caption-input'
              />
              {img.caption.length >= 900 && (
                <p className='mt-1 text-right text-xs text-muted-foreground'>
                  {img.caption.length}/1000
                </p>
              )}
            </div>
          </div>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            onClick={() => removeImage(index)}
            aria-label={t('extracted.posts.postFormImagesFieldset.removeImage_da7acac1')}
          >
            <Trash2 className='h-4 w-4' />
          </Button>
        </div>
      ))}
    </fieldset>
  )
}
