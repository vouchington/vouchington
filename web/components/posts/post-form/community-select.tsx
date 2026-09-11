'use client'

import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CommunityPostOption } from './types'
import { useTranslations } from '@/lib/i18n/use-translations'

interface CommunitySelectProps {
  communities: CommunityPostOption[]
  value: string
  onValueChange: (value: string) => void
}

const GLOBAL_VALUE = '__global__'

export function CommunitySelect({ communities, value, onValueChange }: CommunitySelectProps) {
  const t = useTranslations()
  if (communities.length === 0) return null

  return (
    <div className='space-y-2'>
      <Label htmlFor='post-community'>
        {t('extracted.postForm.communitySelect.community_bb501d78')}
      </Label>
      <Select
        value={value || GLOBAL_VALUE}
        onValueChange={nextValue => onValueChange(nextValue === GLOBAL_VALUE ? '' : nextValue)}
      >
        <SelectTrigger id='post-community'>
          <SelectValue
            placeholder={t('extracted.postForm.communitySelect.selectCommunity_9c425b58')}
          />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={GLOBAL_VALUE}>
            {t('extracted.postForm.communitySelect.global_a258b30f')}
          </SelectItem>
          {communities.map(community => (
            <SelectItem
              key={community.id}
              value={community.slug}
            >
              {community.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
