'use client'

import { useEffect, useState } from 'react'
import {
  resolveCopyrightNoticeTargets,
  type CopyrightNoticeResolvedTarget,
} from '@/lib/api/client/copyright-notice-targets'
import type {
  CopyrightEmailApprovalDraft,
  CopyrightEmailApprovalTarget,
} from './copyright-email-approval-model'

export function useCopyrightEmailApprovalTargetResolution(
  draft: CopyrightEmailApprovalDraft,
  onChange: (draft: CopyrightEmailApprovalDraft) => void,
) {
  const [resolved, setResolved] = useState<Record<string, CopyrightNoticeResolvedTarget[]>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  useEffect(() => {
    const pending = draft.targets.filter(
      target => target.resolution_status === 'pending' && target.target_url.trim(),
    )
    if (pending.length === 0) return
    let current = true
    void Promise.all(pending.map(resolveTarget)).then(results => {
      if (!current) return
      const failed = new Map(results.filter(isFailure))
      setResolved(previous => ({ ...previous, ...Object.fromEntries(results.filter(isResolved)) }))
      setErrors(previous => ({ ...previous, ...Object.fromEntries(failed) }))
      onChange({
        ...draft,
        targets: draft.targets.map(target =>
          results.some(([id]) => id === target.id)
            ? { ...target, resolution_status: failed.has(target.id) ? 'failed' : 'resolved' }
            : target,
        ),
      })
    })
    return () => {
      current = false
    }
  }, [draft, onChange])
  return { errors, resolved }
}

async function resolveTarget(target: CopyrightEmailApprovalTarget) {
  try {
    return [target.id, await resolveCopyrightNoticeTargets(target.target_url.trim())] as const
  } catch (error) {
    return [
      target.id,
      error instanceof Error ? error.message : 'Unable to resolve this URL.',
    ] as const
  }
}

function isFailure(
  result: readonly [string, CopyrightNoticeResolvedTarget[] | string],
): result is readonly [string, string] {
  return typeof result[1] === 'string'
}

function isResolved(
  result: readonly [string, CopyrightNoticeResolvedTarget[] | string],
): result is readonly [string, CopyrightNoticeResolvedTarget[]] {
  return Array.isArray(result[1])
}
