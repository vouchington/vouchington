'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { LabeledInput } from './copyright-form-fields'
import {
  resolveCopyrightNoticeTargets,
  type CopyrightNoticeResolvedTarget,
} from '@/lib/api/client/copyright-notice-targets'
import onError from '@/lib/on-error'

const MAX_NOTICE_TARGETS = 20

export function CopyrightNoticeTargetPicker({
  targets,
  onChange,
}: {
  targets: CopyrightNoticeResolvedTarget[]
  onChange: (targets: CopyrightNoticeResolvedTarget[]) => void
}) {
  const [targetUrl, setTargetUrl] = useState('')
  const [resolvedTargets, setResolvedTargets] = useState<CopyrightNoticeResolvedTarget[]>([])
  const [resolving, setResolving] = useState(false)
  const resolutionRequest = useRef(0)

  async function resolve() {
    if (!targetUrl.trim() || resolving) return
    const request = ++resolutionRequest.current
    const requestedUrl = targetUrl.trim()
    setResolving(true)
    try {
      const resolved = await resolveCopyrightNoticeTargets(requestedUrl)
      if (request !== resolutionRequest.current) return
      setResolvedTargets(resolved)
      onChange([])
    } catch (error) {
      if (request !== resolutionRequest.current) return
      onError(error, {
        fallback: 'We could not find hosted material at that URL. Check the link and try again.',
        tags: { form: 'copyright-notice-target' },
      })
      setResolvedTargets([])
      onChange([])
    } finally {
      if (request === resolutionRequest.current) setResolving(false)
    }
  }

  function updateUrl(value: string) {
    resolutionRequest.current++
    setTargetUrl(value)
    setResolvedTargets([])
    setResolving(false)
    onChange([])
  }

  function toggle(target: CopyrightNoticeResolvedTarget, checked: boolean) {
    if (checked && targets.length >= MAX_NOTICE_TARGETS) return
    onChange(
      checked
        ? [...targets, target]
        : targets.filter(selected => selected.image_id !== target.image_id),
    )
  }

  return (
    <fieldset className='space-y-3 rounded border p-3'>
      <legend className='px-1 text-sm font-medium'>Hosted material</legend>
      <p className='text-sm text-muted-foreground'>
        Paste the URL of the Voucha post, then select each image that uses your work.
      </p>
      <div className='flex gap-2'>
        <div className='flex-1'>
          <LabeledInput
            id='copyright-target-url'
            label='Hosted use URL'
            type='url'
            value={targetUrl}
            onChange={event => updateUrl(event.target.value)}
            required
          />
        </div>
        <Button
          className='mt-6'
          type='button'
          disabled={!targetUrl.trim() || resolving}
          onClick={resolve}
        >
          {resolving ? 'Finding material…' : 'Find hosted material'}
        </Button>
      </div>
      {resolvedTargets.length > 0 && (
        <div className='space-y-2'>
          {resolvedTargets.map((target, index) => {
            const id = `copyright-notice-target-${target.image_id}`
            const label = target.caption.trim() || `Image ${target.order_index + 1}`
            return (
              <Label
                aria-label={`Hosted image ${index + 1}: ${label}`}
                className='flex items-center gap-2 text-sm'
                htmlFor={id}
                key={target.image_id}
              >
                <Checkbox
                  id={id}
                  checked={targets.some(selected => selected.image_id === target.image_id)}
                  disabled={
                    !targets.some(selected => selected.image_id === target.image_id) &&
                    targets.length >= MAX_NOTICE_TARGETS
                  }
                  onCheckedChange={checked => toggle(target, checked === true)}
                />
                {label}
              </Label>
            )
          })}
        </div>
      )}
      {resolvedTargets.length > MAX_NOTICE_TARGETS && (
        <p className='text-sm text-muted-foreground'>
          A notice can identify up to {MAX_NOTICE_TARGETS} images. Deselect an image to choose a
          different one.
        </p>
      )}
    </fieldset>
  )
}
