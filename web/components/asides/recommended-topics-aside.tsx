import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getRecommendedTopics } from '@/lib/api/server'
import { RecommendedTopicsAsideContent } from './recommended-topics-aside-content'

export async function RecommendedTopicsAside() {
  const user = await getCurrentUser()
  if (!user) return null

  const data = await getRecommendedTopics({ searchParams: { limit: 20 } })
  const bookmarks = data.bookmarks ?? {}
  const topics = data.results.reduce<NonNullable<(typeof data.topics)[string]>[]>((acc, r) => {
    if (acc.length < 5) {
      const topic = data.topics[r.id]
      if (
        topic &&
        !bookmarks[topic.id]?.['block'] &&
        !bookmarks[topic.id]?.['follow'] &&
        !bookmarks[topic.id]?.['dismiss_recommendation']
      )
        acc.push(topic)
    }
    return acc
  }, [])

  if (topics.length === 0) return null

  return (
    <RecommendedTopicsAsideContent
      topics={topics}
      initialBookmarks={bookmarks}
    />
  )
}
