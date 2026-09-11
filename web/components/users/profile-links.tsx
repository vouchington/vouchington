import type { ComponentType } from 'react'
import { AtSign, Briefcase, Code, Globe, Link as LinkIcon, Music, Music2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ProfileLink, ProfileLinkType } from '@/types/user'
import { getProfileLinkHref, getProfileLinkLabel } from '@/lib/users/profile-link-href'
import type { useTranslations } from '@/lib/i18n/use-translations'

const BADGE_LINK_TYPE_ICON: Record<ProfileLinkType, ComponentType<{ className?: string }>> = {
  twitter: AtSign,
  facebook: Globe,
  instagram: Globe,
  github: Globe,
  linkedin: Globe,
  youtube: Globe,
  tiktok: Music2,
  url: LinkIcon,
}

const INLINE_LINK_TYPE_ICON: Record<ProfileLinkType, ComponentType<{ className?: string }>> = {
  url: Globe,
  twitter: AtSign,
  facebook: Globe,
  instagram: Globe,
  github: Code,
  linkedin: Briefcase,
  youtube: Globe,
  tiktok: Music,
}

interface ProfileLinksProps {
  links: Array<Pick<ProfileLink, 'id' | 'link_type' | 'url' | 'handle' | 'name'>>
  variant: 'badges' | 'icons'
  t: ReturnType<typeof useTranslations>
}

export function UserProfileLinks({ links, variant, t }: ProfileLinksProps) {
  const inlineLinkTypeLabel: Record<ProfileLinkType, string> = {
    url: t('extracted.users.profileLinks.website_b5a229ac'),
    twitter: t('extracted.users.profileLinks.xTwitter_d364b13a'),
    facebook: t('extracted.users.profileLinks.facebook_d41f5b49'),
    instagram: t('extracted.users.profileLinks.instagram_bad57ef7'),
    github: t('extracted.users.profileLinks.github_f911e414'),
    linkedin: t('extracted.users.profileLinks.linkedin_dd84425b'),
    youtube: t('extracted.users.profileLinks.youtube_fb7accff'),
    tiktok: t('extracted.users.profileLinks.tiktok_1bb6fcfb'),
  }
  const resolved = links.flatMap(link => {
    const href = getProfileLinkHref(link)
    if (!href) return []
    return [{ link, href }]
  })

  if (resolved.length === 0) return null

  if (variant === 'icons') {
    return (
      <div
        data-pw='profile-link-icons'
        className='flex flex-wrap gap-0'
      >
        {resolved.map(({ link, href }) => {
          const Icon = INLINE_LINK_TYPE_ICON[link.link_type]
          const label = link.name?.trim() || inlineLinkTypeLabel[link.link_type]
          return (
            <a
              key={link.id}
              href={href}
              target='_blank'
              rel='noopener noreferrer nofollow'
              aria-label={label}
              className='flex size-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground'
              // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
              data-pw={`profile-link-${link.link_type}`}
            >
              <Icon className='h-4 w-4' />
            </a>
          )
        })}
      </div>
    )
  }

  return (
    <>
      {resolved.map(({ link, href }) => {
        const Icon = BADGE_LINK_TYPE_ICON[link.link_type]
        return (
          <Button
            key={link.id}
            data-pw='profile-link-badge'
            variant='ghost'
            size='touchIcon'
            asChild
          >
            <a
              href={href}
              target='_blank'
              rel='noopener noreferrer nofollow'
              aria-label={getProfileLinkLabel(link)}
            >
              <Icon className='h-4 w-4' />
            </a>
          </Button>
        )
      })}
    </>
  )
}
