'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'
import { ChoiceRadioGroup } from './choice-radio-group'
import { ScopePicker } from './scope-picker'
import type { ApiKeyScopeSelection } from './use-api-key-scope-selection'

interface CreateApiKeyFormProps {
  label: string
  selection: ApiKeyScopeSelection
  showAudience: boolean
  submitting: boolean
  onCancel: () => void
  onCreate: () => void
  setLabel: (label: string) => void
}

export function CreateApiKeyForm({
  label,
  selection,
  showAudience,
  submitting,
  onCancel,
  onCreate,
  setLabel,
}: CreateApiKeyFormProps) {
  const t = useTranslations()
  const canCreate = label.trim() !== '' && selection.permissions.length > 0
  return (
    <form
      className='space-y-3 rounded-md border p-4'
      onSubmit={event => {
        event.preventDefault()
        onCreate()
      }}
    >
      <p className='text-sm font-medium'>
        {t('extracted.apiKeysManager.createApiKeyForm.createApiKey_950dd00f')}
      </p>
      <ChoiceRadioGroup
        idPrefix='api-key-type'
        legend={t('extracted.apiKeysManager.createApiKeyForm.keyType_7e21c8f4')}
        options={[
          {
            value: 'rss',
            label: t('extracted.apiKeysManager.createApiKeyForm.rssFeed_8058db69'),
            dataPw: 'api-keys-create-type-rss',
          },
          {
            value: 'mcp',
            label: t('extracted.apiKeysManager.createApiKeyForm.mcpServer_d938c816'),
            dataPw: 'api-keys-create-type-mcp',
          },
        ]}
        value={selection.keyType}
        onChange={selection.handleKeyTypeChange}
      />
      {selection.keyType === 'mcp' && showAudience && (
        <ChoiceRadioGroup
          idPrefix='api-key-audience'
          legend={t('extracted.apiKeysManager.createApiKeyForm.audience_545c0235')}
          options={[
            {
              value: 'user',
              label: t('extracted.apiKeysManager.createApiKeyForm.yourAccount_dbb5f637'),
              dataPw: 'api-keys-create-audience-user',
            },
            {
              value: 'admin',
              label: t('extracted.apiKeysManager.createApiKeyForm.administrator_e7d3e769'),
              dataPw: 'api-keys-create-audience-admin',
            },
          ]}
          value={selection.audience}
          onChange={selection.handleAudienceChange}
        />
      )}
      {selection.keyType === 'mcp' && (
        <ScopePicker
          idPrefix='api-key'
          rows={selection.rows}
          selected={selection.mcpScopes}
          onToggle={selection.handleScopeToggle}
        />
      )}
      <div className='space-y-1'>
        <Label htmlFor='api-key-label'>
          {t('extracted.apiKeysManager.createApiKeyForm.label_0e66373f')}
        </Label>
        <Input
          id='api-key-label'
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder={t('extracted.apiKeysManager.createApiKeyForm.eGMyRssReader_2505383d')}
          data-pw='api-keys-create-label-input'
        />
      </div>
      <div className='flex gap-2'>
        <Button
          type='submit'
          size='sm'
          loading={submitting}
          disabled={submitting || !canCreate}
          data-pw='api-keys-create-confirm-button'
        >
          {t('extracted.apiKeysManager.createApiKeyForm.create_4759498a')}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='outline'
          onClick={onCancel}
          data-pw='api-keys-create-cancel-button'
        >
          {t('extracted.apiKeysManager.createApiKeyForm.cancel_19766ed6')}
        </Button>
      </div>
    </form>
  )
}
