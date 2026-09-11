import type { ReactNode, HTMLAttributes } from 'react'
import Link from 'next/link'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { getTopicDisplayTitle } from '@/lib/topics/display-name'
import { topicHref, type TopicTab } from '@/lib/links/entity-href'
import { cn } from '@/lib/utils'

interface TopicLabelTopic {
  id: string
  slug?: string | null
  topic_type: string
  name: string
}

type TopicLabelProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  topic: TopicLabelTopic
  tab?: TopicTab
  variant?: BadgeProps['variant']
  prefetch?: boolean
  ariaLabel?: string
  children?: ReactNode
}

export function TopicLabel({
  topic,
  tab,
  variant = 'secondary',
  className,
  prefetch = false,
  ariaLabel,
  children,
  ...props
}: TopicLabelProps) {
  return (
    <Badge
      data-pw='topic-label'
      variant={variant}
      asChild
      className={cn('min-h-6', className)}
      {...props}
    >
      <Link
        href={topicHref(topic, tab)}
        prefetch={prefetch}
        aria-label={ariaLabel}
      >
        {children ?? getTopicDisplayTitle(topic)}
      </Link>
    </Badge>
  )
}
