'use client'

import type { Dispatch, SetStateAction } from 'react'

import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { CopyrightNoticeTargetInput } from '@/lib/api/client/copyright-notices'
import { CopyrightNoticeTargetPicker } from './copyright-notice-target-picker'
import type {
  CopyrightEmailApprovalDraft,
  CopyrightEmailApprovalTarget,
} from './copyright-email-approval-model'
import { CopyrightEmailApprovalOwnerPicker } from './copyright-email-approval-owner-picker'
import { useCopyrightEmailApprovalOwnerSelection } from './copyright-email-approval-owner-selection'

const SURFACE_LABELS: Record<CopyrightNoticeTargetInput['surface'], string> = {
  'post-image': 'Post image',
  'user-profile-image': 'Profile image',
  'user-profile-link-image': 'Profile link image',
  'topic-logo-image': 'Topic logo',
  'topic-hero-image': 'Topic hero image',
  'community-profile-image': 'Community profile image',
  'community-banner-image': 'Community banner image',
}

type Props = {
  target: CopyrightEmailApprovalTarget
  index: number
  draft: CopyrightEmailApprovalDraft
  onChange: Dispatch<SetStateAction<CopyrightEmailApprovalDraft>>
  error: string | undefined
}

export function CopyrightEmailApprovalManualTargetFields({
  target,
  index,
  onChange,
  error,
}: Props) {
  const {
    ownerLabel,
    ownerUrl,
    choices,
    selectOwner,
    selectPost,
    selectTopic,
    selectUser,
    clearOwner,
    selectImage,
    resetSurface,
  } = useCopyrightEmailApprovalOwnerSelection(target, onChange)

  return (
    <div className='space-y-3'>
      <p
        className='text-sm text-destructive'
        role='alert'
      >
        {error ?? 'We could not resolve this hosted URL.'} Find the owner and select a verified
        hosted image.
      </p>
      <div className='space-y-1'>
        <Label htmlFor={`copyright-email-surface-${index}`}>Image surface</Label>
        <Select
          value={target.surface}
          onValueChange={value => resetSurface(value as CopyrightNoticeTargetInput['surface'])}
        >
          <SelectTrigger
            aria-label={`Image surface ${index + 1}`}
            id={`copyright-email-surface-${index}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(SURFACE_LABELS).map(([surface, label]) => (
              <SelectItem
                key={surface}
                value={surface}
              >
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {ownerLabel ? (
        <div className='flex items-center gap-2'>
          <p className='text-sm text-muted-foreground'>Selected {ownerLabel}</p>
          <Button
            type='button'
            variant='outline'
            onClick={clearOwner}
          >
            Choose different owner
          </Button>
        </div>
      ) : (
        <CopyrightEmailApprovalOwnerPicker
          target={target}
          onPost={selectPost}
          onTopic={selectTopic}
          onUser={selectUser}
          onOwner={selectOwner}
        />
      )}
      {ownerUrl && (
        <CopyrightNoticeTargetPicker
          key={`${target.id}:${target.surface}:${ownerUrl}`}
          legend='Select the hosted image'
          initialUrl={ownerUrl}
          lockUrl
          surface={target.surface}
          targets={choices}
          onChange={selectImage}
        />
      )}
    </div>
  )
}
