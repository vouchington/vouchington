'use client'

import { Button } from '@/components/ui/button'
import type { TopicAdditionalHostname } from '@/lib/api/client/topic-additional-hostnames'
import { InfiniteScroll } from '@/components/shared/infinite-scroll'
import { HostnameInput } from './hostname-input'
import { useTranslations } from '@/lib/i18n/use-translations'

export function AdditionalDomains({
  additionalHostnames,
  addingHostname,
  onAddHostname,
  onRemoveHostname,
  removingHostnameId,
  hasNextPage,
  endCursor,
  onLoadMore,
  loadingMore,
  fetchError,
  clearError,
}: {
  additionalHostnames: TopicAdditionalHostname[]
  addingHostname: boolean
  onAddHostname: (e: React.FormEvent<HTMLFormElement>) => void
  onRemoveHostname: (hostnameId: string, hostname: string) => void
  removingHostnameId: string | null
  hasNextPage: boolean
  endCursor: string | null
  onLoadMore: () => Promise<void>
  loadingMore: boolean
  fetchError: Error | null
  clearError: () => void
}) {
  const t = useTranslations()
  return (
    <div>
      <h3
        data-pw='additional-domains-heading'
        className='mb-2 text-sm font-medium text-foreground'
      >
        {t('extracted.manageSource.additionalDomainsSection.additionalDomains_db7fab2c')}
      </h3>
      <InfiniteScroll
        hasNextPage={hasNextPage}
        endCursor={endCursor}
        onLoadMore={onLoadMore}
        loadingMore={loadingMore}
        fetchError={fetchError}
        clearError={clearError}
      >
        <AdditionalDomainList
          additionalHostnames={additionalHostnames}
          onRemoveHostname={onRemoveHostname}
          removingHostnameId={removingHostnameId}
        />
      </InfiniteScroll>
      <form
        onSubmit={onAddHostname}
        className='flex items-end gap-2'
      >
        <HostnameInput
          dataPw='additional-domain-input'
          id='new_hostname'
          label={t('extracted.manageSource.additionalDomainsSection.additionalDomain_3585853b')}
          name='new_hostname'
          placeholder={t(
            'extracted.manageSource.additionalDomainsSection.eGAlternateDomainCom_409f4680',
          )}
        />
        <Button
          type='submit'
          variant='secondary'
          data-pw='add-domain-submit'
          loading={addingHostname}
          disabled={addingHostname}
        >
          {addingHostname
            ? t('extracted.manageSource.additionalDomainsSection.adding_913a8849')
            : t('extracted.manageSource.additionalDomainsSection.addDomain_0f09df73')}
        </Button>
      </form>
    </div>
  )
}

function AdditionalDomainList({
  additionalHostnames,
  onRemoveHostname,
  removingHostnameId,
}: {
  additionalHostnames: TopicAdditionalHostname[]
  onRemoveHostname: (hostnameId: string, hostname: string) => void
  removingHostnameId: string | null
}) {
  const t = useTranslations()
  if (additionalHostnames.length === 0) {
    return (
      <p
        data-pw='additional-domains-empty'
        className='mb-3 text-sm text-muted-foreground'
      >
        {t('extracted.manageSource.additionalDomainsSection.noAdditionalDomainsLinked_0cbdaa8f')}
      </p>
    )
  }
  return (
    <ul className='mb-3 space-y-2'>
      {additionalHostnames.map(h => (
        <li
          key={h.hostname_id}
          // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
          data-pw={`additional-domain-row-${h.hostname}`}
          className='flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm'
        >
          <span className='text-foreground'>{h.hostname}</span>
          <Button
            type='button'
            variant='outline'
            size='sm'
            // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from row data
            data-pw={`additional-domain-remove-${h.hostname}`}
            onClick={() => onRemoveHostname(h.hostname_id, h.hostname)}
            loading={removingHostnameId === h.hostname_id}
            disabled={removingHostnameId === h.hostname_id}
          >
            {removingHostnameId === h.hostname_id
              ? t('extracted.manageSource.additionalDomainsSection.removing_60d18e42')
              : t('extracted.manageSource.additionalDomainsSection.remove_c3812fc4')}
          </Button>
        </li>
      ))}
    </ul>
  )
}
