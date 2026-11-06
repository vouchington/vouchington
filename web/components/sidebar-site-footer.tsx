/* oxlint-disable no-mistakes/playwright-literals -- Footer IDs come from static link data; ast-grep still bans inline calls in data-pw. */
'use client'

import { useState } from 'react'
import Link from 'next/link'
import { footerContentLinks, footerSiteLinks } from './footer-links'
import { useTranslations } from '@/lib/i18n/use-translations'

function FooterLinks({
  links,
}: {
  links: readonly { label: string; href?: string | null; dataPw?: string }[]
}) {
  return (
    <>
      {links.map(link =>
        link.href ? (
          <Link
            key={link.label}
            href={link.href}
            prefetch={false}
            className='inline-flex min-h-6 items-center px-1 hover:text-foreground max-md:min-h-11'
            data-pw={link.dataPw}
          >
            {link.label}
          </Link>
        ) : (
          <span
            key={link.label}
            className='inline-flex min-h-6 cursor-default items-center px-1 max-md:min-h-11'
            aria-disabled='true'
          >
            {link.label}
          </span>
        ),
      )}
    </>
  )
}

function readCopyrightYear(): number {
  return new Date().getFullYear()
}

export function SidebarSiteFooter() {
  const t = useTranslations()
  // Captured once per mount; the year has no later update, so the setter stays unused.
  // oxlint-disable-next-line react/hook-use-state -- omitting the unused setter
  const [year] = useState(readCopyrightYear)
  return (
    <footer
      data-pw='sidebar-site-footer'
      className='space-y-1 px-2 py-1 text-xs text-muted-foreground'
    >
      <div className='flex flex-wrap gap-x-3 gap-y-1'>
        <FooterLinks links={footerSiteLinks} />
      </div>
      <div className='flex flex-wrap gap-x-3 gap-y-1'>
        <FooterLinks links={footerContentLinks} />
      </div>
      <div suppressHydrationWarning>
        {t('extracted.components.sidebarSiteFooter.yearVouchaAllRightsReserved_6dbfae4a', {
          year,
        })}
      </div>
    </footer>
  )
}
