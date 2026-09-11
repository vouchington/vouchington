/**
 * Empty state component for when no results are found
 */

import { FileQuestion, Search, Inbox, MessageSquare, PenLine } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EmptyStateProps {
  title?: string
  description?: string
  icon?: 'search' | 'inbox' | 'question' | 'message-square' | 'pen-line'
  className?: string
  children?: React.ReactNode
}

export function EmptyState({
  title = 'No results found',
  description = 'Try adjusting your search or filters',
  icon = 'search',
  className,
  children,
}: EmptyStateProps) {
  const iconMap = {
    search: Search,
    inbox: Inbox,
    'message-square': MessageSquare,
    'pen-line': PenLine,
    question: FileQuestion,
  } as const
  const Icon = iconMap[icon] ?? FileQuestion

  return (
    <div
      data-pw='empty-state'
      className={cn('flex flex-col items-center justify-center py-12 text-center', className)}
    >
      <Icon
        className='mb-3 h-8 w-8 text-muted-foreground'
        aria-hidden='true'
      />
      <h3
        data-pw='empty-state-title'
        className='text-base font-medium'
      >
        {title}
      </h3>
      <p
        data-pw='empty-state-description'
        className='mt-1 max-w-sm text-sm text-muted-foreground'
      >
        {description}
      </p>
      {children && <div className='mt-3'>{children}</div>}
    </div>
  )
}
