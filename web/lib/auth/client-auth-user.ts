import { isOfficialAccount } from './official-account'
import { userHref } from '@/lib/links/entity-href'
import type { ImagePlacementTuple, User } from '@/types/user'

export interface ClientAuthUser {
  id: string
  roles: string[]
  isOfficialAccount: boolean
}

export interface ProfileMenuUser {
  avatarLabel: string
  displayLabel: string
  href: string
  profileImageId: string | null
  profileImagePlacement?: ImagePlacementTuple | null
}

export interface SuspensionNotice {
  reason: string | null
}

export function toClientAuthUser(user: User): ClientAuthUser {
  return {
    id: user.id,
    roles: user.roles,
    isOfficialAccount: isOfficialAccount(user),
  }
}

export function toProfileMenuUser(user: User): ProfileMenuUser {
  const trimmedUsername = user.username?.trim() || undefined
  const emailLabel = user.email_address?.split('@')[0]
  return {
    avatarLabel: trimmedUsername || emailLabel || 'U',
    displayLabel: trimmedUsername || user.email_address || 'User',
    href: userHref({ id: user.id, username: trimmedUsername }),
    profileImageId: user.profile_image_id ?? null,
    profileImagePlacement: user.profile_image_placement ?? null,
  }
}

export function toSuspensionNotice(user: User): SuspensionNotice | null {
  return user.suspended_at ? { reason: user.suspended_reason ?? null } : null
}
