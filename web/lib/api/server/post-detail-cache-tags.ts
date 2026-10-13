import type { NextRequest, NextResponse } from 'next/server'
import { POST_TYPE_SLUGS } from '@ts-shared/cache/cache-tags'
import { getPostAuthorCacheTag } from './proxy'

function getCacheFillPostId(request: NextRequest): string | null {
  if (request.method !== 'GET' || request.headers.get('x-voucha-request-kind') !== 'cache-fill') {
    return null
  }
  const segments = request.nextUrl.pathname.split('/').filter(Boolean)
  if (segments.length !== 2 || !POST_TYPE_SLUGS.has(segments[0]!)) return null
  return segments[1]!
}

export async function tagPostDetailCacheFill(
  response: NextResponse,
  request: NextRequest,
  backendUrl: string,
): Promise<void> {
  const postId = getCacheFillPostId(request)
  if (!postId) return

  const dependency = await getPostAuthorCacheTag(backendUrl, postId)
  if (dependency.ok) {
    if (dependency.tag) response.headers.set('Cache-Tag', dependency.tag)
  } else {
    // The Worker rejects unknown Vary tokens, so a failed dependency lookup cannot
    // leave an untagged HTML page in its shared cache while the page still renders.
    response.headers.set('Vary', '*')
  }
}
