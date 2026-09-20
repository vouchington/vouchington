import { Checkbox } from '@/components/ui/checkbox'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'

export type LegalHoldProceedingKind = 'none' | 'federal_court' | 'ccb'

export function CopyrightStaffProceedingFields({
  ccbClaimKind,
  commencedAt,
  fromOriginalClaimant,
  proceedingKind,
  receivedAt,
  sameMaterial,
  setCcbClaimKind,
  setCommencedAt,
  setFromOriginalClaimant,
  setProceedingKind,
  setReceivedAt,
  setSameMaterial,
}: {
  ccbClaimKind: 'claim' | 'counterclaim'
  commencedAt: string
  fromOriginalClaimant: boolean
  proceedingKind: LegalHoldProceedingKind
  receivedAt: string
  sameMaterial: boolean
  setCcbClaimKind: (value: 'claim' | 'counterclaim') => void
  setCommencedAt: (value: string) => void
  setFromOriginalClaimant: (value: boolean) => void
  setProceedingKind: (value: LegalHoldProceedingKind) => void
  setReceivedAt: (value: string) => void
  setSameMaterial: (value: boolean) => void
}) {
  return (
    <>
      <label className='block text-sm'>
        Proceeding
        <select
          className='ml-2 rounded border bg-background p-1'
          value={proceedingKind}
          onChange={event => setProceedingKind(event.target.value as LegalHoldProceedingKind)}
        >
          <option value='none'>No qualifying proceeding</option>
          <option value='federal_court'>Federal court</option>
          <option value='ccb'>Copyright Claims Board</option>
        </select>
      </label>
      {proceedingKind === 'ccb' && (
        <label className='block text-sm'>
          CCB filing kind
          <select
            className='ml-2 rounded border bg-background p-1'
            value={ccbClaimKind}
            onChange={event => setCcbClaimKind(event.target.value as typeof ccbClaimKind)}
          >
            <option value='claim'>Claim</option>
            <option value='counterclaim'>Counterclaim</option>
          </select>
        </label>
      )}
      <LegalHoldCheckbox
        checked={fromOriginalClaimant}
        onChange={setFromOriginalClaimant}
      >
        Filing came from the original claimant
      </LegalHoldCheckbox>
      <LegalHoldCheckbox
        checked={sameMaterial}
        onChange={setSameMaterial}
      >
        Filing covers the same material
      </LegalHoldCheckbox>
      {proceedingKind !== 'none' && (
        <>
          <LegalHoldDateInput
            label='Proceeding commenced'
            onChange={setCommencedAt}
            value={commencedAt}
          />
          <LegalHoldDateInput
            label='Designated agent received proof'
            onChange={setReceivedAt}
            value={receivedAt}
          />
        </>
      )}
    </>
  )
}

export function CopyrightStaffLegalHoldTargetSelector({
  holdId,
  selectedTargetIds,
  setSelectedTargetIds,
  targets,
}: {
  holdId: string
  selectedTargetIds: string[]
  setSelectedTargetIds: React.Dispatch<React.SetStateAction<string[]>>
  targets: CopyrightStaffQueueItem['targets']
}) {
  return (
    <fieldset className='space-y-2'>
      <legend className='text-sm font-medium'>Material covered by this filing</legend>
      {targets.map((target, index) => {
        const id = `copyright-hold-${holdId}-${target.id}`
        return (
          <label
            className='flex items-center gap-2 text-sm'
            htmlFor={id}
            key={target.id}
          >
            <Checkbox
              id={id}
              aria-label={`Legal hold target ${index + 1}`}
              checked={selectedTargetIds.includes(target.id)}
              onCheckedChange={checked =>
                setSelectedTargetIds(current =>
                  checked === true
                    ? [...current, target.id]
                    : current.filter(targetId => targetId !== target.id),
                )
              }
            />
            Target {index + 1}: {target.hosted_use_url}
          </label>
        )
      })}
    </fieldset>
  )
}

function LegalHoldCheckbox({
  checked,
  children,
  onChange,
}: {
  checked: boolean
  children: React.ReactNode
  onChange: (value: boolean) => void
}) {
  return (
    <label className='block text-sm'>
      <input
        type='checkbox'
        checked={checked}
        onChange={event => onChange(event.target.checked)}
      />{' '}
      {children}
    </label>
  )
}

function LegalHoldDateInput({
  label,
  onChange,
  value,
}: {
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <label className='block text-sm'>
      {label}
      <input
        className='ml-2 rounded border bg-background p-1'
        type='datetime-local'
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  )
}
