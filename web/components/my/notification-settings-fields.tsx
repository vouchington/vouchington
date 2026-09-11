/* oxlint-disable no-mistakes/playwright-literals -- Digest selectors derive stable values from a local discriminated union. */
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'

export function DigestFrequencyField({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: 'news_digest_frequency' | 'community_digest_frequency'
  label: string
  value: 'none' | 'daily' | 'weekly'
  disabled: boolean
  onChange: (value: 'none' | 'daily' | 'weekly') => void
}) {
  return (
    <div className='space-y-2'>
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={value}
        disabled={disabled}
        onValueChange={next => onChange(next as typeof value)}
      >
        <SelectTrigger
          id={id}
          data-pw={`${id}-select`}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value='none'>Off</SelectItem>
          <SelectItem value='daily'>Daily</SelectItem>
          <SelectItem value='weekly'>Weekly</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

export function EngagementEmailsSwitchRow({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean
  disabled: boolean
  onCheckedChange: (enabled: boolean) => void
}) {
  return (
    <div className='flex items-start gap-4'>
      <Switch
        id='engagement_emails_enabled'
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        data-pw='engagement-emails-toggle'
      />
      <div className='space-y-1'>
        <Label htmlFor='engagement_emails_enabled'>Engagement emails</Label>
        <p className='text-sm text-muted-foreground'>
          Topic, referral link, and news source recommendations.
        </p>
      </div>
    </div>
  )
}

export function ModerationEmailsSwitchRow({
  checked,
  disabled,
  onCheckedChange,
}: {
  checked: boolean
  disabled: boolean
  onCheckedChange: (enabled: boolean) => void
}) {
  return (
    <div className='flex items-start gap-4'>
      <Switch
        id='moderation_emails_enabled'
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        data-pw='moderation-emails-toggle'
      />
      <div className='space-y-1'>
        <Label htmlFor='moderation_emails_enabled'>Community moderation summary</Label>
        <p className='text-sm text-muted-foreground'>
          A table of moderation queue counts for communities you moderate.
        </p>
      </div>
    </div>
  )
}
