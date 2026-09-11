'use client'

import { ShieldAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type { CommunityRestrictionType } from '@/types/api-responses'
import {
  DURATION_OPTIONS,
  RESTRICTION_OPTIONS,
  type DurationValue,
  type RaidModeState,
} from './community-raid-mode-state'
import { useTranslations } from '@/lib/i18n/use-translations'

interface Props {
  state: RaidModeState
  isBusy: boolean
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
  onToggle: (type: CommunityRestrictionType, checked: boolean) => void
  onDurationChange: (duration: DurationValue) => void
  onReasonChange: (reason: string) => void
}

export function CommunityRaidModeForm({
  state,
  isBusy,
  onSubmit,
  onToggle,
  onDurationChange,
  onReasonChange,
}: Props) {
  const t = useTranslations()
  return (
    <form
      onSubmit={onSubmit}
      className='space-y-4 rounded-md border p-4'
    >
      <div className='grid gap-3 sm:grid-cols-2'>
        {RESTRICTION_OPTIONS.map(option => (
          <div
            key={option.type}
            className='flex items-center gap-2'
          >
            <Checkbox
              id={`raid-mode-${option.type}`}
              checked={state.selectedTypes.has(option.type)}
              onCheckedChange={(checked: boolean | 'indeterminate') =>
                onToggle(option.type, checked === true)
              }
            />
            <Label
              htmlFor={`raid-mode-${option.type}`}
              className='cursor-pointer font-normal'
            >
              {option.label}
            </Label>
          </div>
        ))}
      </div>

      <div className='grid gap-3 sm:grid-cols-[14rem_1fr]'>
        <div className='space-y-2'>
          <Label htmlFor='raid-mode-duration'>
            {t('extracted.communities.communityRaidModeForm.duration_4fc52a3c')}
          </Label>
          <Select
            value={state.duration}
            onValueChange={value => onDurationChange(value as DurationValue)}
          >
            <SelectTrigger id='raid-mode-duration'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DURATION_OPTIONS.map(option => (
                <SelectItem
                  key={option.value}
                  value={option.value}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-2'>
          <Label htmlFor='raid-mode-reason'>
            {t('extracted.communities.communityRaidModeForm.reason_f81ab834')}
          </Label>
          <Textarea
            id='raid-mode-reason'
            data-pw='community-raid-mode-reason'
            value={state.reason}
            onChange={event => onReasonChange(event.target.value)}
            maxLength={1000}
            rows={2}
            placeholder={t(
              'extracted.communities.communityRaidModeForm.optionalReasonForActivatingRaidMode_38fa6ffb',
            )}
          />
        </div>
      </div>

      <Button
        type='submit'
        size='sm'
        loading={isBusy}
        disabled={isBusy || state.selectedTypes.size === 0}
        data-pw='community-raid-mode-activate'
      >
        <ShieldAlert className='mr-2 h-4 w-4' />
        {t('extracted.communities.communityRaidModeForm.activate_24433c70')}
      </Button>
    </form>
  )
}
