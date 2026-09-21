'use client'

import Link from 'next/link'
import { Gift, LayoutTemplate, LogOut, SlidersHorizontal, User, UserCog } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { UserAvatar } from '@/components/shared/user-avatar'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ProfileMenuUser } from '@/lib/auth/client-auth-user'

interface ProfileMenuProps {
  onLogout: () => void
  user: ProfileMenuUser
}

export function ProfileMenu({ onLogout, user }: ProfileMenuProps) {
  const t = useTranslations()

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <DropdownMenu>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button
                variant='ghost'
                size='icon'
                data-pw='navbar-profile-menu-button'
                className='rounded-full'
                aria-label={t('extracted.navbar.profileMenu.openProfileMenu_4a239d3d')}
              >
                <Avatar className='h-8 w-8'>
                  <AvatarFallback className='bg-muted text-xs'>
                    {user.avatarLabel.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <DropdownMenuContent
            align='end'
            className='w-48'
          >
            <DropdownMenuItem asChild>
              <Link
                href={user.href}
                data-pw='profile-menu-current-user'
                prefetch={false}
              >
                <UserAvatar
                  profileImageId={user.profileImageId}
                  profileImagePlacement={user.profileImagePlacement}
                  username={user.avatarLabel}
                  size='sm'
                />
                <span className='truncate font-medium'>{user.displayLabel}</span>
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                href='/my/profile'
                data-pw='profile-menu-profile'
                prefetch={false}
              >
                <User />
                {t('extracted.navbar.profileMenu.profile_d696a35b')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href='/my/identity'
                data-pw='profile-menu-identity'
                prefetch={false}
              >
                <UserCog />
                {t('extracted.navbar.profileMenu.identity_999f23fc')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href='/my/preferences'
                data-pw='profile-menu-preferences'
                prefetch={false}
              >
                <SlidersHorizontal />
                {t('extracted.navbar.profileMenu.preferences_66962f72')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href='/my/landing-pages'
                prefetch={false}
              >
                <LayoutTemplate />
                {t('extracted.navbar.profileMenu.landingPages_6e8d0e5d')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href='/my/referrals'
                prefetch={false}
              >
                <Gift />
                {t('extracted.navbar.profileMenu.referrals_76ffc344')}
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              data-pw='profile-menu-signout'
              onClick={onLogout}
            >
              <LogOut />
              {t('extracted.navbar.profileMenu.signOut_48f0d3d3')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <TooltipContent>{t('extracted.navbar.profileMenu.profileMenu_d8c8a6b2')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
