'use client'

import * as React from 'react'
import { Search, X } from 'lucide-react'
import { TooltipButton } from '@/components/ui/_button-tooltip'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { FILTER_CONTROL_HEIGHT } from './filter-control-height'
import { useTranslations } from '@/lib/i18n/use-translations'

interface SearchInputShellProps {
  children: React.ReactNode
  className?: string
  'data-pw'?: string
}

/**
 * Bordered row with leading Search icon — wraps any input element.
 * Use this when you need the visual shell around a non-standard input (e.g. cmdk CommandInput).
 */
export function SearchInputShell({
  children,
  className,
  'data-pw': dataPw = 'search-input-shell',
}: SearchInputShellProps) {
  return (
    <div
      data-pw={dataPw}
      className={cn(
        'flex items-center rounded-md border bg-background px-3 shadow-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
        className,
      )}
    >
      <Search className='mr-2 h-4 w-4 shrink-0 opacity-50' />
      {children}
    </div>
  )
}

type SearchInputProps = Omit<React.ComponentProps<'input'>, 'type'> & {
  className?: string
  inputClassName?: string
  onClearValue?: () => void
  ref?: React.Ref<HTMLInputElement>
}

/**
 * Bordered search field with a leading Search icon.
 * Visually matches the /news CommandInput treatment.
 * Uses type="search" with CSS to suppress the WebKit native UA clear button.
 * Pass `value` and `onClearValue` together to render a custom X button.
 * autoComplete defaults to "off".
 */
export function SearchInput({
  className,
  inputClassName,
  autoComplete = 'off',
  value,
  onClearValue,
  ref,
  ...props
}: SearchInputProps) {
  const t = useTranslations()
  return (
    <SearchInputShell className={className}>
      <Input
        ref={ref}
        type='search'
        autoComplete={autoComplete}
        value={value}
        className={cn(
          FILTER_CONTROL_HEIGHT,
          'border-0 bg-transparent shadow-none focus-visible:ring-0 pl-0 [&::-webkit-search-cancel-button]:hidden',
          inputClassName,
        )}
        {...props}
      />
      {onClearValue && value ? (
        <TooltipButton
          type='button'
          variant='ghost'
          size='icon'
          aria-label={t('extracted.shared.searchInput.clearSearch_3b7ea517')}
          tooltip={t('extracted.shared.searchInput.clearSearch_3b7ea517')}
          onClick={onClearValue}
          data-pw='search-input-clear'
          className='ml-1 h-11 w-11 shrink-0 sm:h-6 sm:w-6'
        >
          <X className='h-4 w-4 opacity-50' />
        </TooltipButton>
      ) : null}
    </SearchInputShell>
  )
}
SearchInput.displayName = 'SearchInput'
