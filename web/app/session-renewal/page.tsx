import { SessionRenewal } from '@/components/auth/session-renewal'
import { getSessionRenewalNext } from '@/lib/auth/session-renewal-url'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata('Sign in')

export default async function SessionRenewalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const query = await searchParams
  const next = Array.isArray(query.next) ? query.next[0] : query.next
  return <SessionRenewal next={getSessionRenewalNext(next)} />
}
