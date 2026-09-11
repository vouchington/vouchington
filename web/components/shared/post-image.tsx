import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { getImageUrl } from '@/lib/utils/image-url'

interface PostImageProps {
  imageId: string
  width: number
  height?: number
  alt?: string
  className?: string
  priority?: boolean
}

export function PostImage({
  imageId,
  width,
  height,
  alt = '',
  className,
  priority,
}: PostImageProps) {
  const intrinsicHeight = height ?? width

  return (
    <Image
      data-pw='post-image'
      src={getImageUrl(imageId, { width })}
      alt={alt}
      unoptimized
      className={className}
      width={width}
      height={intrinsicHeight}
      priority={priority}
    />
  )
}
