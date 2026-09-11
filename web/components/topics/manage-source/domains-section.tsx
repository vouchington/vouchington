'use client'

import { Button } from '@/components/ui/button'
import type { TopicAdditionalHostname } from '@/lib/api/client/topic-additional-hostnames'
import type { TopicHostname } from './manage-source-model'
import { HostnameInput } from './hostname-input'
import { AdditionalDomains } from './additional-domains-section'
import { useTranslations } from '@/lib/i18n/use-translations'

export function DomainsSection({
  additionalHostnames,
  addingHostname,
  onAddHostname,
  onPrimaryHostnameSubmit,
  onRemoveHostname,
  primaryHostname,
  primaryHostnameSaving,
  removingHostnameId,
  hasNextHostnamesPage,
  hostnamesEndCursor,
  onLoadMoreHostnames,
  loadingMoreHostnames,
  hostnamesFetchError,
  onClearHostnamesError,
}: {
  additionalHostnames: TopicAdditionalHostname[]
  addingHostname: boolean
  onAddHostname: (e: React.FormEvent<HTMLFormElement>) => void
  onPrimaryHostnameSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  onRemoveHostname: (hostnameId: string, hostname: string) => void
  primaryHostname: TopicHostname | null
  primaryHostnameSaving: boolean
  removingHostnameId: string | null
  hasNextHostnamesPage: boolean
  hostnamesEndCursor: string | null
  onLoadMoreHostnames: () => Promise<void>
  loadingMoreHostnames: boolean
  hostnamesFetchError: Error | null
  onClearHostnamesError: () => void
}) {
  const t = useTranslations()
  return (
    <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
      <h2
        data-pw='domains-heading'
        className='mb-4 text-xl font-semibold text-foreground'
      >
        {t('extracted.manageSource.domainsSection.domains_ced67718')}
      </h2>
      <PrimaryDomainForm
        onPrimaryHostnameSubmit={onPrimaryHostnameSubmit}
        primaryHostname={primaryHostname}
        primaryHostnameSaving={primaryHostnameSaving}
      />
      <AdditionalDomains
        additionalHostnames={additionalHostnames}
        addingHostname={addingHostname}
        onAddHostname={onAddHostname}
        onRemoveHostname={onRemoveHostname}
        removingHostnameId={removingHostnameId}
        hasNextPage={hasNextHostnamesPage}
        endCursor={hostnamesEndCursor}
        onLoadMore={onLoadMoreHostnames}
        loadingMore={loadingMoreHostnames}
        fetchError={hostnamesFetchError}
        clearError={onClearHostnamesError}
      />
    </section>
  )
}

function PrimaryDomainForm({
  onPrimaryHostnameSubmit,
  primaryHostname,
  primaryHostnameSaving,
}: {
  onPrimaryHostnameSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  primaryHostname: TopicHostname | null
  primaryHostnameSaving: boolean
}) {
  const t = useTranslations()
  return (
    <div className='mb-6'>
      <h3
        data-pw='primary-domain-heading'
        className='mb-2 text-sm font-medium text-foreground'
      >
        {t('extracted.manageSource.domainsSection.primaryDomain_62b7efd8')}
      </h3>
      <form
        onSubmit={onPrimaryHostnameSubmit}
        className='flex items-end gap-2'
      >
        <HostnameInput
          dataPw='primary-domain-input'
          id='primary_hostname'
          keyValue={primaryHostname?.id ?? 'none'}
          label={t('extracted.manageSource.domainsSection.primaryDomain_b5872326')}
          name='primary_hostname'
          placeholder={t('extracted.manageSource.domainsSection.eGThepointsguyCom_26337ab3')}
          value={primaryHostname?.hostname ?? ''}
        />
        <Button
          type='submit'
          data-pw='primary-domain-save'
          loading={primaryHostnameSaving}
          disabled={primaryHostnameSaving}
        >
          {primaryHostnameSaving
            ? t('extracted.manageSource.domainsSection.saving_dc85af8f')
            : t('extracted.manageSource.domainsSection.save_1509f561')}
        </Button>
      </form>
      {!primaryHostname && (
        <p className='mt-1 text-xs text-muted-foreground'>
          {t('extracted.manageSource.domainsSection.aPrimaryDomainIsRequiredBefore_795d07bd')}
        </p>
      )}
    </div>
  )
}
