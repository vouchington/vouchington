import { getFederationCredentials } from '@modules/aws/federation-credentials'
import { AwsClient } from 'google-auth-library'
import { getProviderFetch } from '@modules/api-egress-proxy'

let cachedToken: { token: string; expiresAt: number } | undefined
let tokenRefresh: Promise<{ token: string; expiresAt: number }> | undefined

export function requireVertexEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required for Vertex AI embeddings`)
  return value
}

function createAuth(): AwsClient {
  if (requireVertexEnvironment('VERTEX_LOCATION') !== 'us')
    throw new Error('VERTEX_LOCATION must be us for embeddings')
  const projectNumber = requireVertexEnvironment('VERTEX_PROJECT_NUMBER')
  const pool = requireVertexEnvironment('VERTEX_WIF_POOL_ID')
  const provider = requireVertexEnvironment('VERTEX_WIF_PROVIDER_ID')
  const serviceAccount = requireVertexEnvironment('VERTEX_SERVICE_ACCOUNT_EMAIL')
  return new AwsClient({
    audience: `//iam.googleapis.com/projects/${projectNumber}/locations/global/workloadIdentityPools/${pool}/providers/${provider}`,
    subject_token_type: 'urn:ietf:params:aws:token-type:aws4_request',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    aws_security_credentials_supplier: {
      async getAwsRegion() {
        return (
          process.env.AWS_REGION?.trim() || process.env.AWS_DEFAULT_REGION?.trim() || 'us-west-2'
        )
      },
      async getAwsSecurityCredentials() {
        // AWS's chain supports ECS task-role credentials, including expiring session tokens.
        const identity = await getFederationCredentials()
        return {
          accessKeyId: identity.accessKeyId,
          secretAccessKey: identity.secretAccessKey,
          token: identity.sessionToken,
        }
      },
    },
    transporterOptions: {
      timeout: 30_000,
      fetchImplementation: getProviderFetch('gemini_embeddings_enabled'),
    },
  })
}

export async function getVertexAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token
  tokenRefresh ??= exchangeAwsIdentity().finally(() => {
    tokenRefresh = undefined
  })
  cachedToken = await tokenRefresh
  return cachedToken.token
}

/* no-mistakes: integration=google */
async function exchangeAwsIdentity(): Promise<{ token: string; expiresAt: number }> {
  const signal = AbortSignal.timeout(30_000)
  const auth = createAuth()
  const subjectToken = await untilAborted(auth.retrieveSubjectToken(), signal)
  const fetch = getProviderFetch('gemini_embeddings_enabled')
  // Keep both STS and IAM on the same provider transport. AwsClient's built-in refresh
  // constructs its STS transporter separately from the configured IAM transporter.
  const sts = await fetch('https://sts.googleapis.com/v1/token', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      audience: `//iam.googleapis.com/projects/${requireVertexEnvironment('VERTEX_PROJECT_NUMBER')}/locations/global/workloadIdentityPools/${requireVertexEnvironment('VERTEX_WIF_POOL_ID')}/providers/${requireVertexEnvironment('VERTEX_WIF_PROVIDER_ID')}`,
      requested_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      subject_token_type: 'urn:ietf:params:aws:token-type:aws4_request',
      subject_token: subjectToken,
      scope: 'https://www.googleapis.com/auth/cloud-platform',
    }).toString(),
  })
  if (!sts.ok) {
    await sts.body?.cancel()
    throw new Error(`Google STS authentication failed (${sts.status})`)
  }
  const identity = (await sts.json()) as { access_token?: string }
  if (!identity.access_token) throw new Error('Google STS returned no access token')
  const serviceAccount = requireVertexEnvironment('VERTEX_SERVICE_ACCOUNT_EMAIL')
  const iam = await fetch(
    `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(serviceAccount)}:generateAccessToken`,
    {
      method: 'POST',
      signal,
      headers: {
        authorization: `Bearer ${identity.access_token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        scope: ['https://www.googleapis.com/auth/cloud-platform'],
        lifetime: '3600s',
      }),
    },
  )
  if (!iam.ok) {
    await iam.body?.cancel()
    throw new Error(`Google IAM authentication failed (${iam.status})`)
  }
  const result = (await iam.json()) as { accessToken?: string; expireTime?: string }
  const expiresAt = Date.parse(result.expireTime ?? '')
  if (!result.accessToken || !Number.isFinite(expiresAt))
    throw new Error('Google IAM returned an invalid access token')
  return { token: result.accessToken, expiresAt }
}

/* no-mistakes: integration=vertex */
export async function vertexRequest(
  path: string,
  body: unknown,
  abortSignal?: AbortSignal,
): Promise<unknown> {
  const signal = abortSignal ?? AbortSignal.timeout(30_000)
  const token = await accessTokenUntilAborted(signal)
  const response = await getProviderFetch('gemini_embeddings_enabled')(
    `https://aiplatform.us.rep.googleapis.com/v1/${path}`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    },
  )
  if (!response.ok) {
    await response.body?.cancel()
    throw new Error(`Vertex embedding request failed (${response.status})`)
  }
  return response.json()
}

export async function accessTokenUntilAborted(signal: AbortSignal): Promise<string> {
  signal.throwIfAborted()
  return untilAborted(getVertexAccessToken(), signal)
}

function untilAborted<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const onAbort = () =>
      reject(
        signal.reason instanceof Error
          ? signal.reason
          : new Error('Vertex request aborted', { cause: signal.reason }),
      )
    signal.addEventListener('abort', onAbort, { once: true })
    void promise
      .then(resolve)
      .finally(() => signal.removeEventListener('abort', onAbort))
      .catch(reject)
  })
}
