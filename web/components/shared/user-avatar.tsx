import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { getImageUrl } from '@/lib/utils/image-url'
import { cn } from '@/lib/utils'

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
  profileImageId: string | null | undefined
  username: string
  size?: AvatarSize
  className?: string
}

export function UserAvatar({ profileImageId, username, size = 'md', className }: UserAvatarProps) {
  const initials = username.slice(0, 2).toUpperCase()

  return (
    <Avatar
      data-pw='user-avatar'
      className={cn(SIZE_CLASSES[size], className)}
    >
      {profileImageId && (
        <AvatarImage
          src={getImageUrl(profileImageId, { width: SIZE_PIXELS[size] })}
          alt={username}
        />
      )}
      <AvatarFallback className='bg-muted text-xs'>{initials}</AvatarFallback>
    </Avatar>
  )
}
