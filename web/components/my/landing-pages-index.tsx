'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createMyLandingPage } from '@/lib/api/client'
import { landingPageHref, landingPageNamedHref, myLandingPageHref } from '@/lib/links/entity-href'
import onError, { onSuccess } from '@/lib/on-error'
import { LandingPagesUsernameRequired } from '@/components/my/landing-pages-manager-sections'
import { CreatePageForm } from '@/components/my/landing-pages-manager/page-forms'
import type { LandingPage } from '@/types/landing-pages'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  username: string | null
  initialPages: LandingPage[]
}

export function LandingPagesIndex({ username, initialPages }: Props) {
  const t = useTranslations()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newSlug, setNewSlug] = useState('')
  const [newSubtitle, setNewSubtitle] = useState('')

  if (!username) return <LandingPagesUsernameRequired />

  async function handleCreatePage(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    try {
      const { landing_page } = await createMyLandingPage({
        title: newTitle,
        subtitle: newSubtitle || null,
        slug: newSlug,
      })
      onSuccess(t('extracted.my.landingPagesIndex.landingPageCreated_528c1170'))
      router.push(myLandingPageHref(landing_page))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.my.landingPagesIndex.failedToCreateLandingPage_d83f2483'),
      })
      setLoading(false)
    }
  }

  return (
    <div className='space-y-8'>
      <div>
        <h1
          className='text-2xl font-bold text-foreground'
          data-pw='landing-pages-settings-heading'
        >
          {t('extracted.my.landingPagesIndex.landingPages_6e8d0e5d')}
        </h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          {t('extracted.my.landingPagesIndex.createPublicLandingPagesForUsername_b00cca00', {
            username,
          })}
        </p>
      </div>

      <CreatePageForm
        loading={loading}
        newTitle={newTitle}
        newSlug={newSlug}
        newSubtitle={newSubtitle}
        onSubmit={handleCreatePage}
        setNewTitle={setNewTitle}
        setNewSlug={setNewSlug}
        setNewSubtitle={setNewSubtitle}
      />

      {initialPages.length > 0 ? (
        <div className='space-y-2'>
          <h2 className='text-lg font-semibold'>
            {t('extracted.my.landingPagesIndex.yourPages_a14fbf2a')}
          </h2>
          <div className='space-y-2'>
            {initialPages.map(page => (
              <div
                key={page.id}
                className='flex items-center justify-between gap-3 rounded-lg border p-4'
              >
                <div className='min-w-0'>
                  <Link
                    href={myLandingPageHref(page)}
                    prefetch={false}
                    data-pw='landing-pages-settings-page-title'
                    className='font-medium hover:underline'
                  >
                    {page.title}
                  </Link>
                  <p className='text-sm text-muted-foreground'>
                    {page.is_default
                      ? landingPageHref(username)
                      : landingPageNamedHref(username, page.slug)}
                    {page.is_default ? (
                      <span className='ml-2 text-xs font-medium uppercase tracking-wide'>
                        {t('extracted.my.landingPagesIndex.default_21b111cb')}
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className='flex shrink-0 items-center gap-2'>
                  <Button
                    asChild
                    variant='outline'
                    size='sm'
                    // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                    data-pw={`landing-pages-settings-page-button-${page.slug}`}
                  >
                    <Link
                      href={myLandingPageHref(page)}
                      prefetch={false}
                    >
                      {t('extracted.my.landingPagesIndex.edit_464c4ffd')}
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant='ghost'
                    size='sm'
                    aria-label={t('extracted.my.landingPagesIndex.viewLivePageForTitle_3c3a8ca9', {
                      title: page.title,
                    })}
                  >
                    <a
                      href={
                        page.is_default
                          ? landingPageHref(username)
                          : landingPageNamedHref(username, page.slug)
                      }
                      target='_blank'
                      rel='noopener noreferrer'
                      data-pw='landing-pages-view-live-link'
                    >
                      <ExternalLink className='size-4' />
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p
          className='text-sm text-muted-foreground'
          data-pw='landing-pages-empty-state'
        >
          {t('extracted.my.landingPagesIndex.noLandingPagesYetCreateOne_6469b957')}
        </p>
      )}
    </div>
  )
}
