'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { useTranslations } from '@/lib/i18n/use-translations'
import { cn } from '@/lib/utils'

type ApiKeyPresetOption = {
  id: string
  label: string
}

const EMPTY_PRESETS: ApiKeyPresetOption[] = []
const NOOP = () => {}
const NOOP_SET = (_value: string) => {}

interface CreateApiKeyFormProps {
  label?: string
  presets?: ApiKeyPresetOption[]
  selectedPresetId?: string
  submitting?: boolean
  onCancel?: () => void
  onCreate?: () => void
  setLabel?: (label: string) => void
  setSelectedPresetId?: (presetId: string) => void
}

export function CreateApiKeyForm({
  label = '',
  presets = EMPTY_PRESETS,
  selectedPresetId = '',
  submitting = false,
  onCancel = NOOP,
  onCreate = NOOP,
  setLabel = NOOP_SET,
  setSelectedPresetId = NOOP_SET,
}: CreateApiKeyFormProps) {
  const t = useTranslations()
  return (
    <div className='space-y-3 rounded-md border p-4'>
      <p className='text-sm font-medium'>
        {t('extracted.apiKeysManager.createApiKeyForm.createApiKey_950dd00f')}
      </p>
      <fieldset className='space-y-2'>
        <legend className='text-sm font-medium'>
          {t('extracted.apiKeysManager.createApiKeyForm.keyType_7e21c8f4')}
        </legend>
        <RadioGroup
          aria-label={t('extracted.apiKeysManager.createApiKeyForm.keyType_7e21c8f4')}
          value={selectedPresetId}
          onValueChange={setSelectedPresetId}
          className='grid gap-2 sm:grid-cols-2'
        >
          {presets.map(preset => (
            <PresetRadio
              key={preset.id}
              preset={preset}
              selectedPresetId={selectedPresetId}
              setSelectedPresetId={setSelectedPresetId}
            />
          ))}
        </RadioGroup>
      </fieldset>
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
          size='sm'
          onClick={onCreate}
          loading={submitting}
          disabled={submitting || !label.trim()}
          data-pw='api-keys-create-confirm-button'
        >
          {t('extracted.apiKeysManager.createApiKeyForm.create_4759498a')}
        </Button>
        <Button
          size='sm'
          variant='outline'
          onClick={onCancel}
          data-pw='api-keys-create-cancel-button'
        >
          {t('extracted.apiKeysManager.createApiKeyForm.cancel_19766ed6')}
        </Button>
      </div>
    </div>
  )
}

function PresetRadio({
  preset,
  selectedPresetId,
  setSelectedPresetId,
}: {
  preset: ApiKeyPresetOption
  selectedPresetId: string
  setSelectedPresetId: (presetId: string) => void
}) {
  const id = `api-key-preset-${preset.id}`
  return (
    <div
      onPointerDown={() => setSelectedPresetId(preset.id)}
      className={cn(
        'flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-normal transition-colors hover:bg-accent/50',
        preset.id === selectedPresetId && 'border-primary bg-primary/5 hover:bg-primary/5',
      )}
    >
      <RadioGroupItem
        id={id}
        value={preset.id}
      />
      <Label
        htmlFor={id}
        className='cursor-pointer flex-1'
      >
        {preset.label}
      </Label>
    </div>
  )
}
