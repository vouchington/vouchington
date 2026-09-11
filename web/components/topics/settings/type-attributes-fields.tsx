'use client'

import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TopicAutocomplete } from '@/components/posts/topic-autocomplete'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  topicReferenceFieldTypes,
  type TopicIdField,
  type TypeAttributeNames,
  type TypeAttributes,
} from './topic-edit-model'

export function TopicIdAttribute({
  fieldId,
  label,
  value,
  name,
  onChange,
  disabled,
}: {
  fieldId: TopicIdField
  label: string
  value: string | null
  /** Saved topic name used to seed the autocomplete display on load. */
  name?: string
  onChange: (id: string) => void
  disabled?: boolean
}) {
  const t = useTranslations()
  // Filter is derived from the canonical map, never hand-passed (see topic-edit-model.ts).
  const topicTypes = topicReferenceFieldTypes[fieldId] ?? undefined
  return (
    <div>
      <Label htmlFor={fieldId}>{label}</Label>
      <TopicAutocomplete
        id={fieldId}
        label={name ?? ''}
        value={value}
        topicTypes={topicTypes}
        onChange={id => onChange(id)}
        placeholder={t('extracted.settings.typeAttributesFields.searchLabel_37fea634', {
          label: label.toLowerCase(),
        })}
        ariaLabel={t('extracted.settings.typeAttributesFields.searchLabel_70f005ce', {
          label: label.toLowerCase(),
        })}
        disabled={disabled}
        clearOnTextEdit
      />
    </div>
  )
}

export function NumberAttribute({
  id,
  label,
  value,
  disabled,
}: {
  id: string
  label: string
  value?: number
  disabled?: boolean
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        type='number'
        id={id}
        name={id}
        defaultValue={value ?? ''}
        placeholder='0'
        className='mt-1'
        disabled={disabled}
      />
    </div>
  )
}

export function RewardsStatusFields({
  typeAttributes,
  getValue,
  names,
  setId,
  disabled,
}: {
  typeAttributes: TypeAttributes | null
  getValue: (field: TopicIdField) => string | null
  names: TypeAttributeNames
  setId: (field: TopicIdField) => (id: string) => void
  disabled: boolean
}) {
  const t = useTranslations()
  return (
    <>
      <TopicIdAttribute
        fieldId='rewards_program_id'
        label={t('extracted.settings.typeAttributesFields.rewardsProgram_f76a1d04')}
        value={getValue('rewards_program_id')}
        name={names.rewards_program_id}
        onChange={setId('rewards_program_id')}
        disabled={disabled}
      />
      <TopicIdAttribute
        fieldId='lifetime_version_id'
        label={t('extracted.settings.typeAttributesFields.lifetimeVersion_25e1a817')}
        value={getValue('lifetime_version_id')}
        name={names.lifetime_version_id}
        onChange={setId('lifetime_version_id')}
        disabled={disabled}
      />
      <NumberAttribute
        id='order_index'
        label={t('extracted.settings.typeAttributesFields.orderIndex_a858571c')}
        value={typeAttributes?.order_index}
        disabled={disabled}
      />
    </>
  )
}
