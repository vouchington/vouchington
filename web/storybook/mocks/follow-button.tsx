import { Button } from '@/components/ui/button'

interface FollowButtonProps {
  isFollowing?: boolean
  inactiveLabel?: string
  activeLabel?: string
  'data-pw'?: string
}

export function FollowButton({
  isFollowing = false,
  inactiveLabel = 'Follow',
  activeLabel = 'Following',
  'data-pw': dataPw = 'follow-button',
}: FollowButtonProps) {
  return (
    <Button
      type='button'
      size='sm'
      data-pw={dataPw}
      aria-pressed={isFollowing}
    >
      {isFollowing ? activeLabel : inactiveLabel}
    </Button>
  )
}
