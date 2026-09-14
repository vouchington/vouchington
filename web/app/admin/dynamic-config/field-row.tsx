'use client'

import { useState } from 'react'
import * as Sentry from '@sentry/nextjs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { removeFeatureFlagOverride, setFeatureFlagOverride } from '@/lib/feature-flags/cookies'
import type { DynamicConfigField, DynamicConfigFieldValue } from '@/lib/api/client/dynamic-config'
import { useTranslations } from '@/lib/i18n/use-translations'

interface DynamicConfigFieldRowProps {
  field: DynamicConfigField
  isFeatureFlags: boolean
  canUpdate: boolean
  localOverrides: Record<string, boolean>
  refreshLocalOverrides: () => void
  saving: boolean
  updateField: (field: string, value: DynamicConfigFieldValue) => Promise<void>
}

export function DynamicConfigFieldRow({
  field,
  isFeatureFlags,
  canUpdate,
  localOverrides,
  refreshLocalOverrides,
  saving,
  updateField,
}: DynamicConfigFieldRowProps) {
  const t = useTranslations()
  const [draft, setDraft] = useState<string | undefined>(undefined)
  const displayValue = draft ?? String(field.value)
  const parsedNumber = Number(displayValue)
  const numberValid =
    displayValue.trim() !== '' &&
    Number.isFinite(parsedNumber) &&
    (!field.integer || Number.isInteger(parsedNumber)) &&
    (field.min_value === undefined || parsedNumber >= field.min_value) &&
    (field.max_value === undefined || parsedNumber <= field.max_value)
  const numberDirty = draft !== undefined && draft !== String(field.value)
  const localOverride =
    field.name in localOverrides ? (localOverrides[field.name] ? 'enabled' : 'disabled') : 'none'
  const saveNumberField = async () => {
    try {
      await updateField(field.name, parsedNumber)
      setDraft(undefined)
    } catch {
      // Keep the draft value visible so the admin can retry after a failed save.
    }
  }

  return (
    <tr>
      <td className='px-4 py-3 align-top'>
        <Label className='font-mono text-sm'>{field.name}</Label>
        <p className='mt-1 text-xs text-muted-foreground'>{field.description}</p>
      </td>
      <td className='px-4 py-3 align-top'>
        {field.type === 'boolean' ? (
          <Switch
            checked={Boolean(field.value)}
            onCheckedChange={value => updateField(field.name, value).catch(Sentry.captureException)}
            disabled={!canUpdate || saving}
            aria-label={field.name}
            data-pw='dynamic-config-boolean-field'
          />
        ) : field.type === 'string' ? (
          <div className='flex items-center gap-2'>
            <Input
              className='w-48 font-mono text-sm'
              value={displayValue}
              onChange={event => setDraft(event.target.value)}
              disabled={!canUpdate}
              aria-label={field.name}
              data-pw='dynamic-config-string-field'
            />
            {canUpdate && (
              <Button
                size='sm'
                disabled={
                  draft === undefined || draft === String(field.value) || !draft.trim() || saving
                }
                onClick={async () => {
                  try {
                    await updateField(field.name, displayValue)
                    setDraft(undefined)
                  } catch {
                    // Keep draft visible so the admin can retry.
                  }
                }}
                data-pw='dynamic-config-string-save-field'
              >
                {t('extracted.dynamicConfig.fieldRow.save_1509f561')}
              </Button>
            )}
          </div>
        ) : (
          <div className='flex items-center gap-2'>
            <Input
              className='w-36 font-mono text-sm'
              value={displayValue}
              inputMode={field.integer ? 'numeric' : 'decimal'}
              onChange={event => setDraft(event.target.value)}
              disabled={!canUpdate}
              aria-label={field.name}
              data-pw='dynamic-config-number-field'
            />
            {canUpdate && (
              <Button
                size='sm'
                disabled={!numberDirty || !numberValid || saving}
                onClick={saveNumberField}
                data-pw='dynamic-config-save-field'
              >
                {t('extracted.dynamicConfig.fieldRow.save_1509f561')}
              </Button>
            )}
          </div>
        )}
      </td>
      {isFeatureFlags && canUpdate && (
        <td className='px-4 py-3 align-top'>
          <Select
            value={localOverride}
            onValueChange={value => {
              if (value === 'none') removeFeatureFlagOverride(field.name)
              else setFeatureFlagOverride(field.name, value === 'enabled')
              refreshLocalOverrides()
            }}
          >
            <SelectTrigger
              className='w-40'
              aria-label={t('extracted.dynamicConfig.fieldRow.localOverrideForFieldname_053ef4ec', {
                fieldName: field.name,
              })}
              data-pw='dynamic-config-feature-override'
            >
              <SelectValue
                placeholder={t('extracted.dynamicConfig.fieldRow.noOverride_e30b60bf')}
              />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='none'>
                {t('extracted.dynamicConfig.fieldRow.noOverride_e30b60bf')}
              </SelectItem>
              <SelectItem value='enabled'>
                {t('extracted.dynamicConfig.fieldRow.enabled_92c1cdfd')}
              </SelectItem>
              <SelectItem value='disabled'>
                {t('extracted.dynamicConfig.fieldRow.disabled_75081b59')}
              </SelectItem>
            </SelectContent>
          </Select>
        </td>
      )}
    </tr>
  )
}
