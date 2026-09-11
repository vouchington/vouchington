export const dynamic = 'force-dynamic'

import { permanentRedirect } from 'next/navigation'
import { createCommunityPathname } from '@/lib/links/entity-href'

interface PageProps {
  params: Promise<{ slug: string }>
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}

export default async function CommunityPostsRedirectPage({ params, searchParams }: PageProps) {
  const { slug } = await params
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const qs = new URLSearchParams()
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const val of value) {
        qs.append(key, val)
      }
    } else {
      qs.set(key, value)
    }
  }
  const suffix = qs.toString() ? `?${qs.toString()}` : ''
  permanentRedirect(`${createCommunityPathname(slug)}${suffix}`)
}
