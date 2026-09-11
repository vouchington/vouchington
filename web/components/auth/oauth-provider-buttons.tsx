'use client'

import { useEffect } from 'react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { useAppleAuth } from '@/hooks/use-apple-auth'
import { useGoogleAuth } from '@/hooks/use-google-auth'
import { useXAuth } from '@/hooks/use-x-auth'
import { useLinkedInAuth } from '@/hooks/use-linkedin-auth'
import { useMicrosoftAuth } from '@/hooks/use-microsoft-auth'
import { useFacebookSDK } from '@/hooks/use-facebook-sdk'
import { useGithubAuth } from '@/hooks/use-github-auth'
import { ProviderIcon } from './oauth-provider-icons'
import { providerButtonClassNames } from './oauth-provider-configs'
import { ProviderButton, type OAuthButtonProps } from './oauth-provider-button'
import { useTranslations } from '@/lib/i18n/use-translations'

export function FacebookLoginButton({ onAvailabilityChange, ...props }: OAuthButtonProps) {
  const t = useTranslations()
  const auth = useFacebookSDK()
  useEffect(() => {
    // oxlint-disable-next-line react-you-might-not-need-an-effect/no-pass-data-to-parent -- SDK availability is only known inside this child
    onAvailabilityChange?.(auth.isAvailable)
  }, [auth.isAvailable, onAvailabilityChange])
  if (!auth.isAvailable) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type='button'
              variant='outline'
              className={`w-full justify-start gap-3 ${providerButtonClassNames.facebook} cursor-not-allowed opacity-50 hover:bg-background`}
              aria-disabled='true'
              aria-label={t(
                'extracted.auth.oauthProviderButtons.continueWithFacebookUnavailable_eb303cba',
              )}
              onClick={event => event.preventDefault()}
              data-pw='oauth-provider-button-facebook'
            >
              <span className='shrink-0'>
                <ProviderIcon provider='facebook' />
              </span>
              {t('extracted.auth.oauthProviderButtons.continueWithFacebook_f154b630')}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t(
              'extracted.auth.oauthProviderButtons.facebookLoginIsTemporarilyUnavailable_06b18a1f',
            )}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }
  return (
    <ProviderButton
      label='Facebook'
      auth={auth}
      provider='facebook'
      buttonClassName={providerButtonClassNames.facebook}
      getToken={async () => ({ provider: 'facebook', token: await auth.login() })}
      {...props}
    />
  )
}

export function AppleLoginButton(props: OAuthButtonProps) {
  const auth = useAppleAuth()
  return (
    <ProviderButton
      label='Apple'
      auth={auth}
      provider='apple'
      buttonClassName={providerButtonClassNames.apple}
      getToken={async () => {
        const result = await auth.login()
        return {
          provider: 'apple',
          token: result.token,
          nonce: result.nonce,
          userData: result.userData,
        }
      }}
      {...props}
    />
  )
}

export function GoogleLoginButton(props: OAuthButtonProps) {
  const auth = useGoogleAuth()
  return (
    <ProviderButton
      label='Google'
      auth={auth}
      provider='google'
      buttonClassName={providerButtonClassNames.google}
      getToken={async () => ({
        provider: 'google',
        credential: await auth.login(),
      })}
      {...props}
    />
  )
}

export function XLoginButton(props: OAuthButtonProps) {
  const auth = useXAuth()
  return (
    <ProviderButton
      label='X'
      auth={auth}
      provider='x'
      buttonClassName={providerButtonClassNames.x}
      getToken={async () => ({ provider: 'x', ...(await auth.login()) })}
      {...props}
    />
  )
}

export function LinkedInLoginButton(props: OAuthButtonProps) {
  const auth = useLinkedInAuth()
  return (
    <ProviderButton
      label='LinkedIn'
      auth={auth}
      provider='linkedin'
      buttonClassName={providerButtonClassNames.linkedin}
      getToken={async () => ({ provider: 'linkedin', ...(await auth.login()) })}
      {...props}
    />
  )
}

export function MicrosoftLoginButton(props: OAuthButtonProps) {
  const auth = useMicrosoftAuth()
  return (
    <ProviderButton
      label='Microsoft'
      auth={auth}
      provider='microsoft'
      buttonClassName={providerButtonClassNames.microsoft}
      getToken={async () => ({ provider: 'microsoft', ...(await auth.login()) })}
      {...props}
    />
  )
}

export function GithubLoginButton(props: OAuthButtonProps) {
  const auth = useGithubAuth()
  return (
    <ProviderButton
      label='GitHub'
      auth={auth}
      provider='github'
      buttonClassName={providerButtonClassNames.github}
      getToken={async () => ({ provider: 'github', ...(await auth.login()) })}
      {...props}
    />
  )
}
