'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  topicIdFields,
  typesWithAttributes,
  type TopicIdField,
  type TypeAttributeNames,
  type TypeAttributes,
} from './topic-edit-model'
import { AttributeFields } from './type-attributes-section-fields'
import { useTranslations } from '@/lib/i18n/use-translations'
import { useUiLocale } from '@/lib/i18n/ui-locale-context'
import { parseMajorUnitMoneyDraft } from '@/lib/money-input-draft'
import { isCurrencyCode } from '@ts-shared/money'

type IdOverrides = Partial<Record<TopicIdField, string>>

function resolveId(
  field: TopicIdField,
  overrides: IdOverrides,
  typeAttributes: TypeAttributes | null,
): string | null {
  if (field in overrides) return overrides[field] ?? null
  return typeAttributes?.[field] ?? null
}

export function TypeAttributesSection({
  topicId,
  ...props
}: {
  topicId: string
  currentTopicType?: string | null
  onTypeAttrSubmit: (data: Record<string, unknown>) => void
  typeAttributes: TypeAttributes | null
  typeAttributeNames: TypeAttributeNames
  typeAttrSaving: boolean
}) {
  return (
    <TypeAttributesSectionForTopic
      key={topicId}
      {...props}
    />
  )
}

function TypeAttributesSectionForTopic({
  currentTopicType,
  onTypeAttrSubmit,
  typeAttributes,
  typeAttributeNames,
  typeAttrSaving,
}: {
  currentTopicType?: string | null
  onTypeAttrSubmit: (data: Record<string, unknown>) => void
  typeAttributes: TypeAttributes | null
  typeAttributeNames: TypeAttributeNames
  typeAttrSaving: boolean
}) {
  const t = useTranslations()
  const uiLocale = useUiLocale()
  const [overrides, setOverrides] = useState<IdOverrides>({})
  const [annualFeeError, setAnnualFeeError] = useState<string | null>(null)

  if (!currentTopicType || !typesWithAttributes.has(currentTopicType)) return null

  const getValue = (field: TopicIdField): string | null =>
    resolveId(field, overrides, typeAttributes)

  const setId = (field: TopicIdField) => (id: string) => {
    setOverrides(prev => ({ ...prev, [field]: id }))
  }

  const handleFormSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    const data: Record<string, unknown> = {}
    for (const [key, value] of formData.entries()) {
      if (key === 'annual_fee_amount' || key === 'annual_fee_currency') continue
      if (value !== '') data[key] = Number(value)
    }
    const annualFeeAmount = formData.get('annual_fee_amount')
    const annualFeeCurrency = formData.get('annual_fee_currency')
    if (typeof annualFeeAmount === 'string' && annualFeeAmount && annualFeeCurrency) {
      if (typeof annualFeeCurrency !== 'string' || !isCurrencyCode(annualFeeCurrency)) {
        setAnnualFeeError(
          t('extracted.my.spendingCategoriesManager.pleaseEnterAValidAmount_010f1dd6'),
        )
        return
      }
      const parsedAnnualFee = parseMajorUnitMoneyDraft(annualFeeAmount, annualFeeCurrency, uiLocale)
      if (!parsedAnnualFee.accepted || parsedAnnualFee.money === null) {
        setAnnualFeeError(
          t('extracted.my.spendingCategoriesManager.pleaseEnterAValidAmount_010f1dd6'),
        )
        return
      }
      data.annual_fee = parsedAnnualFee.money
    }
    setAnnualFeeError(null)
    for (const field of topicIdFields) {
      const value = getValue(field)
      if (value !== null && value !== '') data[field] = value
    }
    onTypeAttrSubmit(data)
  }

  return (
    <section className='bg-card p-6 shadow-sm dark:shadow-none sm:rounded-lg'>
      <h2 className='mb-4 text-xl font-semibold text-foreground'>
        {t('extracted.settings.typeAttributesSection.typeAttributes_997d6d7e')}
      </h2>
      <form
        onSubmit={handleFormSubmit}
        className='space-y-4'
      >
        <AttributeFields
          currentTopicType={currentTopicType}
          typeAttributes={typeAttributes}
          getValue={getValue}
          names={typeAttributeNames}
          setId={setId}
          disabled={typeAttrSaving}
          annualFeeError={annualFeeError}
          onAnnualFeeChange={() => setAnnualFeeError(null)}
        />
        <Button
          type='submit'
          loading={typeAttrSaving}
          disabled={typeAttrSaving}
        >
          {typeAttrSaving ? 'Saving...' : 'Save Type Attributes'}
        </Button>
      </form>
    </section>
  )
}
