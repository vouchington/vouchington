'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  copyrightNoticeTargetKey,
  type CopyrightNoticeResolvedTarget,
} from '@/lib/api/client/copyright-notice-targets'
import { CopyrightEmailApprovalManualTargetFields } from './copyright-email-approval-manual-target-fields'
import {
  MAX_EMAIL_APPROVAL_TARGETS,
  CopyrightEmailApprovalDraft,
  CopyrightEmailApprovalTarget,
  copyrightEmailApprovalTargetKey,
  approvalTargetFields,
} from './copyright-email-approval-model'
import { useCopyrightEmailApprovalTargetResolution } from './copyright-email-approval-target-resolution'
import { CopyrightEmailApprovalTargetChoice } from './copyright-email-approval-target-choice'

export function CopyrightEmailApprovalTargetFields({
  draft,
  onChange,
}: {
  draft: CopyrightEmailApprovalDraft
  onChange: (draft: CopyrightEmailApprovalDraft) => void
}) {
  const { errors, resolved } = useCopyrightEmailApprovalTargetResolution(draft, onChange)
  const groups = uniqueTargetGroups(draft.targets)

  function updateUrl(target: CopyrightEmailApprovalTarget, value: string) {
    onChange({
      ...draft,
      targets: draft.targets.flatMap(item => {
        if (!sameTargetGroup(item, target)) return [item]
        return item.id === target.id
          ? [
              {
                ...item,
                target_url: value,
                post_id: '',
                user_id: undefined,
                user_profile_link_id: undefined,
                topic_id: undefined,
                community_id: undefined,
                image_id: '',
                resolution_status: 'pending',
              },
            ]
          : []
      }),
    })
  }

  function updateTarget(
    id: string,
    key: 'post_id' | 'user_id' | 'user_profile_link_id' | 'topic_id' | 'community_id' | 'image_id',
    value: string,
  ) {
    onChange({
      ...draft,
      targets: draft.targets.map(target =>
        target.id === id ? { ...target, [key]: value } : target,
      ),
    })
  }

  function toggle(
    target: CopyrightEmailApprovalTarget,
    choice: CopyrightNoticeResolvedTarget,
    checked: boolean,
  ) {
    const selected = draft.targets.filter(item => sameTargetGroup(item, target))
    const existing = selected.find(
      item => copyrightEmailApprovalTargetKey(item) === copyrightNoticeTargetKey(choice),
    )
    if (checked && !existing) {
      const placeholder = selected.find(item => !item.image_id)
      if (!placeholder && draft.targets.length >= MAX_EMAIL_APPROVAL_TARGETS) return
      onChange({
        ...draft,
        targets: placeholder
          ? draft.targets.map(item =>
              item.id === placeholder.id
                ? { ...item, ...approvalTargetFields(choice), resolution_status: 'resolved' }
                : item,
            )
          : [
              ...draft.targets,
              {
                id: crypto.randomUUID(),
                group_id: target.group_id,
                ...approvalTargetFields(choice),
                resolution_status: 'resolved',
              },
            ],
      })
    }
    if (!checked && existing) {
      onChange({
        ...draft,
        targets:
          selected.length === 1
            ? draft.targets.map(item =>
                item.id === existing.id
                  ? {
                      ...item,
                      post_id: '',
                      user_id: undefined,
                      user_profile_link_id: undefined,
                      topic_id: undefined,
                      community_id: undefined,
                      image_id: '',
                      resolution_status: 'resolved',
                    }
                  : item,
              )
            : draft.targets.filter(item => item.id !== existing.id),
      })
    }
  }

  return groups.map((target, index) => (
    <div
      className='space-y-2 rounded border p-3'
      key={target.id}
    >
      <p className='text-sm font-medium'>Hosted material {index + 1}</p>
      <Input
        aria-label={`Hosted use URL ${index + 1}`}
        onChange={event => updateUrl(target, event.target.value)}
        placeholder='Hosted use URL'
        value={target.target_url}
      />
      {target.resolution_status === 'pending' && target.target_url.trim() && (
        <p className='text-sm text-muted-foreground'>Finding hosted material…</p>
      )}
      {target.resolution_status === 'resolved' &&
        resolved[target.id]?.map((choice, imageIndex) => (
          <CopyrightEmailApprovalTargetChoice
            checked={draft.targets.some(
              item =>
                item.group_id === target.group_id &&
                copyrightEmailApprovalTargetKey(item) === copyrightNoticeTargetKey(choice),
            )}
            choice={choice}
            index={imageIndex}
            key={copyrightNoticeTargetKey(choice)}
            disabled={
              !draft.targets.some(
                item =>
                  item.group_id === target.group_id &&
                  copyrightEmailApprovalTargetKey(item) === copyrightNoticeTargetKey(choice),
              ) &&
              !draft.targets.some(item => item.group_id === target.group_id && !item.image_id) &&
              draft.targets.length >= MAX_EMAIL_APPROVAL_TARGETS
            }
            onCheckedChange={checked => toggle(target, choice, checked)}
            targetId={target.id}
          />
        ))}
      {target.resolution_status === 'failed' && (
        <CopyrightEmailApprovalManualTargetFields
          target={target}
          index={index}
          draft={draft}
          onChange={onChange}
          updateTarget={updateTarget}
          error={errors[target.id]}
        />
      )}
      {groups.length > 1 && (
        <Button
          onClick={() =>
            onChange({
              ...draft,
              targets: draft.targets.filter(item => !sameTargetGroup(item, target)),
            })
          }
          type='button'
          variant='outline'
        >
          Remove hosted image
        </Button>
      )}
    </div>
  ))
}

function uniqueTargetGroups(targets: CopyrightEmailApprovalTarget[]) {
  return targets.filter(
    (target, index) => targets.findIndex(item => sameTargetGroup(item, target)) === index,
  )
}
function sameTargetGroup(left: CopyrightEmailApprovalTarget, right: CopyrightEmailApprovalTarget) {
  return left.group_id === right.group_id
}
