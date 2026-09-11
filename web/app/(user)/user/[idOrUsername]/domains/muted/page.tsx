import { redirect } from 'next/navigation'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata()

export default function UserMutedDomainsRedirect() {
  redirect('/my/domains/muted')
}
