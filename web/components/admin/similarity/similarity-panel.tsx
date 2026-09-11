'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { PostContentText, type PostContentTextValue } from '@/components/posts/post-content-text'

type SimilarityPanelLabel =
  | { kind: 'ui-text'; text: string }
  | { kind: 'post-content'; content: PostContentTextValue | null; fallback: string }

export interface SimilarityPanelItem {
  id: string
  href?: string
  label: SimilarityPanelLabel
}

interface SimilarityPanelProps {
  title: string
  isLoading: boolean
  items: SimilarityPanelItem[]
  emptyHint?: string
}

/**
 * Presentational card that renders a short list of similarity-ranked entity
 * links. Used in admin duplicate-detection panels on topic create and topic
 * recommendation review surfaces.
 */
export function SimilarityPanel({
  title,
  isLoading,
  items,
  emptyHint = 'No similar items found.',
}: SimilarityPanelProps) {
  return (
    <Card className='p-4'>
      <h3 className='mb-3 text-sm font-semibold'>{title}</h3>
      {isLoading ? (
        <div
          className='space-y-2'
          data-pw='similarity-panel-loading-skeleton'
        >
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton
              key={i}
              className='h-4 w-full'
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className='text-sm text-muted-foreground'>{emptyHint}</p>
      ) : (
        <ul className='space-y-2'>
          {items.map(item => (
            <li key={item.id}>
              {item.label.kind === 'post-content' ? (
                <PostContentText
                  as={item.href ? Link : 'span'}
                  {...(item.href
                    ? {
                        prefetch: false,
                        href: item.href,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                      }
                    : {})}
                  className='block truncate text-sm text-foreground hover:underline'
                  content={item.label.content}
                  fallback={item.label.fallback}
                />
              ) : item.href ? (
                <Link
                  prefetch={false}
                  href={item.href}
                  target='_blank'
                  rel='noopener noreferrer'
                  className='block truncate text-sm text-foreground hover:underline'
                >
                  {item.label.text}
                </Link>
              ) : (
                <span className='block truncate text-sm text-foreground'>{item.label.text}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
