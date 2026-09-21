import {
  MessageSquare,
  Star,
  BarChart3,
  Rss,
  Globe,
  Gift,
  Link2,
  Layers,
  Users,
  Newspaper,
  BookOpen,
  FileText,
  ListPlus,
  Headphones,
  Play,
} from 'lucide-react'
import { isActivePath } from '@/lib/utils/path'

export function getNavIcon(href: string) {
  switch (href) {
    case '/feed/news': {
      return Newspaper
    }
    case '/feed/podcasts': {
      return Headphones
    }
    case '/feed/videos': {
      return Play
    }
    case '/feed/posts': {
      return FileText
    }
    case '/stories': {
      return BookOpen
    }
    case '/news': {
      return Rss
    }
    case '/discussions': {
      return MessageSquare
    }
    case '/reviews': {
      return Star
    }
    case '/data-points': {
      return BarChart3
    }
    case '/communities': {
      return Users
    }
    case '/topics': {
      return Layers
    }
    case '/sources': {
      return Rss
    }
    case '/referral-programs': {
      return Gift
    }
    case '/feed/referral-links': {
      return Gift
    }
    case '/topic-recommendations': {
      return ListPlus
    }
    case '/domains': {
      return Globe
    }
    default: {
      return Link2
    }
  }
}

export function isNavItemActive(
  href: string,
  pathname: string,
  exact = false,
  excludePathPrefixes?: string[],
): boolean {
  if (excludePathPrefixes?.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)))
    return false
  if (exact) return pathname === href
  if (href === '/news') {
    return isActivePath(pathname, '/news')
  }

  if (href === '/domains') {
    return isActivePath(pathname, '/domains') || isActivePath(pathname, '/domain')
  }

  // Use exact match for /communities to avoid matching community slugs
  if (href === '/communities') {
    return pathname === '/communities'
  }

  // Admin entity-detail routes activate the corresponding list-page item.
  // Use pathname.startsWith directly for hrefs that end with '/' so we avoid
  // isActivePath doubling the slash (e.g. '/url/' → startsWith('/url//') is always false).
  if (href === '/urls') {
    return isActivePath(pathname, '/urls') || pathname.startsWith('/url/')
  }
  if (href === '/users') {
    return isActivePath(pathname, '/users')
  }
  return isActivePath(pathname, href)
}
