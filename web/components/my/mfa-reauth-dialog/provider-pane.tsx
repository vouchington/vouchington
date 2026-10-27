'use client'

import { Button } from '@/components/ui/button'
import { useAppleAuth } from '@/hooks/use-apple-auth'
import { useGoogleAuth } from '@/hooks/use-google-auth'
import { beginSdkProviderReAuth, verifySdkProviderReAuth } from '@/lib/api/client'
import { startBrokerProviderReAuth } from '@/lib/auth/provider-reauth-broker'
import { useTranslations } from '@/lib/i18n/use-translations'
import type { OAuthProvider } from '@/types/user'
import { useReAuthVerification } from './use-reauth-verification'

type VerificationProps = {
  loading: boolean
  setLoading: (loading: boolean) => void
  onVerified: (token: string) => void
}

export function ProviderReAuthPane({
  provider,
  ...props
}: VerificationProps & { provider: OAuthProvider }) {
  if (provider === 'apple') return <AppleReAuthButton {...props} />
  if (provider === 'google') return <GoogleReAuthButton {...props} />
  return (
    <VerifyProviderButton
      {...props}
      available
      verify={() => startBrokerProviderReAuth(provider)}
    />
  )
}

function AppleReAuthButton(props: VerificationProps) {
  const auth = useAppleAuth()
  return (
    <SdkReAuthButton
      {...props}
      provider='apple'
      available={auth.isAvailable && auth.isLoaded}
      getCredential={async nonce => (await auth.login({ nonce })).token}
    />
  )
}

function GoogleReAuthButton(props: VerificationProps) {
  const auth = useGoogleAuth()
  return (
    <SdkReAuthButton
      {...props}
      provider='google'
      available={auth.isAvailable && auth.isLoaded}
      getCredential={nonce => auth.login({ nonce })}
    />
  )
}

function SdkReAuthButton({
  provider,
  getCredential,
  ...props
}: VerificationProps & {
  provider: 'apple' | 'google'
  available: boolean
  getCredential: (nonce: string) => Promise<string>
}) {
  async function verify() {
    const { flowId, credential } = await getFreshAssertion()
    const proof = await verifySdkProviderReAuth(provider, flowId, credential)
    return proof.re_auth_token
  }

  async function getFreshAssertion() {
    const challenge = await beginSdkProviderReAuth(provider)
    const credential = await getCredential(challenge.nonce)
    return { flowId: challenge.flow_id, credential }
  }
  return (
    <VerifyProviderButton
      {...props}
      verify={verify}
    />
  )
}

function VerifyProviderButton({
  verify,
  available,
  ...props
}: VerificationProps & {
  available: boolean
  verify: () => Promise<string>
}) {
  const t = useTranslations()
  const run = useReAuthVerification(props)
  return (
    <Button
      loading={props.loading}
      disabled={!available || props.loading}
      onClick={() => run(verify)}
    >
      {t('extracted.mfaReauthDialog.verificationPanes.verify_eea2745e')}
    </Button>
  )
}
