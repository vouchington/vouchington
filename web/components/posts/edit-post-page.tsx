import { notFound, redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/get-current-user'
import { getCommunity, getPost, getMyFinancialProfile, getTopic } from '@/lib/api/server'
import { PostForm } from '@/components/posts/post-form'
import { EditPostPageBody } from './edit-post-page-body'
import { getPostSlugFromType } from '@/lib/route-configs'
import { toDataPointTopic } from './post-form/initial-state'
import { isOfficialAccount } from '@/lib/auth/official-account'
import { getTranslations } from '@/lib/i18n/get-translations'

interface Props {
  id: string
  postType: 'discussion' | 'review' | 'data_point' | 'article' | 'blog_post'
  title: string
}

export async function EditPostPage({ id, postType, title }: Props) {
  const t = await getTranslations()
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const [postData, financialProfileData] = await Promise.all([
    getPost(id),
    postType === 'data_point' ? getMyFinancialProfile().catch(() => null) : Promise.resolve(null),
  ])
  if (!postData) notFound()

  const post = postData.post
  if (!post || post.post_type !== postType) notFound()
  const slug = getPostSlugFromType(postType)
  if (user.id !== post.created_by_id && !user.roles.includes('administrator')) {
    redirect(`/${slug}/${id}`)
  }

  const dataPointTopicId =
    postType === 'data_point'
      ? (
          (post.structured_data as Record<string, unknown> | null)?.topic_ids as
            | string[]
            | undefined
        )?.[0]
      : undefined

  const [communityData, dataPointTopicData] = await Promise.all([
    post.community_id ? getCommunity(post.community_id) : Promise.resolve(null),
    dataPointTopicId ? getTopic(dataPointTopicId).catch(() => null) : Promise.resolve(null),
  ])
  const initialDataPointTopic = dataPointTopicData
    ? toDataPointTopic(dataPointTopicData.topic)
    : undefined
  const isOfficialConsumerTrustPost =
    isOfficialAccount(user) && (postType === 'review' || postType === 'data_point')
  const initialDiscussionCategories =
    postType === 'discussion'
      ? (post.post_explicit_categories ?? []).map(category =>
          category.type === 'topic'
            ? { id: category.topic_id, name: category.topic_name }
            : { id: '', name: '', hashtag: category.hashtag },
        )
      : undefined

  const officialGateMessage = isOfficialConsumerTrustPost
    ? t('extracted.posts.editPostPage.officialAccountsCannotEditCommunityReviews_1a312816')
    : null

  return (
    <EditPostPageBody
      title={title}
      officialGateMessage={officialGateMessage}
    >
      {officialGateMessage == null ? (
        <PostForm
          postType={postType}
          post={post}
          isAdmin={user.roles.includes('administrator')}
          userFinancialProfile={financialProfileData?.financial_profile ?? null}
          communityVisibility={communityData?.community.visibility}
          initialDataPointTopic={initialDataPointTopic}
          initialDiscussionCategories={initialDiscussionCategories}
        />
      ) : null}
    </EditPostPageBody>
  )
}
