import { redirect } from 'next/navigation'

/* c8 ignore next */
export const dynamic = 'force-dynamic'

export default function FeedPage() {
  redirect('/feed/posts')
}
