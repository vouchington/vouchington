import { getEntityRelations } from '@/lib/api/server'
import { getUserTags } from '@/lib/api/server/topics'
import { TAG_ASIDE_SEARCH_PARAMS } from '@/components/tags/tag-relation-configs'
import { UserTagsAsideView } from './user-tags-aside-view'

interface UserTagsAsideProps {
  userId: string
  canManageUserTags: boolean
}

export async function UserTagsAside({ userId, canManageUserTags }: UserTagsAsideProps) {
  const [response, catalog] = await Promise.all([
    getEntityRelations('user', userId, 'category', 'topic', {
      searchParams: TAG_ASIDE_SEARCH_PARAMS,
    }),
    getUserTags(),
  ])
  return (
    <UserTagsAsideView
      userId={userId}
      canManageUserTags={canManageUserTags}
      initialData={response}
      catalog={catalog.user_tags}
    />
  )
}
