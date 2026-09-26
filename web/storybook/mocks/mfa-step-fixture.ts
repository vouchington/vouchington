import { ClientRequest } from '@/lib/api/client/request'

let mfaStepFixture = false
const previousPost = ClientRequest.prototype.post
const verifiedUser = { user: { id: 'storybook-user' } }

export function setMfaStepFixture(): void {
  mfaStepFixture = true
}

export function clearMfaStepFixture(): void {
  mfaStepFixture = false
}

ClientRequest.prototype.post = function storybookMfaStepPost<T>(
  endpoint: string,
  body?: unknown,
  options?: Parameters<ClientRequest['post']>[2],
): Promise<T> {
  if (!mfaStepFixture) return previousPost.call(this, endpoint, body, options) as Promise<T>
  if (endpoint === '/api/v1/auth/mfa/totp/verification') return Promise.resolve(verifiedUser as T)
  if (endpoint === '/api/v1/auth/mfa/passkeys/authentication/verification') {
    return Promise.resolve(verifiedUser as T)
  }
  if (endpoint === '/api/v1/auth/mfa/passkeys/authentication/options') {
    return Promise.resolve({
      options: { challenge: 'storybook-challenge', allowCredentials: [], rpId: 'localhost' },
    } as T)
  }
  return previousPost.call(this, endpoint, body, options) as Promise<T>
}
