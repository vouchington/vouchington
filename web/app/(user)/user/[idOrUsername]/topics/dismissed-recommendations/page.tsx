import { redirect } from 'next/navigation'
import { createNoIndexMetadata } from '@/lib/seo/metadata'

export const dynamic = 'force-dynamic'
export const metadata = createNoIndexMetadata()

export default function UserDismissedTopicsRedirect() {
  redirect('/my/topics/dismissed-recommendations')
}
