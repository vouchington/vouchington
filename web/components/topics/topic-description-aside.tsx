import { Card } from '@/components/ui/card'
import { MARKDOWN_CONTENT_FEATURES_UTM } from '@/components/shared/markdown-content-features'
import { MarkdownContent } from '@/components/shared/markdown-content'
import { UserLink } from '@/components/users/user-link'
import type { TopicContentUpdate } from '@/types/topics'
import type { getTranslations } from '@/lib/i18n/get-translations'

const contentUpdateDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
})

interface TopicDescriptionAsideProps {
  t: Awaited<ReturnType<typeof getTranslations>>
  html: string
  topicName: string
  contentUpdate?: TopicContentUpdate | null
  contentLanguage?: string | null
}

function getUserDisplayName(user: TopicContentUpdate['updated_by']): string {
  return user.display_account?.name ?? user.username ?? user.id
}

export function TopicDescriptionAside({
  t,
  html,
  topicName,
  contentUpdate,
  contentLanguage,
}: TopicDescriptionAsideProps) {
  if (!html && !contentUpdate) return null
  return (
    <Card className='p-4 space-y-2'>
      <h3 className='text-sm font-semibold'>
        {t('extracted.topics.topicDescriptionAside.aboutTopicname_568ddb3c', { topicName })}
      </h3>
      {html && (
        <MarkdownContent
          html={html}
          className='text-xs text-muted-foreground'
          features={MARKDOWN_CONTENT_FEATURES_UTM}
          lang={contentLanguage ?? undefined}
        />
      )}
      {contentUpdate && (
        <p
          className='text-xs text-muted-foreground'
          suppressHydrationWarning
        >
          {t('extracted.topics.topicDescriptionAside.updatedOnDateBy_49f1f3ef', {
            date: contentUpdateDateFormatter.format(new Date(contentUpdate.updated_at)),
          })}{' '}
          <UserLink
            user={contentUpdate.updated_by}
            className='font-medium text-foreground hover:underline'
          >
            {getUserDisplayName(contentUpdate.updated_by)}
          </UserLink>
        </p>
      )}
    </Card>
  )
}
