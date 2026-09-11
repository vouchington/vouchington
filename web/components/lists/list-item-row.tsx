'use client'
import { Badge } from '@/components/ui/badge'
import type { ListItem } from '@/types/api-responses'

const MEDIA_TYPE_LABELS: Record<string, string> = {
  article: 'Article',
  video: 'Video',
  audio: 'Podcast',
}

interface ListItemRowProps {
  item: ListItem
}

export function ListItemRow({ item }: ListItemRowProps) {
  const label =
    item.item_type === 'post' ? 'Post' : (MEDIA_TYPE_LABELS[item.media_type ?? ''] ?? 'Article')

  return (
    <article
      className='flex items-center gap-3 rounded-md border px-4 py-3 text-sm'
      data-pw='list-item-row'
    >
      <Badge
        variant='secondary'
        className='shrink-0'
      >
        {label}
      </Badge>
      <span className='min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground'>
        {item.entity_id}
      </span>
      <time
        dateTime={item.created_at}
        className='shrink-0 text-xs text-muted-foreground'
        suppressHydrationWarning
      >
        {new Date(item.created_at).toLocaleDateString()}
      </time>
    </article>
  )
}
