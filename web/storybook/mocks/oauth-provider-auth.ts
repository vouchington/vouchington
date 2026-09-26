import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'

function readyAuth(isAvailable: boolean) {
  return {
    isAvailable,
    isLoaded: isAvailable,
    login: async () => 'storybook-oauth-token',
  }
}

export function useAppleAuth() {
  const { appleClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(appleClientId))
}

export function useFacebookSDK() {
  const { facebookAppId } = useRuntimePublicConfig()
  return readyAuth(Boolean(facebookAppId))
}

export function useGithubAuth() {
  const { githubClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(githubClientId))
}

export function useGoogleAuth() {
  const { googleClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(googleClientId))
}

export function useLinkedInAuth() {
  const { linkedinClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(linkedinClientId))
}

export function useMicrosoftAuth() {
  const { microsoftClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(microsoftClientId))
}

export function useXAuth() {
  const { xClientId } = useRuntimePublicConfig()
  return readyAuth(Boolean(xClientId))
}
