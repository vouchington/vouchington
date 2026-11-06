'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { ScopeCatalogEntry } from '@/types/scopes'
import type { ScopeResourceGroup, ScopeResourceRow } from './scope-selection'
import { scopeDescriptionMessageKey } from './scope-description'
import { scopeAudienceLabelKey } from './scope-audience-label'

const OWN_PRIVATE_POST_RELATIONS_WRITE_SCOPE = 'post-relations.owned-private:write'

interface ScopePickerProps {
  idPrefix: string
  groups: ScopeResourceGroup[]
  selected: readonly string[]
  onToggle: (scope: string, checked: boolean) => void
}

export function ScopePicker({ idPrefix, groups, selected, onToggle }: ScopePickerProps) {
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
      {groups.map(group => (
        <section
          key={group.audience}
          aria-label={t(scopeAudienceLabelKey(group.audience))}
        >
          <h3 className='mb-2 text-sm font-medium'>{t(scopeAudienceLabelKey(group.audience))}</h3>
          <ul className='divide-y rounded-md border'>
            {group.rows.map(row => (
              <ScopeResourceListRow
                key={row.resource}
                idPrefix={idPrefix}
                row={row}
                selected={selected}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </section>
      ))}
    </fieldset>
  )
}

function ScopeResourceListRow({
  idPrefix,
  row,
  selected,
  onToggle,
}: {
  idPrefix: string
  row: ScopeResourceRow
  selected: readonly string[]
  onToggle: (scope: string, checked: boolean) => void
}) {
  const t = useTranslations()
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
        {row.umbrella && row.descriptionKey && (
          <span className='text-xs text-muted-foreground'>
            {t(scopeDescriptionMessageKey(row.descriptionKey))}
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
      {row.write?.scope === OWN_PRIVATE_POST_RELATIONS_WRITE_SCOPE && (
        <p
          className='basis-full text-sm text-muted-foreground'
          data-pw='scope-private-post-relations-permission'
        >
          {t('extracted.apiKeysManager.scopePicker.allowOwnPrivatePostRelationsAndTags_1c840aa0')}
        </p>
      )}
    </li>
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
  const descriptionId = `${id}-description`
  const description =
    entry.description_key && !entry.resource.startsWith('mcp.')
      ? t(scopeDescriptionMessageKey(entry.description_key))
      : null
  return (
    <Label
      id={`${id}-target`}
      htmlFor={id}
      className='flex min-h-11 cursor-pointer flex-wrap items-center gap-2 font-normal'
    >
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={value => onToggle(entry.scope, value === true)}
        aria-labelledby={`${resourceId} ${id}-label`}
        aria-describedby={description ? descriptionId : undefined}
        // oxlint-disable-next-line no-mistakes/playwright-literals -- dynamic identifier from catalogue data
        data-pw={`scope-checkbox-${entry.scope}`}
      />
      <span id={`${id}-label`}>
        {entry.action === 'read'
          ? t('extracted.apiKeysManager.scopePicker.read_9b9a8d05')
          : t('extracted.apiKeysManager.scopePicker.write_3f00927a')}
      </span>
      {description ? (
        <span
          id={descriptionId}
          className='text-xs leading-normal text-muted-foreground'
        >
          {description}
        </span>
      ) : null}
    </Label>
  )
}
