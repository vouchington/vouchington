'use client'

import { clientApi } from './instance'
import { assertPathIdentifier } from './path-identifiers'

const POST_ROUTE_SEGMENTS = new Set([
  'article',
  'blog-post',
  'data-point',
  'discussion',
  'link',
  'review',
])

export type CopyrightNoticeResolvedTarget = {
  post_id: string
  image_id: string
  target_url: string
  order_index: number
  caption: string
}

type CopyrightHostedPostResponse = { post: { id: string } }
type CopyrightHostedImagesResponse = {
  images: Array<{ image_id: string; order_index: number; caption: string }>
}

/** Resolves a claimant-provided Voucha post URL into server-verified image choices. */
export async function resolveCopyrightNoticeTargets(
  targetUrl: string,
): Promise<CopyrightNoticeResolvedTarget[]> {
  const { identifier, hostedUseUrl } = parseCopyrightHostedUseUrl(targetUrl)
  const encodedIdentifier = encodeURIComponent(identifier)
  const [{ post }, { images }] = await Promise.all([
    clientApi.get<CopyrightHostedPostResponse>(`/api/v1/posts/${encodedIdentifier}`),
    clientApi.get<CopyrightHostedImagesResponse>(`/api/v1/posts/${encodedIdentifier}/images`),
  ])
  if (images.length === 0) throw new Error('This hosted use does not have any available images.')
  return images.map(image => ({
    post_id: post.id,
    image_id: image.image_id,
    target_url: hostedUseUrl,
    order_index: image.order_index,
    caption: image.caption,
  }))
}

function parseCopyrightHostedUseUrl(value: string): { identifier: string; hostedUseUrl: string } {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Enter the full URL of the Voucha post containing the material.')
  }
  const currentOrigin = window.location.origin
  if (
    (url.origin !== currentOrigin && url.origin !== 'https://voucha.ai') ||
    url.search ||
    url.hash
  )
    throw new Error('Enter a canonical Voucha post URL without a query or fragment.')
  const segments = url.pathname.split('/').filter(Boolean)
  if (segments.length !== 2 || !POST_ROUTE_SEGMENTS.has(segments[0]!))
    throw new Error('Enter the URL of a supported Voucha post.')
  let identifier: string
  try {
    identifier = assertPathIdentifier(decodeURIComponent(segments[1]!))
  } catch {
    throw new Error('Enter the URL of a supported Voucha post.')
  }
  return { identifier, hostedUseUrl: url.href }
}
