'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ScopeCatalogEntry } from '@/types/scopes'
import type { ScopeResourceRow } from './scope-selection'

interface ScopePickerProps {
  idPrefix: string
  rows: ScopeResourceRow[]
  selected: readonly string[]
  onToggle: (scope: string, checked: boolean) => void
}

export function ScopePicker({ idPrefix, rows, selected, onToggle }: ScopePickerProps) {
  const t = useTranslations()
  return (
    <fieldset
      className='space-y-2'
      // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from the form's id prefix
      data-pw={`${idPrefix}-scope-picker`}
    >
      <legend className='text-sm font-medium'>
        {t('extracted.apiKeysManager.scopePicker.scopes_0d5644ff')}
      </legend>
      <ul className='divide-y rounded-md border'>
        {rows.map(row => {
          const resourceId = `${idPrefix}-${row.resource}`
          return (
            <li
              key={row.resource}
              className='flex flex-wrap items-center justify-between gap-2 px-3 py-2'
            >
              <span className='flex flex-wrap items-center gap-2 text-sm'>
                <code
                  id={resourceId}
                  className='font-mono text-xs'
                >
                  {row.resource}
                </code>
                {row.umbrella && (
                  <span className='text-xs text-muted-foreground'>
                    {t('extracted.apiKeysManager.scopePicker.fullMcpAccess_34c92c70')}
                  </span>
                )}
              </span>
              <span className='flex gap-4'>
                {[row.read, row.write].map(entry =>
                  entry ? (
                    <ScopeCheckbox
                      key={entry.scope}
                      entry={entry}
                      resourceId={resourceId}
                      checked={selected.includes(entry.scope)}
                      onToggle={onToggle}
                    />
                  ) : null,
                )}
              </span>
            </li>
          )
        })}
      </ul>
    </fieldset>
  )
}

function ScopeCheckbox({
  entry,
  resourceId,
  checked,
  onToggle,
}: {
  entry: ScopeCatalogEntry
  resourceId: string
  checked: boolean
  onToggle: (scope: string, checked: boolean) => void
}) {
  const t = useTranslations()
  const id = `${resourceId}-${entry.action}`
  return (
    <span className='flex min-h-11 items-center gap-2'>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={value => onToggle(entry.scope, value === true)}
        aria-labelledby={`${resourceId} ${id}-label`}
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from catalogue data
        data-pw={`scope-checkbox-${entry.scope}`}
      />
      <Label
        id={`${id}-label`}
        htmlFor={id}
        className='cursor-pointer font-normal'
      >
        {entry.action === 'read'
          ? t('extracted.apiKeysManager.scopePicker.read_9b9a8d05')
          : t('extracted.apiKeysManager.scopePicker.write_3f00927a')}
      </Label>
    </span>
  )
}
