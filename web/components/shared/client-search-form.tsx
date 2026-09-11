'use client'

import { Suspense, useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { SearchInput } from '@/components/shared/search-input'
import { cn } from '@/lib/utils'
import { FILTER_CONTROL_HEIGHT } from './filter-control-height'
import { useTranslations } from '@/lib/i18n/use-translations'

interface ClientSearchFormProps {
  searchParamName: string
  defaultValue?: string
  placeholder: string
  label: string
  buttonLabel?: string
  className?: string
  inputClassName?: string
}

export function ClientSearchForm(props: ClientSearchFormProps) {
  return (
    <Suspense fallback={null}>
      <ClientSearchFormContent {...props} />
    </Suspense>
  )
}

function ClientSearchFormContent({
  searchParamName,
  defaultValue,
  placeholder,
  label,
  buttonLabel,
  className,
  inputClassName,
}: ClientSearchFormProps) {
  const t = useTranslations()
  const resolvedButtonLabel = buttonLabel ?? t('extracted.shared.clientSearchForm.search_49c266ba')
  const inputId = useId()
  const router = useRouter()
  const [searchQuery, setSearchQuery] = useState(defaultValue ?? '')

  useEffect(() => {
    queueMicrotask(() => setSearchQuery(defaultValue ?? ''))
  }, [defaultValue])

  return (
    <form
      onSubmit={event => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        const query = String(formData.get(searchParamName) ?? '').trim()
        const params = new URLSearchParams(window.location.search)
        if (query) {
          params.set(searchParamName, query)
        } else {
          params.delete(searchParamName)
        }
        params.delete('after')
        const qs = params.toString()
        router.push(qs ? `${window.location.pathname}?${qs}` : window.location.pathname, {
          scroll: false,
        })
      }}
      className={cn('flex gap-4', className)}
    >
      <Label
        htmlFor={inputId}
        className='sr-only'
      >
        {label}
      </Label>
      <SearchInput
        id={inputId}
        name={searchParamName}
        placeholder={placeholder}
        value={searchQuery}
        onChange={event => setSearchQuery(event.target.value)}
        className={cn('flex-1', inputClassName)}
        aria-label={label}
        data-pw='client-search-input'
      />
      <Button
        type='submit'
        data-pw='client-search-submit'
        className={cn(FILTER_CONTROL_HEIGHT)}
      >
        {resolvedButtonLabel}
      </Button>
    </form>
  )
}
