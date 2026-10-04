'use client'

import { getPostTypeFromSlug } from '@/lib/route-configs'
import { getTopicTypeFromSlug } from '@/types/topics'
import { assertPathIdentifier } from './path-identifiers'

export type HostedUse =
  | { kind: 'post'; identifier: string; hostedUseUrl: string }
  | { kind: 'user'; identifier: string; hostedUseUrl: string }
  | { kind: 'topic'; identifier: string; topicType: string; hostedUseUrl: string }
  | { kind: 'community'; identifier: string; hostedUseUrl: string }

export function parseCopyrightHostedUseUrl(value: string): HostedUse {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Enter the full URL of the Voucha page containing the image.')
  }
  const currentOrigin = window.location.origin
  if (
    (url.origin !== currentOrigin && url.origin !== 'https://voucha.ai') ||
    url.search ||
    url.hash
  )
    throw new Error('Enter a canonical Voucha page URL without a query or fragment.')
  const segments = url.pathname.split('/').filter(Boolean)
  let identifier: string
  try {
    if (segments.length !== 2) throw new Error('Invalid path')
    identifier = assertPathIdentifier(decodeURIComponent(segments[1]!))
  } catch {
    throw new Error('Enter the URL of a supported Voucha page.')
  }
  const hostedUseUrl = url.href
  if (segments[0] === 'user') return { kind: 'user', identifier, hostedUseUrl }
  if (segments[0] === 'communities') return { kind: 'community', identifier, hostedUseUrl }
  if (getPostTypeFromSlug(segments[0]!)) return { kind: 'post', identifier, hostedUseUrl }
  const topicType = getTopicTypeFromSlug(segments[0]!)
  if (topicType) return { kind: 'topic', identifier, topicType, hostedUseUrl }
  throw new Error('Enter the URL of a supported Voucha page.')
}
