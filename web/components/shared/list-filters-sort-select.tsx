'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTranslations } from '@/lib/i18n/use-translations'
import { FILTER_CONTROL_HEIGHT } from './filter-control-height'
import { DataPw } from '@/components/shared/data-pw'

interface SortOption<T extends string = string> {
  label: string
  value: T
  description?: string
}

interface ListFiltersSortSelectProps<T extends string = string> {
  value: T
  options: SortOption<T>[]
  onValueChange: (value: T) => void
}

export function ListFiltersSortSelect<T extends string = string>({
  value,
  options,
  onValueChange,
}: ListFiltersSortSelectProps<T>) {
  const t = useTranslations()

  return (
    <Select
      value={value}
      onValueChange={v => onValueChange(v as T)}
    >
      <SelectTrigger
        aria-label={t('extracted.shared.listFilters.sortList_8d6c012f')}
        data-pw='list-filters-sort-trigger'
        className={`w-40 ${FILTER_CONTROL_HEIGHT}`}
      >
        <SelectValue placeholder={t('extracted.shared.listFilters.sort_bec69036')} />
      </SelectTrigger>
      <SelectContent>
        {options.map(option => (
          <DataPw
            key={option.value}
            dataPw={`list-filters-sort-option-${option.value}`}
            as={SelectItem}
            value={option.value}
            title={option.description}
          >
            {option.label}
          </DataPw>
        ))}
      </SelectContent>
    </Select>
  )
}
