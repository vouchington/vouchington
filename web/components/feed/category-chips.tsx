import { Badge } from '@/components/ui/badge'
import { TopicLabel } from '@/components/topics/topic-label'
import type { TopicTab } from '@/lib/links/entity-href'
import type { RssFeedItem } from '@/types/rss-feed-items'

interface CategoryChipsProps {
  categories: RssFeedItem['categories']
  /** When true, renders badges directly without a wrapping div (for inline flex use). */
  inline?: boolean
  /** Topic tab to link to. Pass 'news' when rendering inside a news-feed item. */
  tab?: TopicTab
}

export function CategoryChips({ categories, inline = false, tab }: CategoryChipsProps) {
  if (categories.length === 0) return null

  const seenTopicIds = new Set<string>()
  // Pre-seed with texts covered by topic chips (case-insensitive) so plain-text
  // badges don't duplicate a topic that is already rendered as a TopicLabel.
  const seenTexts = new Set<string>()
  for (const cat of categories) {
    if (cat.topic) {
      seenTexts.add(cat.category_text.toLowerCase())
      seenTexts.add(cat.topic.name.toLowerCase())
    }
  }
  const ordered = [...categories.filter(c => c.topic), ...categories.filter(c => !c.topic)]
  const chips = ordered.flatMap(cat => {
    const topic = cat.topic
    if (topic) {
      if (seenTopicIds.has(topic.id)) return []
      seenTopicIds.add(topic.id)
      return [
        <TopicLabel
          key={topic.id}
          data-pw='category-chip'
          topic={topic}
          tab={tab}
          variant='outline'
          className='shrink-0 whitespace-nowrap text-xs hover:bg-accent'
        />,
      ]
    }
    const lowerText = cat.category_text.toLowerCase()
    if (seenTexts.has(lowerText)) return []
    seenTexts.add(lowerText)
    return [
      <Badge
        key={cat.category_text}
        variant='outline'
        className='shrink-0 whitespace-nowrap text-xs'
      >
        {cat.category_text}
      </Badge>,
    ]
  })

  if (inline) return chips
  return (
    <div
      data-pw='category-chips'
      className='flex gap-1 overflow-x-auto scrollbar-hide'
    >
      {chips}
    </div>
  )
}
