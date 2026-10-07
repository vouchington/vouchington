'use client'

import { useEffect, useId, useState, type FormEvent } from 'react'
import { LockKeyhole, LockKeyholeOpen } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  listUserPreservationHolds,
  placeUserPreservationHold,
  releaseUserPreservationHold,
} from '@/lib/api/client/preservation-holds'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { UserPreservationHold } from '@/types/api-responses'
import { UserPreservationHoldHistory } from './user-preservation-hold-history'

type HoldsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; holds: UserPreservationHold[] }

// Administrator-only legal-process preservation hold (issue #1449). The reference is sensitive:
// it is rendered for administrators and never sent to the toast or any error reporter.
export function UserPreservationHoldCard({
  userId,
  isAccountDeleted = false,
}: {
  userId: string
  isAccountDeleted?: boolean
}) {
  const t = useTranslations()
  const referenceId = useId()
  const [state, setState] = useState<HoldsState>({ status: 'loading' })
  const [reference, setReference] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    listUserPreservationHolds(userId)
      .then(data => {
        if (!cancelled) setState({ status: 'loaded', holds: data.holds })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({ status: 'error' })
        toast.error(
          err instanceof Error
            ? err.message
            : t('extracted.admin.userPreservationHoldCard.failedToLoadPreservationHolds_946c1dfa'),
        )
      })
    return () => {
      cancelled = true
    }
  }, [userId, t])

  const holds = state.status === 'loaded' ? state.holds : []
  const openHold = holds.find(hold => hold.released_at === null)
  const history = holds.filter(hold => hold.released_at !== null)

  async function handlePlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = reference.trim()
    if (!trimmed) return
    setIsBusy(true)
    try {
      const { hold } = await placeUserPreservationHold(userId, { reference: trimmed })
      setState({ status: 'loaded', holds: [hold, ...holds] })
      setReference('')
      toast.success(t('extracted.admin.userPreservationHoldCard.preservationHoldPlaced_e9e2c131'))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('extracted.admin.userPreservationHoldCard.failedToPlacePreservationHold_516c14a6'),
      )
    } finally {
      setIsBusy(false)
    }
  }

  async function handleRelease() {
    setIsBusy(true)
    try {
      const { hold } = await releaseUserPreservationHold(userId)
      setState({ status: 'loaded', holds: holds.map(item => (item.id === hold.id ? hold : item)) })
      toast.success(t('extracted.admin.userPreservationHoldCard.preservationHoldReleased_1077a4b9'))
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : t('extracted.admin.userPreservationHoldCard.failedToReleasePreservationHold_e2e095b7'),
      )
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className='flex flex-wrap items-center justify-between gap-3'>
          <div>
            <CardTitle>
              {t('extracted.admin.userPreservationHoldCard.legalPreservationHold_407bcdf3')}
            </CardTitle>
            <CardDescription>
              {isAccountDeleted
                ? t('extracted.admin.userPreservationHoldCard.whileAHoldIsOpenFinalPurge_5bd30c73')
                : t(
                    'extracted.admin.userPreservationHoldCard.whileAHoldIsOpenThisAccount_b2f34b3a',
                  )}
            </CardDescription>
          </div>
          {state.status === 'loaded' && (
            <Badge variant={openHold ? 'destructive' : 'secondary'}>
              {openHold
                ? t('extracted.admin.userPreservationHoldCard.holdOpen_3ea8b361')
                : t('extracted.admin.userPreservationHoldCard.noHold_7b5e86ee')}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-4'>
        {state.status === 'loading' && (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.admin.userPreservationHoldCard.loadingPreservationHolds_4ef258f9')}
          </p>
        )}
        {state.status === 'error' && (
          <p className='text-sm text-muted-foreground'>
            {t('extracted.admin.userPreservationHoldCard.failedToLoadPreservationHolds_946c1dfa')}
          </p>
        )}
        {state.status === 'loaded' && openHold && (
          <div className='flex flex-col gap-3'>
            <p className='break-words text-sm font-medium'>{openHold.reference}</p>
            <Button
              type='button'
              variant='outline'
              className='self-start'
              disabled={isBusy}
              onClick={handleRelease}
            >
              <LockKeyholeOpen data-icon='inline-start' />
              {t('extracted.admin.userPreservationHoldCard.releaseHold_6efa4f01')}
            </Button>
          </div>
        )}
        {state.status === 'loaded' && !openHold && (
          <form
            className='flex max-w-2xl flex-col gap-3'
            onSubmit={handlePlace}
          >
            <div className='flex flex-col gap-2'>
              <Label htmlFor={referenceId}>
                {t('extracted.admin.userPreservationHoldCard.matterReference_3b6014e2')}
              </Label>
              <Input
                id={referenceId}
                value={reference}
                onChange={event => setReference(event.target.value)}
                maxLength={500}
                autoComplete='off'
                disabled={isBusy}
              />
            </div>
            <Button
              type='submit'
              variant='destructive'
              className='self-start'
              disabled={isBusy || !reference.trim()}
            >
              <LockKeyhole data-icon='inline-start' />
              {t('extracted.admin.userPreservationHoldCard.placeHold_22ce9e8b')}
            </Button>
          </form>
        )}
        <UserPreservationHoldHistory holds={history} />
      </CardContent>
    </Card>
  )
}
