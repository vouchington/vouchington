'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CopyrightNoticeResolvedTarget } from '@/lib/api/client/copyright-notice-targets'
import {
  MAX_EMAIL_APPROVAL_TARGETS,
  CopyrightEmailApprovalDraft,
  CopyrightEmailApprovalTarget,
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
                image_id: '',
                resolution_status: 'pending',
              },
            ]
          : []
      }),
    })
  }

  function updateTarget(id: string, key: 'post_id' | 'image_id', value: string) {
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
    const existing = selected.find(item => item.image_id === choice.image_id)
    if (checked && !existing) {
      const placeholder = selected.find(item => !item.image_id)
      if (!placeholder && draft.targets.length >= MAX_EMAIL_APPROVAL_TARGETS) return
      onChange({
        ...draft,
        targets: placeholder
          ? draft.targets.map(item =>
              item.id === placeholder.id
                ? { ...item, ...approvalTarget(choice), resolution_status: 'resolved' }
                : item,
            )
          : [
              ...draft.targets,
              {
                id: crypto.randomUUID(),
                group_id: target.group_id,
                ...approvalTarget(choice),
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
                  ? { ...item, post_id: '', image_id: '', resolution_status: 'resolved' }
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
              item => item.group_id === target.group_id && item.image_id === choice.image_id,
            )}
            choice={choice}
            index={imageIndex}
            key={choice.image_id}
            disabled={
              !draft.targets.some(
                item => item.group_id === target.group_id && item.image_id === choice.image_id,
              ) &&
              !draft.targets.some(item => item.group_id === target.group_id && !item.image_id) &&
              draft.targets.length >= MAX_EMAIL_APPROVAL_TARGETS
            }
            onCheckedChange={checked => toggle(target, choice, checked)}
            targetId={target.id}
          />
        ))}
      {target.resolution_status === 'failed' && (
        <>
          <p
            className='text-sm text-destructive'
            role='alert'
          >
            {errors[target.id] ?? 'We could not resolve this hosted URL.'} Enter verified IDs
            manually after checking the original email.
          </p>
          <Input
            aria-label={`Post ID ${index + 1}`}
            onChange={event => updateTarget(target.id, 'post_id', event.target.value)}
            placeholder='Resolved post ID'
            value={target.post_id}
          />
          <Input
            aria-label={`Image ID ${index + 1}`}
            onChange={event => updateTarget(target.id, 'image_id', event.target.value)}
            placeholder='Resolved image ID'
            value={target.image_id}
          />
        </>
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

function approvalTarget(choice: CopyrightNoticeResolvedTarget) {
  return {
    post_id: choice.post_id,
    image_id: choice.image_id,
    target_url: choice.target_url,
  }
}

function uniqueTargetGroups(targets: CopyrightEmailApprovalTarget[]) {
  return targets.filter(
    (target, index) => targets.findIndex(item => sameTargetGroup(item, target)) === index,
  )
}
function sameTargetGroup(left: CopyrightEmailApprovalTarget, right: CopyrightEmailApprovalTarget) {
  return left.group_id === right.group_id
}
