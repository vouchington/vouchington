import { HnDiscussionsAside } from '@/components/asides/hn-discussions-aside'
import { getCurrentUser } from '@/lib/auth/get-current-user'

export async function RssFeedItemHnDiscussionsAside({ url }: { url: string }) {
  const currentUser = await getCurrentUser()
  return (
    <HnDiscussionsAside
      enabled={currentUser?.should_import_hacker_news_discussions === true}
      urls={[url]}
    />
  )
}
