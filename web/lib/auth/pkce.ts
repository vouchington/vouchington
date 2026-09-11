export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return btoa(String.fromCodePoint(...array))
    .replaceAll(/\+/g, '-')
    .replaceAll(/\//g, '_')
    .replaceAll(/[=]/g, '')
}

export function generateState(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier)
  const hash = await crypto.subtle.digest('SHA-256', data)
  return btoa(String.fromCodePoint(...new Uint8Array(hash)))
    .replaceAll(/\+/g, '-')
    .replaceAll(/\//g, '_')
    .replaceAll(/[=]/g, '')
}
