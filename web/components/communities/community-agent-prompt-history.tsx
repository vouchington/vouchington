'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { PaginatedListFooter } from '@/components/shared/paginated-list-footer'
import {
  fetchCommunityAgentPromptHistory,
  type CommunityAgentPromptHistoryEntry,
} from '@/lib/api/client/community-agent-prompts'
import onError from '@/lib/on-error'
import { useState, useTransition } from 'react'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  initialEntries: CommunityAgentPromptHistoryEntry[]
  initialNextCursor: string | null
  communitySlug: string
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

const ACTION_COLORS: Record<CommunityAgentPromptHistoryEntry['action'], string> = {
  created: 'text-green-600 bg-green-50',
  updated: 'text-blue-600 bg-blue-50',
  deleted: 'text-red-600 bg-red-50',
  allocated: 'text-purple-600 bg-purple-50',
  deallocated: 'text-gray-600 bg-gray-100',
  deactivated: 'text-gray-600 bg-gray-100',
}

export function CommunityAgentPromptHistory({
  initialEntries,
  initialNextCursor,
  communitySlug,
}: Props) {
  const t = useTranslations()
  const [extraEntries, setExtraEntries] = useState<CommunityAgentPromptHistoryEntry[]>([])
  const [loadMoreCursor, setLoadMoreCursor] = useState<string | null>(null)
  const [loadMoreError, setLoadMoreError] = useState<Error | null>(null)
  const [isLoading, startLoading] = useTransition()

  const entries = [...initialEntries, ...extraEntries]
  const currentCursor = extraEntries.length === 0 ? initialNextCursor : loadMoreCursor

  function handleLoadMore() {
    if (!currentCursor) return
    startLoading(async () => {
      try {
        setLoadMoreError(null)
        const result = await fetchCommunityAgentPromptHistory(communitySlug, {
          before: currentCursor,
        })
        setExtraEntries(prev => [...prev, ...result.entries])
        setLoadMoreCursor(result.next_cursor)
      } catch (error) {
        setLoadMoreError(error instanceof Error ? error : new Error(String(error)))
        onError(error, {
          fallback: t(
            'extracted.communities.communityAgentPromptHistory.failedToLoadHistory_eeddd17d',
          ),
        })
      }
    })
  }

  return (
    <Card data-pw='community-agent-prompt-history'>
      <CardHeader>
        <CardTitle>
          {t('extracted.communities.communityAgentPromptHistory.promptChangeHistory_e006c94c')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.communities.communityAgentPromptHistory.noChangesRecorded_fc21a407')}
          </p>
        ) : (
          <div className='space-y-3'>
            {entries.map(entry => (
              <div
                key={entry.id}
                className='rounded-md border p-3'
                data-pw='community-agent-prompt-history-entry'
              >
                <div className='flex flex-wrap items-center justify-between gap-2 text-sm'>
                  <span className='flex items-center gap-2'>
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${ACTION_COLORS[entry.action]}`}
                    >
                      {entry.action}
                    </span>
                    <span className='font-medium'>
                      {entry.changed_by?.username ??
                        entry.changed_by?.id ??
                        t('extracted.communities.communityAgentPromptHistory.deletedUser_152bc3aa')}
                    </span>
                  </span>
                  <time
                    className='text-muted-foreground'
                    suppressHydrationWarning
                  >
                    {DATE_TIME_FORMAT.format(new Date(entry.created_at))}
                  </time>
                </div>
                <div className='mt-3'>
                  {entry.action === 'created' ? (
                    <FieldsTable
                      fields={entry.next_fields}
                      label={t(
                        'extracted.communities.communityAgentPromptHistory.newValues_b7425472',
                      )}
                    />
                  ) : entry.action === 'deleted' ? (
                    <FieldsTable
                      fields={entry.previous_fields}
                      label={t(
                        'extracted.communities.communityAgentPromptHistory.previousValues_bbb6be9d',
                      )}
                    />
                  ) : Object.keys(entry.changed_fields).length > 0 ? (
                    <ChangedFieldsTable changedFields={entry.changed_fields} />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
        {currentCursor && !loadMoreError ? (
          <div className='mt-4'>
            <Button
              variant='outline'
              size='touchSm'
              onClick={handleLoadMore}
              disabled={isLoading}
              data-pw='community-agent-prompt-history-load-more'
            >
              {isLoading
                ? t('extracted.communities.communityAgentPromptHistory.loading_ba3bbbe1')
                : t('extracted.communities.communityAgentPromptHistory.loadMore_ac8991ef')}
            </Button>
          </div>
        ) : null}
        <PaginatedListFooter
          mode='retry-only'
          fetchError={loadMoreError}
          canLoadMore={currentCursor !== null}
          loadingMore={isLoading}
          clearError={() => setLoadMoreError(null)}
          loadMore={handleLoadMore}
        />
      </CardContent>
    </Card>
  )
}

function FieldsTable({ fields, label }: { fields: Record<string, unknown>; label: string }) {
  const entries = Object.entries(fields)
  if (entries.length === 0) return null
  return (
    <dl className='grid gap-1'>
      <dt className='text-xs font-medium text-muted-foreground'>{label}</dt>
      {entries.map(([field, value]) => (
        <div
          key={field}
          className='grid gap-1 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'
        >
          <span className='font-mono text-muted-foreground'>{field}</span>
          <span className='font-mono'>{String(value)}</span>
        </div>
      ))}
    </dl>
  )
}

function ChangedFieldsTable({
  changedFields,
}: {
  changedFields: Record<string, { previous: unknown; next: unknown }>
}) {
  return (
    <dl className='grid gap-2'>
      {Object.entries(changedFields).map(([field, change]) => (
        <div
          key={field}
          className='grid gap-1 text-sm md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]'
        >
          <dt className='font-mono text-muted-foreground'>{field}</dt>
          <dd className='font-mono'>{String(change.previous)}</dd>
          <dd className='font-mono'>{String(change.next)}</dd>
        </div>
      ))}
    </dl>
  )
}
