import { ProxiedImage as Image } from '@/components/shared/proxied-image'
import { getImageUrl, getPlacementImageUrl } from '@/lib/utils/image-url'
import type { ImagePlacementTuple } from '@/types/user'

interface TopicLogoProps {
  placement?: ImagePlacementTuple | null
  /** Only upload editors may provide this transient pre-placement preview. */
  uploadPreviewImageId?: string
  /** @deprecated Alias retained only for existing upload-preview callers. */
  imageId?: string
  name: string
  className?: string
  width?: number
}

export function TopicLogo({
  placement,
  uploadPreviewImageId,
  imageId,
  name,
  className,
  width = 200,
}: TopicLogoProps) {
  const previewImageId = uploadPreviewImageId ?? imageId
  if (!placement && !previewImageId) return null
  return (
    <Image
      data-pw='topic-logo'
      src={
        placement
          ? getPlacementImageUrl(
              placement.placement_id,
              placement.placement_revision,
              placement.image_id,
              { width },
            )
          : getImageUrl(previewImageId!, { width })
      }
      alt={`${name} logo`}
      unoptimized
      className={className ?? 'h-16 w-16 flex-shrink-0 rounded-lg object-contain'}
      width={width}
      height={width}
    />
  )
}
