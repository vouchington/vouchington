import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'

const code = 'storybook-oauth-code'
const redirectUri = 'https://storybook.local/auth/callback'
const codeVerifier = 'storybook-oauth-verifier'

function readyAuth<T>(isAvailable: boolean, login: () => Promise<T>) {
  return {
    isAvailable,
    isLoaded: isAvailable,
    login,
  }
}

export function useAppleAuth() {
  const { appleClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(appleClientId), async () => ({
    token: 'storybook-apple-token',
    nonce: 'storybook-apple-nonce',
    userData: { name: 'Storybook User' },
  }))
}

export function useFacebookSDK() {
  const { facebookAppId } = useRuntimePublicConfig()
  return readyAuth(Boolean(facebookAppId), async () => 'storybook-oauth-token')
}

export function useGithubAuth() {
  const { githubClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(githubClientId), async () => ({ code, redirectUri }))
}

export function useGoogleAuth() {
  const { googleClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(googleClientId), async () => 'storybook-oauth-token')
}

export function useLinkedInAuth() {
  const { linkedinClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(linkedinClientId), async () => ({ code, codeVerifier, redirectUri }))
}

export function useMicrosoftAuth() {
  const { microsoftClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(microsoftClientId), async () => ({ code, codeVerifier, redirectUri }))
}

export function useXAuth() {
  const { xClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(xClientId), async () => ({ code, codeVerifier, redirectUri }))
}
