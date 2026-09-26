'use client'

import type { ReactNode } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AsideProvider } from '@/lib/aside-provider'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { FeedStyleProvider } from '@/lib/preferences/feed-style-context'
import { ListStyleProvider } from '@/lib/preferences/list-style-context'
import { ThemeProvider } from '@/lib/preferences/theme-context'
import { VoteStoreProvider } from '@/lib/votes/vote-store-provider'
import { storyCurrentUser } from './entity-fixtures'
import type { User } from '@/types/user'
import { toClientAuthUser } from '@/lib/auth/client-auth-user'
import { setStorybookMembership } from '@/storybook/mocks/upgrade-membership-state'

export function StorybookProviders({
  children,
  currentUser = storyCurrentUser,
}: {
  children: ReactNode
  currentUser?: User | null
}) {
  setStorybookMembership(currentUser)
  return (
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider initialUser={currentUser ? toClientAuthUser(currentUser) : null}>
          <VoteStoreProvider>
            <ListStyleProvider>
              <FeedStyleProvider>
                <AsideProvider>{children}</AsideProvider>
              </FeedStyleProvider>
            </ListStyleProvider>
          </VoteStoreProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}
