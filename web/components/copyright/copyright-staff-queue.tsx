'use client'

import { useState, useTransition } from 'react'
import { Textarea } from '@/components/ui/textarea'
import onError, { onSuccess } from '@/lib/on-error'
import type { CopyrightStaffQueueItem } from '@/types/copyright-notices'
import { CopyrightStaffCase } from './copyright-staff-case'

export function CopyrightStaffQueue({ notices }: { notices: CopyrightStaffQueueItem[] }) {
  const [rationale, setRationale] = useState('')
  const [pending, startTransition] = useTransition()
  const trimmedRationale = rationale.trim()
  function submit(action: () => Promise<unknown>, success: string) {
    if (pending || !trimmedRationale) return
    startTransition(async () => {
      try {
        await action()
        onSuccess(success)
        window.location.reload()
      } catch (error) {
        onError(error, {
          fallback: 'We could not record that copyright review action.',
          tags: { form: 'copyright-staff-review' },
        })
      }
    })
  }
  if (notices.length === 0)
    return <p className='text-muted-foreground'>No copyright cases need review.</p>
  return (
    <div className='space-y-5'>
      <Textarea
        aria-label='Review rationale'
        placeholder='State the basis for this decision.'
        value={rationale}
        onChange={event => setRationale(event.target.value)}
      />
      <p className='text-sm text-muted-foreground'>A rationale is required for every decision.</p>
      {notices.map(notice => (
        <CopyrightStaffCase
          key={notice.id}
          notice={notice}
          pending={pending}
          rationale={trimmedRationale}
          submit={submit}
        />
      ))}
    </div>
  )
}
