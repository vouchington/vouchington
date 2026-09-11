'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Check, Copy, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { landingPageHref } from '@/lib/links/entity-href'
import { appendUtm, SHARE_UTM } from '@/lib/url/utm'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ShareLandingPageBannerProps {
  username: string
}

export function ShareLandingPageBanner({ username }: ShareLandingPageBannerProps) {
  const t = useTranslations()
  const [copied, setCopied] = useState(false)
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const landingPath = landingPageHref(username)

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
    }
  }, [])

  async function handleCopy() {
    try {
      const fullUrl = `${window.location.origin}${landingPath}`
      await navigator.clipboard.writeText(appendUtm(fullUrl, SHARE_UTM))
      setCopied(true)
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current)
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('extracted.users.shareLandingPageBanner.failedToCopyToClipboard_978a1dc5'))
    }
  }

  return (
    <section
      aria-label={t('extracted.users.shareLandingPageBanner.shareYourLandingPage_3b32bb1d')}
      className='flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/50 p-4'
    >
      <div className='flex items-center gap-2 text-sm'>
        <span className='font-medium'>
          {t('extracted.users.shareLandingPageBanner.shareYourPage_79c6d0f5')}
        </span>
        <Link
          href={landingPath}
          prefetch={false}
          className='text-muted-foreground underline transition-colors hover:text-foreground'
        >
          {landingPath}
        </Link>
      </div>
      <div className='flex items-center gap-2'>
        <Button
          type='button'
          variant='outline'
          size='sm'
          onClick={handleCopy}
        >
          {copied ? <Check className='mr-1 h-4 w-4' /> : <Copy className='mr-1 h-4 w-4' />}
          {copied
            ? t('extracted.users.shareLandingPageBanner.copied_8d525e5f')
            : t('extracted.users.shareLandingPageBanner.copy_e21f935f')}
        </Button>
        <Button
          asChild
          variant='outline'
          size='sm'
        >
          <Link
            href='/my/landing-pages'
            prefetch={false}
          >
            <Pencil className='mr-1 h-4 w-4' />
            {t('extracted.users.shareLandingPageBanner.edit_464c4ffd')}
          </Link>
        </Button>
      </div>
    </section>
  )
}
