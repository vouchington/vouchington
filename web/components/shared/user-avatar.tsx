import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { getPlacementImageUrl } from '@/lib/utils/image-url'
import { cn } from '@/lib/utils'
import type { ImagePlacementTuple } from '@/types/user'

type AvatarSize = 'sm' | 'md' | 'lg'

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'h-6 w-6',
  md: 'h-10 w-10',
  lg: 'h-16 w-16',
}

const SIZE_PIXELS: Record<AvatarSize, number> = {
  sm: 48,
  md: 80,
  lg: 128,
}

interface UserAvatarProps {
  profileImagePlacement?: ImagePlacementTuple | null
  username: string
  size?: AvatarSize
  className?: string
}

export function UserAvatar({
  profileImagePlacement,
  username,
  size = 'md',
  className,
}: UserAvatarProps) {
  const initials = username.slice(0, 2).toUpperCase()

  return (
    <Avatar
      data-pw='user-avatar'
      className={cn(SIZE_CLASSES[size], className)}
    >
      {profileImagePlacement && (
        <AvatarImage
          src={getPlacementImageUrl(
            profileImagePlacement.placement_id,
            profileImagePlacement.placement_revision,
            profileImagePlacement.image_id,
            { width: SIZE_PIXELS[size] },
          )}
          alt={username}
        />
      )}
      <AvatarFallback className='bg-muted text-xs'>{initials}</AvatarFallback>
    </Avatar>
  )
}
