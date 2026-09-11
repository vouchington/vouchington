'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { AdminPageHeader } from '@/components/admin/admin-page-header'
import { Breadcrumbs } from '@/components/ui/breadcrumb'
import { buildBreadcrumbsForPath } from '@/lib/navigation/breadcrumbs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DynamicConfigNamespacePanel } from './namespace-panel'
import { useDynamicConfigState } from './dynamic-config-state'
import { useTranslations } from '@/lib/i18n/use-translations'

const BREADCRUMBS = buildBreadcrumbsForPath('/admin/dynamic-config', {
  isAuthenticated: true,
  intentCrumbOverride: { name: 'Engineering', path: '/admin/dynamic-config' },
  tail: [{ name: 'Dynamic Config', path: '/admin/dynamic-config' }],
})

export default function DynamicConfigPage() {
  const t = useTranslations()
  const state = useDynamicConfigState()
  const [query, setQuery] = useState('')
  const handleRefresh = state.loadData
  const filteredNamespaces = state.namespaces.filter(namespace =>
    `${namespace.label} ${namespace.namespace}`.toLowerCase().includes(query.toLowerCase()),
  )

  return (
    <div>
      <Breadcrumbs items={BREADCRUMBS} />
      <div className='mb-6'>
        <AdminPageHeader
          title={t('extracted.dynamicConfig.page.dynamicConfig_59cf5829')}
          dataPw='dynamic-config-heading'
          description={t(
            'extracted.dynamicConfig.page.manageRuntimeConfigurationNamespaces_8e3a5c72',
          )}
        >
          <Button
            onClick={handleRefresh}
            loading={state.loading}
            data-pw='dynamic-config-refresh'
          >
            {state.loading ? null : <RefreshCw data-icon='inline-start' />}
            {t('extracted.dynamicConfig.page.refresh_0e916101')}
          </Button>
        </AdminPageHeader>
      </div>
      <div className='grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]'>
        <aside className='space-y-3'>
          <Input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('extracted.dynamicConfig.page.searchNamespaces_0fc2213d')}
            aria-label={t('extracted.dynamicConfig.page.searchNamespaces_0fc2213d')}
            data-pw='dynamic-config-search'
          />
          <div
            className='rounded-lg border bg-card'
            data-pw='dynamic-config-namespace-list'
          >
            {filteredNamespaces.map(namespace => (
              <Button
                key={namespace.namespace}
                type='button'
                variant='ghost'
                onClick={() => state.selectNamespace(namespace.namespace)}
                className={`h-auto w-full justify-start rounded-none border-b px-3 py-3 text-left last:border-b-0 hover:bg-muted/50 ${
                  namespace.namespace === state.activeNamespace ? 'bg-muted' : ''
                }`}
                data-pw='dynamic-config-namespace-button'
              >
                <span
                  className='block text-sm font-medium text-foreground'
                  data-pw='dynamic-config-namespace-button-label'
                >
                  {namespace.label}
                </span>
                <span className='block truncate font-mono text-xs text-muted-foreground'>
                  {namespace.namespace}
                </span>
              </Button>
            ))}
            {filteredNamespaces.length === 0 && (
              <p className='p-4 text-sm text-muted-foreground'>
                {t('extracted.dynamicConfig.page.noNamespacesFound_76413bb1')}
              </p>
            )}
          </div>
        </aside>
        <DynamicConfigNamespacePanel
          details={state.details}
          history={state.history}
          loading={state.loading}
          savingFields={state.savingFields}
          updateField={state.updateField}
        />
      </div>
    </div>
  )
}
