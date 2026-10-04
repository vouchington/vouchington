'use client'

import { Input } from '@/components/ui/input'
import type { CopyrightNoticeTargetInput } from '@/lib/api/client/copyright-notices'
import type {
  CopyrightEmailApprovalDraft,
  CopyrightEmailApprovalTarget,
} from './copyright-email-approval-model'

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
  onChange: (draft: CopyrightEmailApprovalDraft) => void
  updateTarget: (
    id: string,
    key: 'post_id' | 'user_id' | 'user_profile_link_id' | 'topic_id' | 'community_id' | 'image_id',
    value: string,
  ) => void
  error: string | undefined
}

export function CopyrightEmailApprovalManualTargetFields({
  target,
  index,
  draft,
  onChange,
  updateTarget,
  error,
}: Props) {
  return (
    <>
      <p
        className='text-sm text-destructive'
        role='alert'
      >
        {error ?? 'We could not resolve this hosted URL.'} Enter verified IDs manually after
        checking the original email.
      </p>
      <label className='block text-sm'>
        Image surface
        <select
          aria-label={`Image surface ${index + 1}`}
          className='w-full rounded border bg-background p-2'
          value={target.surface}
          onChange={event =>
            onChange({
              ...draft,
              targets: draft.targets.map(item =>
                item.id === target.id
                  ? {
                      ...item,
                      surface: event.target.value as CopyrightNoticeTargetInput['surface'],
                      post_id: '',
                      user_id: undefined,
                      user_profile_link_id: undefined,
                      topic_id: undefined,
                      community_id: undefined,
                    }
                  : item,
              ),
            })
          }
        >
          {Object.entries(SURFACE_LABELS).map(([surface, label]) => (
            <option
              key={surface}
              value={surface}
            >
              {label}
            </option>
          ))}
        </select>
      </label>
      <Input
        aria-label={`${ownerLabel(target.surface)} ${index + 1}`}
        onChange={event => updateTarget(target.id, ownerKey(target.surface), event.target.value)}
        // ast-grep-ignore: web-no-id-text-input -- staff-only fallback after URL resolution fails; the backend verifies the live placement before approval.
        placeholder={`Resolved ${ownerLabel(target.surface)}`}
        value={target[ownerKey(target.surface)] ?? ''}
      />
      <Input
        aria-label={`Image ID ${index + 1}`}
        onChange={event => updateTarget(target.id, 'image_id', event.target.value)}
        // ast-grep-ignore: web-no-id-text-input -- staff-only fallback after URL resolution fails; the backend verifies the live placement before approval.
        placeholder='Resolved image ID'
        value={target.image_id}
      />
    </>
  )
}

function ownerKey(
  surface: CopyrightNoticeTargetInput['surface'],
): 'post_id' | 'user_id' | 'user_profile_link_id' | 'topic_id' | 'community_id' {
  if (surface === 'post-image') return 'post_id'
  if (surface === 'user-profile-image') return 'user_id'
  if (surface === 'user-profile-link-image') return 'user_profile_link_id'
  if (surface === 'topic-logo-image' || surface === 'topic-hero-image') return 'topic_id'
  return 'community_id'
}

function ownerLabel(surface: CopyrightNoticeTargetInput['surface']): string {
  if (surface === 'post-image') return 'Post ID'
  if (surface === 'user-profile-image') return 'User ID'
  if (surface === 'user-profile-link-image') return 'Profile link ID'
  if (surface === 'topic-logo-image' || surface === 'topic-hero-image') return 'Topic ID'
  return 'Community ID'
}
