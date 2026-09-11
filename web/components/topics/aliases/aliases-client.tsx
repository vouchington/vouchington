'use client'

import { type FormEvent, useState } from 'react'
import { useDidHydrate } from '@/hooks/use-did-hydrate'
import { Button } from '@/components/ui/button'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { usePaginatedList } from '@/hooks/use-paginated-list'
import { fetchTopicAliases, createTopicAliases, deleteTopicAlias } from '@/lib/api/client/topics'
import onError, { onSuccess } from '@/lib/on-error'
import type { Topic } from '@/types/topics'
import type { ListResponse } from '@/types/api-responses'
import { dedupeBy } from '@ts-shared/utils/collections'
import { useTranslations } from '@/lib/i18n/use-translations'
import { AddAliasesForm } from './add-aliases-form'

export function AliasesClient({
  topic,
  initialData,
}: {
  topic: Topic
  initialData: ListResponse<{ id: string; alias: string }>
}) {
  const t = useTranslations()
  const id = topic.id
  const mounted = useDidHydrate()
  const endpoint = `/api/v1/topics/${id}/aliases`
  const {
    pages,
    hasNextPage,
    endCursor,
    loadMore,
    loadingMore,
    fetchError,
    clearError,
    resetToFirstPage,
    resetKey,
  } = usePaginatedList(
    initialData,
    endpoint,
    {},
    {
      fetchPage: (_endpoint, options) => fetchTopicAliases(id, options),
    },
  )
  const [removedAliases, setRemovedAliases] = useState<ReadonlySet<string>>(() => new Set())
  const aliases = dedupeBy(
    pages.flatMap(page => page.results),
    alias => alias.id,
  ).filter(alias => !removedAliases.has(alias.id))
  const [adding, setAdding] = useState(false)
  const [deletingAlias, setDeletingAlias] = useState<string | null>(null)

  const handleAddAliases = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = e.currentTarget
    setAdding(true)
    try {
      const formData = new FormData(form)
      const aliasesInput = formData.get('aliases') as string

      await createTopicAliases(id, aliasesInput)

      // Refresh from page 1 because a new alias can change ordering and cursors.
      const updated = await fetchTopicAliases(id)
      resetToFirstPage?.(updated)
      setRemovedAliases(new Set())
      form.reset()
      onSuccess(t('extracted.aliases.aliasesClient.aliasesAdded_4d79744f'))
    } catch (error) {
      onError(error, {
        fallback: t('extracted.aliases.aliasesClient.failedToAddAliases_a95c6117'),
        tags: { form: 'admin-topic-aliases' },
      })
    } finally {
      setAdding(false)
    }
  }

  const handleDeleteAlias = async (alias: { id: string; alias: string }) => {
    setDeletingAlias(alias.id)
    try {
      await deleteTopicAlias(id, alias.id)
      setRemovedAliases(prev => new Set(prev).add(alias.id))
      onSuccess(
        t('extracted.aliases.aliasesClient.aliasAliasRemoved_213a1a3f', {
          alias: alias.alias,
        }),
      )
    } catch (error) {
      onError(error, {
        fallback: t('extracted.aliases.aliasesClient.failedToDeleteAlias_1aa98dd4'),
        tags: { form: 'admin-topic-aliases' },
      })
    } finally {
      setDeletingAlias(null)
    }
  }

  return (
    <div className='space-y-8'>
      {/* Current Aliases */}
      <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
        <h2
          data-pw='current-aliases-heading'
          className='mb-4 text-xl font-semibold text-foreground'
        >
          {t('extracted.aliases.aliasesClient.currentAliases_2906c3eb')}
        </h2>
        <InfiniteScroll
          hasNextPage={hasNextPage}
          endCursor={endCursor}
          onLoadMore={loadMore}
          loadingMore={loadingMore}
          fetchError={fetchError}
          clearError={clearError}
          resetKey={resetKey}
        >
          {aliases.length === 0 ? (
            <p className='text-sm text-muted-foreground'>
              {t('extracted.aliases.aliasesClient.noAliasesYet_a985d7c2')}
            </p>
          ) : (
            <ul className='divide-y divide-border'>
              {aliases.map(alias => (
                <li
                  key={alias.id}
                  // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                  data-pw={`alias-row-${alias.alias}`}
                  className='flex items-center justify-between py-3'
                >
                  <span className='text-sm text-foreground'>{alias.alias}</span>
                  {alias.alias === topic.slug ? null : (
                    <Button
                      type='button'
                      variant='destructive'
                      size='sm'
                      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
                      data-pw={`alias-remove-${alias.alias}`}
                      onClick={() => handleDeleteAlias(alias)}
                      loading={deletingAlias === alias.id}
                      disabled={deletingAlias === alias.id}
                    >
                      {deletingAlias === alias.id
                        ? t('extracted.aliases.aliasesClient.removing_60d18e42')
                        : t('extracted.aliases.aliasesClient.remove_c3812fc4')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </InfiniteScroll>
      </section>

      {/* Add Aliases */}
      <AddAliasesForm
        onSubmit={handleAddAliases}
        adding={adding}
        mounted={mounted}
      />
    </div>
  )
}
