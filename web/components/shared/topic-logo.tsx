import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { getImageUrl } from '@/lib/utils/image-url'

interface TopicLogoProps {
  imageId: string
  name: string
  className?: string
  width?: number
}

export function TopicLogo({ imageId, name, className, width = 200 }: TopicLogoProps) {
  return (
    <Image
      data-pw='topic-logo'
      src={getImageUrl(imageId, { width })}
      alt={`${name} logo`}
      unoptimized
      className={className ?? 'h-16 w-16 flex-shrink-0 rounded-lg object-contain'}
      width={width}
      height={width}
    />
  )
}
