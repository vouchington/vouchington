'use client'

import type { OAuthProvider } from '@/types/user'
import type { OAuthButtonProps } from './oauth-provider-button'
import {
  FacebookLoginButton,
  AppleLoginButton,
  GoogleLoginButton,
  XLoginButton,
  LinkedInLoginButton,
  MicrosoftLoginButton,
  GithubLoginButton,
} from './oauth-provider-buttons'
import { OAuthBrokerButton } from './oauth-broker-button'
import type { OAuthBrokerPurpose } from '@/lib/api/client'

type Props = OAuthButtonProps & {
  provider: OAuthProvider
  broker?: { purpose: OAuthBrokerPurpose; returnTo: string }
}

export function OAuthLoginButton({
  provider,
  onToken,
  disabled,
  onAvailabilityChange,
  broker,
}: Props) {
  if (broker && (provider === 'facebook' || provider === 'x' || provider === 'github')) {
    return (
      <OAuthBrokerButton
        provider={provider}
        purpose={broker.purpose}
        returnTo={broker.returnTo}
        disabled={disabled}
      />
    )
  }
  const buttonProps: OAuthButtonProps = { onToken, disabled, onAvailabilityChange }
  switch (provider) {
    case 'facebook': {
      return <FacebookLoginButton {...buttonProps} />
    }
    case 'apple': {
      return <AppleLoginButton {...buttonProps} />
    }
    case 'google': {
      return <GoogleLoginButton {...buttonProps} />
    }
    case 'x': {
      return <XLoginButton {...buttonProps} />
    }
    case 'linkedin': {
      return <LinkedInLoginButton {...buttonProps} />
    }
    case 'microsoft': {
      return <MicrosoftLoginButton {...buttonProps} />
    }
    case 'github': {
      return <GithubLoginButton {...buttonProps} />
    }
  }
}
