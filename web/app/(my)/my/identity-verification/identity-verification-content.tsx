'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useLoadingIds } from '@/hooks/use-loading-ids'
import { ApiError } from '@/lib/api/error'
import {
  startMyIdentityVerificationCheckout,
  getMyIdentityVerificationSessionUrl,
} from '@/lib/api/client/identity-verification'
import type { IdentityVerificationStatus, PublicVerifiedNameDisplay } from '@/types/user'
import { VerifiedDisplayPreferencesCard } from './verified-display-preferences-card'
import { useTranslations } from '@/lib/i18n/use-translations'
import {
  isEmailVerificationRequired,
  useEmailVerificationRecovery,
} from '@/lib/email-verification-recovery-context'

interface IdentityVerificationContentProps {
  verificationStatus: IdentityVerificationStatus
  verifiedBadgeVisible: boolean
  publicVerifiedNameDisplay: PublicVerifiedNameDisplay
  verificationFee?: string
}

export function IdentityVerificationContent({
  verificationStatus,
  verifiedBadgeVisible: initialBadgeVisible,
  publicVerifiedNameDisplay: initialNameDisplay,
  verificationFee = '$5.00',
}: IdentityVerificationContentProps) {
  const t = useTranslations()
  const { runWithLoadingId, loadingIds } = useLoadingIds()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const emailRecovery = useEmailVerificationRecovery()

  async function handleStartVerification() {
    setErrorMessage(null)
    await runWithLoadingId('start-verification', async () => {
      try {
        const { url } = await startMyIdentityVerificationCheckout()
        window.location.href = url
      } catch (error) {
        if (isEmailVerificationRequired(error)) emailRecovery?.openEmailVerificationRecovery()
        else
          setErrorMessage(
            error instanceof ApiError ? error.message : 'Failed to start verification.',
          )
      }
    })
  }

  if (verificationStatus === 'unverified') {
    return (
      <Card className='p-4'>
        <h2 className='mb-2 text-lg font-semibold'>
          {t('extracted.identityVerification.identityVerificationContent.getIdVerified_1b8a7aa9')}
        </h2>
        <p className='mb-4 text-sm text-muted-foreground'>
          {t(
            'extracted.identityVerification.identityVerificationContent.verifyYourIdentityWithAGovernment_a50517b6',
            { verificationFee },
          )}
        </p>
        {errorMessage && <p className='mb-3 text-sm text-destructive'>{errorMessage}</p>}
        <Button
          data-pw='start-verification-button'
          onClick={handleStartVerification}
          loading={loadingIds.has('start-verification')}
          disabled={loadingIds.has('start-verification')}
        >
          {loadingIds.has('start-verification') ? 'Redirecting…' : 'Verify My Identity'}
        </Button>
      </Card>
    )
  }

  if (verificationStatus === 'payment_pending') {
    return (
      <Card className='p-4'>
        <h2 className='mb-2 text-lg font-semibold'>
          {t(
            'extracted.identityVerification.identityVerificationContent.paymentInProgress_3e4889ac',
          )}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t(
            'extracted.identityVerification.identityVerificationContent.aPaymentIsAlreadyInProgress_992083ff',
          )}
        </p>
      </Card>
    )
  }

  async function handleContinueVerification() {
    setErrorMessage(null)
    await runWithLoadingId('continue-verification', async () => {
      try {
        const { url } = await getMyIdentityVerificationSessionUrl()
        window.location.href = url
      } catch (error) {
        setErrorMessage(
          error instanceof ApiError ? error.message : 'Failed to retrieve verification session.',
        )
      }
    })
  }

  if (verificationStatus === 'identity_pending') {
    return (
      <Card className='p-4 space-y-3'>
        <h2 className='text-lg font-semibold'>
          {t(
            'extracted.identityVerification.identityVerificationContent.identityVerificationInProgress_80bd578a',
          )}
        </h2>
        <p className='text-sm text-muted-foreground'>
          {t(
            'extracted.identityVerification.identityVerificationContent.yourPaymentWasReceivedPleaseComplete_ac62cda9',
          )}
        </p>
        {errorMessage && <p className='text-sm text-destructive'>{errorMessage}</p>}
        <Button
          data-pw='continue-verification-button'
          onClick={handleContinueVerification}
          loading={loadingIds.has('continue-verification')}
          disabled={loadingIds.has('continue-verification')}
        >
          {loadingIds.has('continue-verification') ? 'Redirecting…' : 'Continue Verification'}
        </Button>
      </Card>
    )
  }

  if (verificationStatus === 'verified') {
    return (
      <VerifiedDisplayPreferencesCard
        verifiedBadgeVisible={initialBadgeVisible}
        publicVerifiedNameDisplay={initialNameDisplay}
      />
    )
  }

  if (verificationStatus === 'failed') {
    return (
      <Card className='p-4'>
        <h2 className='mb-2 text-lg font-semibold'>
          {t(
            'extracted.identityVerification.identityVerificationContent.verificationFailed_cb3a722b',
          )}
        </h2>
        <p className='mb-4 text-sm text-muted-foreground'>
          {t(
            'extracted.identityVerification.identityVerificationContent.yourIdentityCheckCouldNotBe_08124911',
          )}
        </p>
        {errorMessage && <p className='mb-3 text-sm text-destructive'>{errorMessage}</p>}
        <Button
          data-pw='retry-verification-button'
          onClick={handleStartVerification}
          loading={loadingIds.has('start-verification')}
          disabled={loadingIds.has('start-verification')}
        >
          {loadingIds.has('start-verification') ? 'Redirecting…' : 'Try Again'}
        </Button>
      </Card>
    )
  }

  if (verificationStatus === 'duplicate_id') {
    return (
      <Card className='p-4 space-y-3'>
        <h2 className='text-lg font-semibold'>
          {t('extracted.identityVerification.identityVerificationContent.idAlreadyInUse_bc91a042')}
        </h2>
        <p className='mb-1 text-sm text-muted-foreground'>
          {t(
            'extracted.identityVerification.identityVerificationContent.theGovernmentIdYouSubmittedIs_7930743f',
          )}
        </p>
        <Button
          variant='outline'
          asChild
        >
          <a href='mailto:support@voucha.ai'>
            {t(
              'extracted.identityVerification.identityVerificationContent.contactSupport_f8d47b82',
            )}
          </a>
        </Button>
      </Card>
    )
  }

  return null
}
