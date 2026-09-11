import { StrictMode, type ReactNode } from 'react'
import { AppSidebar } from '@/components/app-sidebar'
import { SidebarSiteFooter } from '@/components/sidebar-site-footer'
import { Navbar } from '@/components/navbar'
import { SuspensionBanner } from '@/components/moderation/notices/suspension-banner'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AuthProvider } from '@/lib/auth/auth-provider'
import { AsideProvider } from '@/lib/aside-provider'
import { SignedInChatSidebarProvider } from '@/lib/chat-sidebar-context'
import { SignedInMessagesSidebarProvider } from '@/lib/messages-sidebar-provider'
import { NavIntentProvider } from '@/lib/navigation/intents/nav-intent-provider'
import { PodcastPlayerProvider } from '@/lib/podcast-player/context'
import { PodcastPlayerSpacer } from '@/lib/podcast-player/spacer'
import { FeedStyleProvider } from '@/lib/preferences/feed-style-context'
import { ListStyleProvider } from '@/lib/preferences/list-style-context'
import { ThemeProvider } from '@/lib/preferences/theme-context'
import { RuntimePublicConfigProvider } from '@/lib/runtime-public-config-provider'
import { UiLocaleProvider } from '@/lib/i18n/ui-locale-provider'
import { VoteStoreProvider } from '@/lib/votes/vote-store-provider'
import { FeatureFlagsProvider } from '@/lib/feature-flags/context'
import type { RuntimePublicConfig } from '@/lib/runtime-public-config'
import type { FeatureFlags } from '@/lib/feature-flags/shared'
import type { User } from '@/types/user'
import {
  toClientAuthUser,
  toProfileMenuUser,
  toSuspensionNotice,
} from '@/lib/auth/client-auth-user'
import { EmailVerificationRecoveryProvider } from '@/lib/email-verification-recovery'

interface RootAppShellProps {
  currentUser: User | null
  globalFeatureFlags: FeatureFlags
  isStandaloneLandingPage: boolean
  mainContent: ReactNode
  runtimePublicConfig: RuntimePublicConfig
  uiLocale: string
}

export function RootAppShell({
  currentUser,
  globalFeatureFlags,
  isStandaloneLandingPage,
  mainContent,
  runtimePublicConfig,
  uiLocale,
}: RootAppShellProps) {
  const clientAuthUser = currentUser ? toClientAuthUser(currentUser) : null
  const profileMenuUser = currentUser ? toProfileMenuUser(currentUser) : null
  const suspensionNotice = currentUser ? toSuspensionNotice(currentUser) : null
  return (
    <StrictMode>
      <RuntimePublicConfigProvider config={runtimePublicConfig}>
        <ThemeProvider>
          <TooltipProvider delayDuration={0}>
            <ListStyleProvider>
              <FeedStyleProvider>
                <UiLocaleProvider uiLocale={uiLocale}>
                  <FeatureFlagsProvider globalFlags={globalFeatureFlags}>
                    <AuthProvider initialUser={clientAuthUser}>
                      <EmailVerificationRecoveryProvider>
                        <VoteStoreProvider>
                          {isStandaloneLandingPage ? (
                            <div className='min-h-svh bg-background'>{mainContent}</div>
                          ) : (
                            <NavIntentProvider>
                              <AsideProvider>
                                <SignedInChatSidebarProvider>
                                  <SignedInMessagesSidebarProvider>
                                    <SidebarProvider defaultOpen>
                                      <div className='flex min-h-svh w-full'>
                                        <AppSidebar siteFooter={<SidebarSiteFooter />} />
                                        <SidebarInset className='min-w-0 flex-1 flex-col'>
                                          <PodcastPlayerProvider>
                                            <Navbar profileMenuUser={profileMenuUser} />
                                            <SuspensionBanner notice={suspensionNotice} />
                                            {mainContent}
                                            <PodcastPlayerSpacer />
                                          </PodcastPlayerProvider>
                                        </SidebarInset>
                                      </div>
                                    </SidebarProvider>
                                  </SignedInMessagesSidebarProvider>
                                </SignedInChatSidebarProvider>
                              </AsideProvider>
                            </NavIntentProvider>
                          )}
                        </VoteStoreProvider>
                      </EmailVerificationRecoveryProvider>
                    </AuthProvider>
                  </FeatureFlagsProvider>
                </UiLocaleProvider>
              </FeedStyleProvider>
            </ListStyleProvider>
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </RuntimePublicConfigProvider>
    </StrictMode>
  )
}
