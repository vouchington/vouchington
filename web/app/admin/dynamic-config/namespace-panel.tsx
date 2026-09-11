'use client'

import { useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  clearAllFeatureFlagOverrides,
  getFeatureFlagServerSnapshot,
  getFeatureFlagSnapshot,
} from '@/lib/feature-flags/cookies'
import type {
  DynamicConfigFieldValue,
  DynamicConfigHistoryEntry,
  DynamicConfigNamespace,
} from '@/lib/api/client/dynamic-config'
import { DynamicConfigFieldRow } from './field-row'
import { DynamicConfigHistory } from './history'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DynamicConfigNamespacePanelProps {
  details: DynamicConfigNamespace | null
  history: DynamicConfigHistoryEntry[]
  loading: boolean
  savingFields: Record<string, boolean>
  updateField: (field: string, value: DynamicConfigFieldValue) => Promise<void>
}

export function DynamicConfigNamespacePanel({
  details,
  history,
  loading,
  savingFields,
  updateField,
}: DynamicConfigNamespacePanelProps) {
  const t = useTranslations()
  const localOverrides = useSyncExternalStore(
    subscribeFeatureFlagOverrideChanges,
    getFeatureFlagSnapshot,
    getFeatureFlagServerSnapshot,
  )

  if (loading && !details)
    return (
      <p className='text-muted-foreground'>
        {t('extracted.dynamicConfig.namespacePanel.loadingDynamicConfig_1317bc9a')}
      </p>
    )
  if (!details)
    return (
      <p className='text-muted-foreground'>
        {t('extracted.dynamicConfig.namespacePanel.selectANamespace_fd82d27b')}
      </p>
    )

  const canUpdate = details.can_update
  const refreshLocalOverrides = () => {
    window.dispatchEvent(new Event('feature-flag-overrides-updated'))
  }

  return (
    <div className='space-y-6'>
      <Card data-pw='dynamic-config-namespace-panel'>
        <CardHeader>
          <div className='flex items-center gap-3'>
            <CardTitle data-pw='dynamic-config-namespace-title'>{details.label}</CardTitle>
            {!canUpdate && (
              <span className='rounded border px-2 py-0.5 text-xs text-muted-foreground'>
                {t('extracted.dynamicConfig.namespacePanel.readOnly_8ac76735')}
              </span>
            )}
          </div>
          <p className='font-mono text-sm text-muted-foreground'>{details.namespace}</p>
          <p className='text-sm text-muted-foreground'>{details.description}</p>
        </CardHeader>
        <CardContent>
          <div className='overflow-x-auto'>
            <table
              className='w-full'
              data-pw='dynamic-config-fields-table'
            >
              <thead className='border-b bg-muted/50'>
                <tr>
                  <th className='px-4 py-3 text-left text-sm font-medium'>
                    {t('extracted.dynamicConfig.namespacePanel.field_f45fc1df')}
                  </th>
                  <th className='px-4 py-3 text-left text-sm font-medium'>
                    {t('extracted.dynamicConfig.namespacePanel.value_8e37953d')}
                  </th>
                  {details.namespace === 'feature-flags' && canUpdate && (
                    <th className='px-4 py-3 text-left text-sm font-medium'>
                      {t('extracted.dynamicConfig.namespacePanel.localOverride_2b0dad19')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className='divide-y'>
                {details.fields.map(field => (
                  <DynamicConfigFieldRow
                    key={field.name}
                    field={field}
                    isFeatureFlags={details.namespace === 'feature-flags'}
                    canUpdate={canUpdate}
                    localOverrides={localOverrides}
                    refreshLocalOverrides={refreshLocalOverrides}
                    saving={Boolean(savingFields[field.name])}
                    updateField={updateField}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {details.namespace === 'feature-flags' && canUpdate && (
            <div className='mt-4'>
              <Button
                variant='outline'
                onClick={() => {
                  clearAllFeatureFlagOverrides()
                  refreshLocalOverrides()
                }}
                disabled={Object.keys(localOverrides).length === 0}
                data-pw='dynamic-config-clear-feature-overrides'
              >
                {t('extracted.dynamicConfig.namespacePanel.clearLocalOverrides_1d2130cf')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <DynamicConfigHistory history={history} />
    </div>
  )
}

function subscribeFeatureFlagOverrideChanges(callback: () => void) {
  window.addEventListener('feature-flag-overrides-updated', callback)
  return () => window.removeEventListener('feature-flag-overrides-updated', callback)
}
