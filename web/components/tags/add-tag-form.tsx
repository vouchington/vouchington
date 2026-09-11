'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { TagAutocomplete } from './tag-autocomplete'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { createEntityRelation } from '@/lib/api/client/entity-relations'
import onError from '@/lib/on-error'
import { isTagLimitError } from '@/lib/api/error-helpers'
import { useTranslations } from '@/lib/i18n/use-translations'
import { TagLimitCta } from './tag-limit-cta'
import type { EnumOption } from './types'

interface AddTagFormProps {
  entityType: string
  entityId: string
  predicate: string
  objectType: 'topic' | 'post' | 'url'
  excludeIds?: string[]
  enumOptions?: EnumOption[]
  enumSelectLabel?: string
  onTagAdded?: () => void
}

const EMPTY_EXCLUDE_IDS: string[] = []

export function AddTagForm({
  entityType,
  entityId,
  predicate,
  objectType,
  excludeIds = EMPTY_EXCLUDE_IDS,
  enumOptions,
  enumSelectLabel,
  onTagAdded,
}: AddTagFormProps) {
  const t = useTranslations()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [limitReached, setLimitReached] = useState(false)
  const { refresh } = useRouter()
  const isBusy = isSubmitting || isPending

  const submitTag = async (id: string) => {
    if (isBusy) return
    setIsSubmitting(true)
    try {
      await createEntityRelation(entityType, entityId, predicate, objectType, id)
      startTransition(() => {
        refresh()
        onTagAdded?.()
      })
    } catch (error) {
      if (isTagLimitError(error)) {
        setLimitReached(true)
      } else {
        onError(error, { fallback: t('extracted.tags.addTagForm.failedToAddTag_17a3edd6') })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  if (limitReached) {
    return <TagLimitCta />
  }

  if (enumOptions) {
    const availableOptions = enumOptions.filter(opt => !excludeIds.includes(opt.id))
    if (availableOptions.length === 0) return null

    return (
      <Select
        disabled={isBusy}
        onValueChange={submitTag}
        value=''
      >
        <SelectTrigger
          className='h-11 sm:h-9'
          data-pw='publisher-type-select'
          aria-label={
            enumSelectLabel ?? t('extracted.tags.addTagForm.selectPublisherType_88f9a3bd')
          }
        >
          <SelectValue
            placeholder={
              enumSelectLabel ?? t('extracted.tags.addTagForm.selectAPublisherTypeToAdd_0acfa0e1')
            }
          />
        </SelectTrigger>
        <SelectContent>
          {availableOptions.map(opt => (
            <SelectItem
              key={opt.id}
              value={opt.id}
              // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from enum data
              data-pw={`publisher-type-option-${opt.slug}`}
            >
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  return (
    <TagAutocomplete
      objectType={objectType}
      excludeIds={excludeIds}
      onSelect={submitTag}
      placeholder={t('extracted.tags.addTagForm.searchForObjecttypeSToTag_43b71fff', {
        objectType,
      })}
      disabled={isBusy}
    />
  )
}
