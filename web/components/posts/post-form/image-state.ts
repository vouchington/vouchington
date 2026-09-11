import { useState } from 'react'
import type { Post } from '@/types/posts'
import type { ImageEntry } from '../post-form-images-fieldset'

export function usePostImageState(post?: Post) {
  const [images, setImages] = useState<ImageEntry[]>(
    () => post?.images?.map(img => ({ ...img, key: crypto.randomUUID() })) ?? [],
  )
  const [isUploading, setIsUploading] = useState(false)

  const handleImageUploaded = (imageId: string) => {
    setImages(prev => [
      ...prev,
      { key: crypto.randomUUID(), image_id: imageId, order_index: prev.length, caption: '' },
    ])
  }

  const removeImage = (index: number) => {
    setImages(prev =>
      prev.reduce<typeof prev>((acc, img, i) => {
        if (i !== index) acc.push({ ...img, order_index: acc.length })
        return acc
      }, []),
    )
  }

  const moveImage = (index: number, direction: -1 | 1) => {
    setImages(prev => {
      const next = [...prev]
      const target = index + direction
      if (target < 0 || target >= next.length) return prev
      const a = next[target]!
      const b = next[index]!
      next[index] = a
      next[target] = b
      return next.map((img, i) => ({ ...img, order_index: i }))
    })
  }

  const updateCaption = (index: number, caption: string) => {
    setImages(prev => prev.map((img, i) => (i === index ? { ...img, caption } : img)))
  }

  return {
    handleImageUploaded,
    images,
    isUploading,
    moveImage,
    removeImage,
    setIsUploading,
    updateCaption,
  }
}
