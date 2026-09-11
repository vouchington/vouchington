'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CuratedAsideEntityAutocomplete } from './curated-aside-entity-autocomplete'
import { adminCreateCuratedAside } from '@/lib/api/client/admin-curated-asides'
import onError from '@/lib/on-error'
import type { CuratedAsideItem, CuratedAsideType } from '@/types/api-responses/curated-aside-items'
import { useTranslations } from '@/lib/i18n/use-translations'

interface SelectedEntity {
  id: string
  label: string
}

interface CuratedAsideAddFormProps {
  asideType: CuratedAsideType
  disabled?: boolean
  onAdd: (item: CuratedAsideItem) => void
}

export function CuratedAsideAddForm({
  asideType,
  disabled = false,
  onAdd,
}: CuratedAsideAddFormProps) {
  const t = useTranslations()
  const [selected, setSelected] = useState<SelectedEntity | null>(null)
  const [loading, setLoading] = useState(false)
  const [autocompleteKey, setAutocompleteKey] = useState(0)

  async function addSelected(entity = selected) {
    if (!entity || disabled || loading) return
    setLoading(true)
    try {
      const result = await adminCreateCuratedAside({
        aside_type: asideType,
        entity_id: entity.id,
      })
      onAdd(result.curated_aside_item)
      setSelected(null)
      setAutocompleteKey(key => key + 1)
    } catch (error) {
      onError(error, {
        fallback: t('extracted.curatedAsides.curatedAsideAddForm.failedToAddCuratedItem_9fa0533f'),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form
      className='mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]'
      data-pw='curated-aside-add-form'
      onSubmit={event => {
        event.preventDefault()
        void addSelected()
      }}
    >
      <CuratedAsideEntityAutocomplete
        key={`${asideType}-${autocompleteKey}`}
        asideType={asideType}
        disabled={disabled || loading}
        onSelect={item => {
          const next = { id: item.id, label: item.label }
          setSelected(next)
          void addSelected(next)
        }}
      />
      <Button
        type='submit'
        disabled={!selected || disabled || loading}
        loading={loading}
        data-pw='curated-aside-add-submit'
      >
        {t('extracted.curatedAsides.curatedAsideAddForm.add_9fd728c6')}
      </Button>
    </form>
  )
}
