'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Mail } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { CommandSearch } from '@/components/command-search'
import { SidebarTrigger } from '@/components/ui/sidebar'

import { cn } from '@/lib/utils'
import { logout } from '@/lib/auth/logout'
import { useAuth } from '@/lib/auth/context'
import { getApiErrorMessage } from '@/lib/api/error-helpers'
import { InboxButton } from '@/components/notifications/inbox-button'
import { VouchaLogo } from '@/components/brand/voucha-logo'
import { ContentContainer } from '@/components/layout/content-container'
import { ProfileMenu } from './navbar/profile-menu'
import { NavbarSearchButton, NavbarWriteButton } from './navbar/topbar-actions'
import { WriteDialog } from './navbar/write-dialog'
import { IntentSwitcher } from './navbar/intent-switcher'
import { useNavbarKeyboardShortcuts } from './navbar/use-keyboard-shortcuts'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ProfileMenuUser } from '@/lib/auth/client-auth-user'

// ast-grep-ignore: no-dynamic-server-components -- target component has 'use client'
const KeyboardShortcutsDialog = dynamic(() =>
  import('@/components/keyboard-shortcuts-dialog').then(m => m.KeyboardShortcutsDialog),
)

export function Navbar({ profileMenuUser }: { profileMenuUser: ProfileMenuUser | null }) {
  // SidebarTrigger visibility is CSS-driven via the sidebar wrapper's data-state attribute so
  // there is no SSR/hydration flip. At >=md viewports with data-state="expanded", the trigger slot
  // animates to zero width so the Voucha logo slides into place instead of jumping.
  // has-[:focus-visible] restores the slot width when keyboard users tab to the trigger. At <md
  // viewports the trigger remains visible for the Sheet pattern.
  const t = useTranslations()
  const [searchOpen, setSearchOpen] = useState(false)
  const [writeOpen, setWriteOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const { currentUser } = useAuth()
  const isAuthenticated = currentUser !== null
  const { push } = useRouter()
  const pathname = usePathname()

  async function handleLogout() {
    try {
      await logout()
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, t('extracted.components.navbar.failedToLogOut_c746b6a2')),
      )
    }
  }

  useNavbarKeyboardShortcuts({
    isAuthenticated,
    onOpenSearch: () => setSearchOpen(true),
    onOpenShortcuts: () => setShortcutsOpen(true),
    push,
  })

  return (
    <>
      <nav
        aria-label={t('extracted.components.navbar.main_eb814be3')}
        data-pw='navbar'
        className='sticky top-0 z-30 flex h-12 shrink-0 items-center border-b bg-background px-4'
      >
        <ContentContainer className='flex min-w-0 items-center gap-0'>
          <span
            className={cn(
              'mr-2 flex w-11 shrink-0 overflow-hidden transition-[width,margin-right] duration-300 ease-in-out',
              'md:group-data-[state=expanded]/sidebar-wrapper:mr-0 md:group-data-[state=expanded]/sidebar-wrapper:w-0',
              'md:group-data-[state=expanded]/sidebar-wrapper:has-[:focus-visible]:mr-2 md:group-data-[state=expanded]/sidebar-wrapper:has-[:focus-visible]:w-11',
            )}
          >
            <SidebarTrigger className='min-h-11 min-w-11 shrink-0' />
          </span>
          <Link
            prefetch={false}
            href='/'
            data-pw='navbar-logo'
            className='inline-flex min-h-11 shrink-0 items-center'
            aria-label={t('extracted.components.navbar.vouchaHome_ba04a93b')}
          >
            <VouchaLogo className='h-6' />
          </Link>
          <IntentSwitcher variant='navbar' />
          <div className='flex min-w-0 flex-1 items-center justify-end gap-2'>
            <NavbarSearchButton onOpenSearch={() => setSearchOpen(true)} />

            {isAuthenticated && currentUser && profileMenuUser ? (
              <>
                <Button
                  variant='ghost'
                  size='touchSm'
                  asChild
                  className='hidden md:inline-flex'
                >
                  <Link
                    href='/messages'
                    data-pw='navbar-messages-link'
                    prefetch={false}
                    aria-label={t('extracted.components.navbar.messages_04d7b483')}
                  >
                    <Mail className='size-4' />
                  </Link>
                </Button>
                <InboxButton />
                <NavbarWriteButton onOpenWrite={() => setWriteOpen(true)} />

                <ProfileMenu
                  user={profileMenuUser}
                  onLogout={handleLogout}
                />
              </>
            ) : pathname !== '/login' ? (
              <Button
                variant='ghost'
                size='touchSm'
                asChild
              >
                <Link
                  href='/login'
                  data-pw='navbar-signin-link'
                  prefetch={false}
                >
                  {t('extracted.components.navbar.signIn_bcc0bcc9')}
                </Link>
              </Button>
            ) : null}
          </div>
        </ContentContainer>
      </nav>

      {/* Command search dialog */}
      <CommandSearch
        open={searchOpen}
        onOpenChange={setSearchOpen}
        isAdmin={currentUser?.roles.includes('administrator') ?? false}
        isAuthenticated={isAuthenticated}
      />

      {/* Keyboard shortcuts dialog — rendered unconditionally so the chunk is prefetched */}
      <KeyboardShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
      />

      <WriteDialog
        open={writeOpen}
        onOpenChange={setWriteOpen}
      />
    </>
  )
}
