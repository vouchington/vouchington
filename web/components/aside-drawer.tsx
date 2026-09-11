'use client'

import { useLayoutEffect, type ReactNode } from 'react'
import { PanelRightOpen } from 'lucide-react'
import {
  useDesktopAsideOpen,
  useMobileSheetOpen,
  useSetMobileSheetOpen,
  useToggleAside,
} from '@/lib/aside-context'
import { cn } from '@/lib/utils'
import { TooltipButton } from '@/components/ui/_button-tooltip'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { ScrollArea } from '@/components/ui/scroll-area'
import { PageAside } from '@/components/page-aside'
import { ContentContainer } from '@/components/layout/content-container'
import { useIsMac } from '@/hooks/use-is-mac'
import { useTranslations } from '@/lib/i18n/use-translations'

/**
 * Toggle button that opens the aside as a right-side drawer on mobile.
 * Positioned with zero height so it doesn't push page content down.
 * Visible at all viewports; on desktop, Cmd/Ctrl+\ toggles the AsideColumn instead.
 */
export function AsideDrawer({
  children,
  showFooter,
}: {
  children?: ReactNode
  showFooter?: boolean
}) {
  const t = useTranslations()
  const desktopAsideOpen = useDesktopAsideOpen()
  const mobileSheetOpen = useMobileSheetOpen()
  const setMobileSheetOpen = useSetMobileSheetOpen()
  const toggleAside = useToggleAside()
  const isMac = useIsMac()

  // Reset mobileSheetOpen on both mount and unmount so Cmd+\ on a no-aside route
  // cannot leave stale state that pops the Sheet when the user later navigates to
  // an aside route.
  useLayoutEffect(() => {
    setMobileSheetOpen(false)
    return () => setMobileSheetOpen(false)
  }, [setMobileSheetOpen])

  // Only render when there is aside content or footer content to show
  if (!children && !showFooter) return null

  const shortcutHint = isMac ? '⌘\\' : 'Ctrl+\\'

  return (
    <>
      {/* Zero-height sticky bar — button floats without pushing content down.
          When the aside column is open on desktop, offset left by the aside width (334px)
          so the button sits at the right edge of the content column, not inside the aside.
          px-4 matches the main content gutter; ContentContainer centres to 1200px. */}
      <div className='pointer-events-none sticky top-14 z-20 h-0'>
        <ContentContainer>
          <div
            className={cn(
              'flex justify-end py-1 transition-[margin-right] duration-300 ease-in-out',
              desktopAsideOpen ? 'lg:mr-[334px]' : 'lg:mr-0',
            )}
          >
            <TooltipButton
              variant='ghost'
              size='icon'
              className='pointer-events-auto min-h-11 min-w-11'
              aria-label={t('extracted.components.asideDrawer.togglePageSidebar_d151700b')}
              tooltip={t('extracted.components.asideDrawer.toggleSidebarShortcuthint_f1704b4a', {
                shortcutHint,
              })}
              onClick={toggleAside}
              data-pw='aside-toggle-button'
            >
              <PanelRightOpen className='h-4 w-4' />
            </TooltipButton>
          </div>
        </ContentContainer>
      </div>

      {/* Mobile drawer — only opens on mobile viewports via toggleAside() */}
      <Sheet
        open={mobileSheetOpen}
        onOpenChange={setMobileSheetOpen}
      >
        <SheetContent
          side='right'
          className='w-[300px] sm:max-w-[300px]'
        >
          <SheetTitle className='sr-only'>
            {t('extracted.components.asideDrawer.pageSidebar_e6a5a26e')}
          </SheetTitle>
          <ScrollArea className='h-full'>
            <div className='space-y-4 pt-8'>
              <PageAside showFooter={showFooter}>{children}</PageAside>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>
    </>
  )
}
