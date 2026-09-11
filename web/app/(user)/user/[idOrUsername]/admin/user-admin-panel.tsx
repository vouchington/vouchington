'use client'

import { useId, useState, useTransition, type ChangeEvent, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Ban, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { suspendUser, unsuspendUser } from '@/lib/api/client/users'
import { IdentityVerificationAttemptGrant } from './identity-verification-attempt-grant'
import { UserAdminWarningsCard } from './user-admin-warnings-card'
import type { User } from '@/types/user'
import { useTranslations } from '@/lib/i18n/use-translations'

interface UserAdminPanelProps {
  user: User
  /** Pass to allow the panel to re-fetch warning counts after issuing a warning. */
  warningCount?: number
}

export function UserAdminPanel({ user }: UserAdminPanelProps) {
  const t = useTranslations()
  const { refresh } = useRouter()
  const reasonId = useId()
  const [displayedUser, setDisplayedUser] = useState(user)
  const [formState, setFormState] = useState({
    reason: user.suspended_reason ?? '',
    action: null as 'suspend' | 'unsuspend' | null,
    successfulAction: false,
  })
  const [isRefreshing, startRefresh] = useTransition()
  const isSuspended = Boolean(displayedUser.suspended_at)
  const isBusy = formState.action !== null || formState.successfulAction || isRefreshing

  const handleReasonChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const value = event.target.value
    setFormState(current => ({ ...current, reason: value }))
  }

  const handleSuspend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFormState(current => ({ ...current, action: 'suspend' }))
    try {
      const formData = new FormData(event.currentTarget)
      const trimmedReason = String(formData.get('reason') ?? '').trim()
      const response = await suspendUser(user.id, trimmedReason ? { reason: trimmedReason } : {})
      toast.success(t('extracted.admin.userAdminPanel.userSuspended_8c2f7a11'))
      setDisplayedUser(response.user)
      setFormState(current => ({
        ...current,
        reason: response.user.suspended_reason ?? '',
        action: null,
        successfulAction: false,
      }))
      startRefresh(() => refresh())
    } catch (error) {
      setFormState(current => ({ ...current, action: null }))
      toast.error(
        error instanceof Error
          ? error.message
          : t('extracted.admin.userAdminPanel.failedToSuspendUser_1b9e4d63'),
      )
    }
  }

  const handleUnsuspend = async () => {
    setFormState(current => ({ ...current, action: 'unsuspend' }))
    try {
      const response = await unsuspendUser(user.id)
      toast.success(t('extracted.admin.userAdminPanel.userUnsuspended_4f7c2e90'))
      setDisplayedUser(response.user)
      setFormState({
        reason: response.user.suspended_reason ?? '',
        action: null,
        successfulAction: false,
      })
      startRefresh(() => refresh())
    } catch (error) {
      setFormState(current => ({ ...current, action: null }))
      toast.error(
        error instanceof Error
          ? error.message
          : t('extracted.admin.userAdminPanel.failedToUnsuspendUser_7e3a19d5'),
      )
    }
  }

  return (
    <div className='space-y-6'>
      <Card>
        <CardHeader>
          <div className='flex flex-wrap items-center justify-between gap-3'>
            <div>
              <CardTitle data-pw='user-administration-title'>
                {t('extracted.admin.userAdminPanel.userAdministration_8841576b')}
              </CardTitle>
              <CardDescription>
                {t('extracted.admin.userAdminPanel.manageAccountSuspensionState_269e0976')}
              </CardDescription>
            </div>
            <Badge
              data-pw='user-admin-status-badge'
              variant={isSuspended ? 'destructive' : 'secondary'}
            >
              {isSuspended
                ? t('extracted.admin.userAdminPanel.suspended_c47a8e12')
                : t('extracted.admin.userAdminPanel.active_9d1b6f34')}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className='flex flex-col gap-4'>
          <dl className='grid gap-3 text-sm sm:grid-cols-2'>
            <div>
              <dt className='font-medium'>{t('extracted.admin.userAdminPanel.userId_7967e089')}</dt>
              <dd className='mt-1 break-all text-muted-foreground'>{displayedUser.id}</dd>
            </div>
            <div>
              <dt className='font-medium'>
                {t('extracted.admin.userAdminPanel.username_e3b89e9d')}
              </dt>
              <dd className='mt-1 text-muted-foreground'>
                {displayedUser.username ?? t('extracted.admin.userAdminPanel.none_2e8c4a90')}
              </dd>
            </div>
            <div>
              <dt className='font-medium'>{t('extracted.admin.userAdminPanel.email_969ccbd3')}</dt>
              <dd className='mt-1 break-all text-muted-foreground'>
                {displayedUser.email_address ?? t('extracted.admin.userAdminPanel.none_2e8c4a90')}
              </dd>
            </div>
            <div>
              <dt className='font-medium'>
                {t('extracted.admin.userAdminPanel.suspendedReason_3e0e8b2f')}
              </dt>
              <dd
                data-pw='user-admin-suspended-reason'
                className='mt-1 text-muted-foreground'
              >
                {displayedUser.suspended_reason ??
                  t('extracted.admin.userAdminPanel.none_2e8c4a90')}
              </dd>
            </div>
          </dl>
          {isSuspended ? (
            <Button
              type='button'
              variant='outline'
              className='self-start'
              disabled={isBusy}
              onClick={handleUnsuspend}
              data-pw='user-admin-unsuspend-button'
            >
              <RotateCcw data-icon='inline-start' />
              {t('extracted.admin.userAdminPanel.unsuspend_eefbf774')}
            </Button>
          ) : (
            <form
              className='flex max-w-2xl flex-col gap-3'
              onSubmit={handleSuspend}
            >
              <div className='flex flex-col gap-2'>
                <Label htmlFor={reasonId}>
                  {t('extracted.admin.userAdminPanel.suspensionReason_d6b08d8e')}
                </Label>
                <Textarea
                  id={reasonId}
                  name='reason'
                  value={formState.reason}
                  onChange={handleReasonChange}
                  placeholder={t(
                    'extracted.admin.userAdminPanel.optionalReasonVisibleToAdmins_d181df3d',
                  )}
                  disabled={isBusy}
                />
              </div>
              <Button
                type='submit'
                variant='destructive'
                className='self-start'
                disabled={isBusy}
              >
                <Ban data-icon='inline-start' />
                {t('extracted.admin.userAdminPanel.suspend_4948e134')}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
      <IdentityVerificationAttemptGrant userId={user.id} />
      <UserAdminWarningsCard userId={user.id} />
    </div>
  )
}
