'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  listCopyrightRepeatInfringerAccounts,
  type CopyrightRepeatInfringerAccountRecord,
} from '@/lib/api/client/copyright-repeat-infringer'
import type { SubmitReview } from './copyright-staff-review-buttons'
import { RepeatInfringerAccount } from './copyright-repeat-infringer-account'

export function CopyrightRepeatInfringerActions({
  noticeId,
  canAdminister,
  pending,
  canSubmit,
  rationale,
  submit,
}: {
  noticeId: string
  canAdminister: boolean
  pending: boolean
  canSubmit: boolean
  rationale: string
  submit: SubmitReview
}) {
  const [accounts, setAccounts] = useState<CopyrightRepeatInfringerAccountRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!accounts) {
    return (
      <section className='space-y-2'>
        <h3 className='font-medium'>Repeat-infringer review</h3>
        <Button
          disabled={pending}
          onClick={() => {
            setError(null)
            void listCopyrightRepeatInfringerAccounts(noticeId)
              .then(page => setAccounts(page.copyright_repeat_infringer_accounts))
              .catch(() => setError('The repeat-infringer record could not be loaded.'))
          }}
        >
          Show repeat-infringer record
        </Button>
        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
      </section>
    )
  }
  if (accounts.length === 0) {
    return (
      <p className='text-sm text-muted-foreground'>This case has no repeat-infringer incident.</p>
    )
  }
  return (
    <div className='space-y-3'>
      {accounts.map(account => (
        <RepeatInfringerAccount
          account={account}
          canAdminister={canAdminister}
          canSubmit={canSubmit}
          key={account.incident_id}
          pending={pending}
          rationale={rationale}
          submit={submit}
        />
      ))}
    </div>
  )
}
