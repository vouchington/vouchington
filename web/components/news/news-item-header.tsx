import { formatUtcDate } from '@ts-shared/utils/format'
import type { RssFeedItem } from '@/types/rss-feed-items'
import { TopicLabel } from '@/components/topics/topic-label'
import { CategoryChips } from '@/components/feed/category-chips'

interface NewsItemHeaderProps {
  item: Pick<RssFeedItem, 'published_at' | 'rss_feed' | 'categories'>
}

export function NewsItemHeader({ item }: NewsItemHeaderProps) {
  const sourceName = item.rss_feed.title
  const publishedAt = formatUtcDate(item.published_at)
  const sourceTopic = item.rss_feed.topic

  return (
    <div
      data-pw='news-item-header'
      className='flex min-w-0 items-center gap-2 overflow-x-auto scrollbar-hide text-xs text-muted-foreground'
    >
      <TopicLabel
        topic={sourceTopic}
        tab='latest'
        className='shrink-0 cursor-pointer hover:bg-accent'
        data-pw='source-badge-link'
      >
        {sourceName}
      </TopicLabel>
      <span className='shrink-0 whitespace-nowrap'>{publishedAt}</span>
      <CategoryChips
        categories={item.categories}
        inline
        tab='news'
      />
    </div>
  )
}
