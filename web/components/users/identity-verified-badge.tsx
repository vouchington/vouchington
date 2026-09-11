'use client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useTranslations } from '@/lib/i18n/use-translations'

interface IdentityVerifiedBadgeProps {
  className?: string
}

export function IdentityVerifiedBadge({ className }: IdentityVerifiedBadgeProps) {
  const t = useTranslations()
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          data-pw='identity-verified-badge'
          variant='ghost'
          size='sm'
          className={className}
        >
          <Badge variant='secondary'>
            {t('extracted.users.identityVerifiedBadge.idVerified_88bafc87')}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('extracted.users.identityVerifiedBadge.idVerified_88bafc87')}
          </DialogTitle>
          <DialogDescription className='sr-only'>
            {t(
              'extracted.users.identityVerifiedBadge.identityVerificationStatusForThisAccount_182f9ecb',
            )}
          </DialogDescription>
        </DialogHeader>
        <p className='text-sm text-muted-foreground'>
          {t(
            'extracted.users.identityVerifiedBadge.thisAccountCompletedAnIdentityVerification_a8190373',
          )}
        </p>
      </DialogContent>
    </Dialog>
  )
}
