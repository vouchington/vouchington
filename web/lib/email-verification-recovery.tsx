'use client'

import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { EmailVerificationRecoveryDialog } from '@/components/my/email-verification-recovery-dialog'
import { EmailVerificationRecoveryContext } from './email-verification-recovery-context'

export function EmailVerificationRecoveryProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const onVerifiedRef = useRef<(() => void) | undefined>(undefined)
  const openEmailVerificationRecovery = useCallback((options?: { onVerified?: () => void }) => {
    onVerifiedRef.current = options?.onVerified
    setOpen(true)
  }, [])
  const contextValue = useMemo(
    () => ({ openEmailVerificationRecovery }),
    [openEmailVerificationRecovery],
  )

  return (
    <EmailVerificationRecoveryContext value={contextValue}>
      {children}
      <EmailVerificationRecoveryDialog
        open={open}
        onOpenChange={setOpen}
        onVerified={() => {
          setOpen(false)
          toast.success('Email verified. Try your action again.')
          onVerifiedRef.current?.()
          onVerifiedRef.current = undefined
        }}
      />
    </EmailVerificationRecoveryContext>
  )
}
