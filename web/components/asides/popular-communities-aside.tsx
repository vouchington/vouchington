import { getCommunities } from '@/lib/api/server'
import { PopularCommunitiesAsideContent } from '@/components/asides/popular-communities-aside-content'

export async function PopularCommunitiesAside() {
  const data = await getCommunities({ searchParams: { limit: 3 } })
  const communities = data.results
    .slice(0, 3)
    .flatMap(r => (data.communities[r.id] ? [data.communities[r.id]!] : []))

  if (communities.length === 0) return null

  return <PopularCommunitiesAsideContent communities={communities} />
}
