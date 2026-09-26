import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { getPlacementImageUrl } from '@/lib/utils/image-url'
import type { ImagePlacementTuple } from '@/types/user'

interface TopicLogoProps {
  placement?: ImagePlacementTuple | null
  name: string
  className?: string
  width?: number
}

export function TopicLogo({ placement, name, className, width = 200 }: TopicLogoProps) {
  if (!placement) return null
  return (
    <Image
      data-pw='topic-logo'
      src={getPlacementImageUrl(
        placement.placement_id,
        placement.placement_revision,
        placement.image_id,
        { width },
      )}
      alt={`${name} logo`}
      unoptimized
      className={className ?? 'h-16 w-16 flex-shrink-0 rounded-lg object-contain'}
      width={width}
      height={width}
    />
  )
}
