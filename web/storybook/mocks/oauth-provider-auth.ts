import { useRuntimePublicConfig } from '@/lib/runtime-public-config-context'

const readyAuth = {
  isAvailable: true,
  isLoaded: true,
  login: async () => 'storybook-oauth-token',
}

export function useAppleAuth() {
  return readyAuth
}

export function useFacebookSDK() {
  const { facebookAppId } = useRuntimePublicConfig()
  const isAvailable = Boolean(facebookAppId)
  return { ...readyAuth, isAvailable, isLoaded: isAvailable }
}

export function useGithubAuth() {
  return readyAuth
}

export function useGoogleAuth() {
  return readyAuth
}

export function useLinkedInAuth() {
  return readyAuth
}

export function useMicrosoftAuth() {
  return readyAuth
}

export function useXAuth() {
  return readyAuth
}
