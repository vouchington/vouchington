'use client'

import { ExposureCooldownModal } from './exposure-cooldown-modal'
import type { UseExposureCooldownReturn } from './use-exposure-cooldown'

interface ExposureCooldownGateProps {
  children: React.ReactNode
  cooldown: UseExposureCooldownReturn
}

/** Shows the server-backed break prompt without blocking unrelated moderation actions. */
export function ExposureCooldownGate({ children, cooldown }: ExposureCooldownGateProps) {
  const { exposureState, showBreakPrompt, dismissBreakPrompt } = cooldown

  return (
    <>
      <div data-pw='exposure-cooldown-gate'>{children}</div>
      <ExposureCooldownModal
        cooldownEndsAt={exposureState?.cooldown_ends_at ?? null}
        open={showBreakPrompt}
        onDismiss={dismissBreakPrompt}
      />
    </>
  )
}
