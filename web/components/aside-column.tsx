'use client'

import { useRef, useEffect, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useDesktopAsideOpen } from '@/lib/aside-context'
import { PageAside } from '@/components/page-aside'
import { ScrollArea } from '@/components/ui/scroll-area'

export function AsideColumn({
  children,
  showFooter,
  mobileHidden = false,
}: {
  children?: ReactNode
  showFooter?: boolean
  /** When true, the aside column is hidden on mobile (AsideDrawer handles mobile access). */
  mobileHidden?: boolean
}) {
  const desktopAsideOpen = useDesktopAsideOpen()
  const asideRef = useRef<HTMLElement>(null)

  // When collapsed on desktop, mark the aside inert so keyboard users and assistive tech
  // cannot reach focusable descendants (e.g. Turnstile iframe) inside the w-0 container.
  // On mobile, desktopAsideOpen=false does not visually collapse the aside (it still flows
  // below content), so inert must not be set at narrow viewports.
  useEffect(() => {
    if (!asideRef.current) return
    const mq = window.matchMedia('(min-width: 1024px)')
    function update() {
      if (!asideRef.current) return
      if (!desktopAsideOpen && mq.matches) {
        asideRef.current.setAttribute('inert', '')
      } else {
        asideRef.current.removeAttribute('inert')
      }
    }
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [desktopAsideOpen])

  // No content and no footer → don't render the column so main content is centered
  if (!children && !showFooter) return null

  const isInfiniteScroll = showFooter

  return (
    <aside
      ref={asideRef}
      className={cn(
        // Animate width+margin collapse so stateful children (e.g. Turnstile) stay mounted.
        // overflow-clip (not overflow-hidden) clips content during animation without creating a
        // scroll container — overflow-hidden would break position:sticky on the inner div.
        // margin-left is animated so the gap between columns disappears with the aside instead of
        // leaving a phantom 16px gap when the aside is closed. Inner translates horizontally so
        // content slides off-screen at fixed width rather than visibly squishing during collapse.
        'shrink-0 overflow-clip transition-[width,min-width,margin-left] duration-300 ease-in-out',
        // Desktop: animate between full width and zero based on toggle state
        desktopAsideOpen ? 'lg:w-[334px] lg:min-w-[334px] lg:ml-4' : 'lg:w-0 lg:min-w-0 lg:ml-0',
        // Mobile: infinite-scroll pages hide the column (aside shown via Sheet drawer instead)
        // Non-infinite pages: aside flows below main content; drawer provides quick access
        isInfiniteScroll || mobileHidden ? 'hidden lg:block' : 'mt-4 w-full lg:mt-0',
      )}
    >
      <div
        className={cn(
          'transition-transform duration-300 ease-in-out lg:sticky lg:top-14 lg:w-[334px]',
          desktopAsideOpen ? 'lg:translate-x-0' : 'lg:translate-x-full',
        )}
      >
        {/* Use h-[...] (definite height) so Radix ScrollArea Viewport's h-full resolves
            and content scrolls when it exceeds the viewport. max-h alone is not definite
            per CSS spec, which causes h-full to fall back to auto with no scroll affordance. */}
        {/* Height = viewport minus navbar (3rem) minus main padding top+bottom (1rem+1rem at sm+) */}
        <ScrollArea className='lg:h-[calc(100dvh-5rem)]'>
          <div className='space-y-4'>
            <PageAside showFooter={showFooter}>{children}</PageAside>
          </div>
        </ScrollArea>
      </div>
    </aside>
  )
}
