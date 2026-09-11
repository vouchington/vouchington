import type { ProfileLink, ProfileLinkType } from '@/types/user'

export function getProfileLinkHref(link: {
  link_type: ProfileLinkType
  url?: string | null
  handle?: string | null
}): string | null {
  if (link.link_type === 'url') return link.url ?? null
  if (!link.handle) return null

  switch (link.link_type) {
    case 'twitter': {
      return `https://x.com/${link.handle}`
    }
    case 'facebook': {
      return `https://facebook.com/${link.handle}`
    }
    case 'instagram': {
      return `https://instagram.com/${link.handle}`
    }
    case 'github': {
      return `https://github.com/${link.handle}`
    }
    case 'linkedin': {
      return `https://linkedin.com/in/${link.handle}`
    }
    case 'youtube': {
      return `https://youtube.com/@${link.handle}`
    }
    case 'tiktok': {
      return `https://tiktok.com/@${link.handle}`
    }
    default: {
      return null
    }
  }
}

export function getProfileLinkLabel(link: {
  name?: string | null
  handle?: string | null
  url?: string | null
}): string {
  return link.name || link.handle || link.url || 'Profile link'
}

export function resolveProfileLinkUrls(links: ProfileLink[]): string[] {
  return links.flatMap(link => {
    const href = getProfileLinkHref(link)
    return href ? [href] : []
  })
}
