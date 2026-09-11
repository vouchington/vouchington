import type { ReactNode, ComponentPropsWithoutRef } from 'react'
import Link from 'next/link'
import { userHref, type UserTab } from '@/lib/links/entity-href'

interface UserLinkUser {
  id: string
  username?: string | null
}

type UserLinkProps = Omit<ComponentPropsWithoutRef<typeof Link>, 'href' | 'children'> & {
  user: UserLinkUser
  tab?: UserTab
  children?: ReactNode
}

export function UserLink({
  user,
  tab,
  className,
  prefetch = false,
  children,
  ...props
}: UserLinkProps) {
  return (
    <Link
      data-pw='user-link'
      href={userHref(user, tab)}
      prefetch={prefetch}
      className={className}
      {...props}
    >
      {children ?? (user.username ? `@${user.username}` : user.id)}
    </Link>
  )
}
