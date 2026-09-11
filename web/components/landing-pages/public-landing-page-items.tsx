import Link from 'next/link'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { PostContentText } from '@/components/posts/post-content-text'
import { getEffectiveContentLanguage } from '@ts-shared/languages/content-languages'
import { getProfileLinkHref, getProfileLinkLabel } from '@/lib/users/profile-link-href'
import type { PublicLandingPage } from '@/types/landing-pages'
import { appendUtm, isExternalHref, OUTBOUND_UTM } from '@/lib/url/utm'
import { getReviewHref } from './public-landing-page-routes'
import { PublicLandingPageTopicGroup } from './public-landing-page-topic-group'
import type { getTranslations } from '@/lib/i18n/get-translations'

type Translate = Awaited<ReturnType<typeof getTranslations>>

interface PublicLandingPageItemsProps {
  items: PublicLandingPage['landing_page']['items']
}

export function PublicLandingPageItems({
  items,
  t,
}: PublicLandingPageItemsProps & { t: Translate }) {
  return (
    <div className='space-y-4'>
      {items.map(item => {
        if (item.type === 'profile_link')
          return (
            <ProfileLinkItem
              key={item.id}
              item={item}
            />
          )
        if (item.type === 'review')
          return (
            <ReviewItem
              key={item.id}
              item={item}
              t={t}
            />
          )
        if (item.type === 'referral_link')
          return (
            <ReferralLinkItem
              key={item.id}
              item={item}
              t={t}
            />
          )
        if (item.type === 'link')
          return (
            <LinkItem
              key={item.id}
              item={item}
            />
          )
        return (
          <PublicLandingPageTopicGroup
            key={item.id}
            item={item}
            t={t}
          />
        )
      })}
    </div>
  )
}

function ProfileLinkItem({ item }: { item: PublicLandingPageItemsProps['items'][number] }) {
  if (item.type !== 'profile_link') return null
  const href = getProfileLinkHref(item.profile_link)
  if (!href) return null

  return (
    <a
      href={isExternalHref(href) ? appendUtm(href, OUTBOUND_UTM) : href}
      target='_blank'
      rel='nofollow noopener noreferrer'
      data-item-id={item.id}
      data-pw='landing-page-profile-link'
      className='flex min-h-11 items-center justify-center rounded-2xl border border-border bg-background px-5 py-4 text-center text-base font-medium shadow-sm transition-colors hover:bg-accent'
    >
      {getProfileLinkLabel(item.profile_link)}
    </a>
  )
}

function ReviewItem({
  item,
  t,
}: {
  item: PublicLandingPageItemsProps['items'][number]
  t: Translate
}) {
  if (item.type !== 'review') return null
  const primaryTopic = item.review.review_topic_ratings[0]
  return (
    <Link
      href={getReviewHref(item.review.slug, item.review.id)}
      prefetch={false}
      data-item-id={item.id}
      className='block rounded-2xl border border-border bg-background p-4 shadow-sm transition-colors hover:bg-accent'
    >
      <div className='space-y-2'>
        {primaryTopic ? (
          <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
            {primaryTopic.topic_name} • {primaryTopic.rating}/5
          </p>
        ) : null}
        <PostContentText
          as='h2'
          content={{
            text: item.review.title,
            declared_language: item.review.declared_language,
            lingua_rs_detected_language: item.review.lingua_rs_detected_language,
          }}
          fallback={t('extracted.landingPages.publicLandingPageItems.review_aff0766a')}
          className='text-lg font-semibold'
        />
        <MarkdownContent
          markdown={item.review.markdown}
          lang={getEffectiveContentLanguage({
            declaredLanguage: item.review.declared_language,
            detectedLanguage: item.review.lingua_rs_detected_language,
          })}
          className='line-clamp-3 text-sm text-muted-foreground'
        />
      </div>
    </Link>
  )
}

function ReferralLinkItem({
  item,
  t,
}: {
  item: PublicLandingPageItemsProps['items'][number]
  t: Translate
}) {
  if (item.type !== 'referral_link') return null
  return (
    <a
      href={item.referral_link.url}
      target='_blank'
      rel='nofollow noopener noreferrer'
      aria-label={
        item.referral_link.label
          ? `${item.referral_link.referral_program_name}: ${item.referral_link.label}`
          : item.referral_link.referral_program_name ||
            t('extracted.landingPages.publicLandingPageItems.openReferralLink_5c87be41')
      }
      data-item-id={item.id}
      data-pw='landing-page-referral-link'
      className='block rounded-2xl border border-border bg-background p-4 shadow-sm transition-colors hover:bg-accent'
    >
      <div className='space-y-2 text-center'>
        <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
          {item.referral_link.referral_program_name}
        </p>
        <h2 className='text-lg font-semibold'>
          {item.referral_link.label ||
            t('extracted.landingPages.publicLandingPageItems.referralLink_441c6d0e')}
        </h2>
      </div>
    </a>
  )
}

function LinkItem({ item }: { item: PublicLandingPageItemsProps['items'][number] }) {
  if (item.type !== 'link') return null
  const href = isExternalHref(item.url) ? appendUtm(item.url, OUTBOUND_UTM) : item.url
  return (
    <a
      href={href}
      target='_blank'
      rel='nofollow noopener noreferrer'
      data-item-id={item.id}
      data-pw='landing-page-link'
      className='flex min-h-11 items-center justify-center rounded-2xl border border-border bg-background px-5 py-4 text-center text-base font-medium shadow-sm transition-colors hover:bg-accent'
    >
      {item.label}
    </a>
  )
}
