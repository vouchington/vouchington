import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { DeclarationCheckbox } from './copyright-form-fields'

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
      <div className='space-y-1'>
        <Label htmlFor='copyright-hold-proceeding-kind'>Proceeding</Label>
        <Select
          onValueChange={value => setProceedingKind(value as LegalHoldProceedingKind)}
          value={proceedingKind}
        >
          <SelectTrigger id='copyright-hold-proceeding-kind'>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value='none'>No qualifying proceeding</SelectItem>
            <SelectItem value='federal_court'>Federal court</SelectItem>
            <SelectItem value='ccb'>Copyright Claims Board</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {proceedingKind === 'ccb' && (
        <div className='space-y-1'>
          <Label htmlFor='copyright-hold-ccb-claim-kind'>CCB filing kind</Label>
          <Select
            onValueChange={value => setCcbClaimKind(value as typeof ccbClaimKind)}
            value={ccbClaimKind}
          >
            <SelectTrigger id='copyright-hold-ccb-claim-kind'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='claim'>Claim</SelectItem>
              <SelectItem value='counterclaim'>Counterclaim</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      <DeclarationCheckbox
        checked={fromOriginalClaimant}
        id='copyright-hold-original-claimant'
        onCheckedChange={checked => setFromOriginalClaimant(checked === true)}
      >
        Filing came from the original claimant
      </DeclarationCheckbox>
      <DeclarationCheckbox
        checked={sameMaterial}
        id='copyright-hold-same-material'
        onCheckedChange={checked => setSameMaterial(checked === true)}
      >
        Filing covers the same material
      </DeclarationCheckbox>
      {proceedingKind !== 'none' && (
        <>
          <LegalHoldDateInput
            id='copyright-hold-commenced-at'
            label='Proceeding commenced'
            onChange={setCommencedAt}
            value={commencedAt}
          />
          <LegalHoldDateInput
            id='copyright-hold-received-at'
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
          <div
            className='flex items-center gap-2 text-sm'
            key={target.id}
          >
            <Checkbox
              id={id}
              checked={selectedTargetIds.includes(target.id)}
              onCheckedChange={checked =>
                setSelectedTargetIds(current =>
                  checked === true
                    ? [...current, target.id]
                    : current.filter(targetId => targetId !== target.id),
                )
              }
            />
            <Label
              htmlFor={id}
              id={`${id}-label`}
            >
              Target {index + 1}: {target.hosted_use_url}
            </Label>
          </div>
        )
      })}
    </fieldset>
  )
}

function LegalHoldDateInput({
  id,
  label,
  onChange,
  value,
}: {
  id: string
  label: string
  onChange: (value: string) => void
  value: string
}) {
  return (
    <div className='space-y-1'>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type='datetime-local'
        value={value}
        onChange={event => onChange(event.target.value)}
      />
    </div>
  )
}
