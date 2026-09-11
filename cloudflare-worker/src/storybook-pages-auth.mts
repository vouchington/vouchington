import {
  INTERNAL_REFERENCE_BASIC_AUTH_CHALLENGE,
  requiredBasicAuthDecision,
} from './basic-auth-credentials.mts'

export interface StorybookPagesEnv {
  ASSETS?: { fetch(request: Request): Promise<Response> }
  BASIC_AUTH_CREDENTIALS?: string
}

const PROTECTED_RESPONSE_HEADERS = {
  'cache-control': 'private, no-store, max-age=0, must-revalidate',
  'cdn-cache-control': 'no-store',
  'cloudflare-cdn-cache-control': 'no-store',
  vary: 'Authorization',
} as const

function protectedResponse(response: Response): Response {
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(PROTECTED_RESPONSE_HEADERS)) {
    headers.set(name, value)
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

function authErrorResponse(
  status: number,
  message: string,
  code: string,
  challenge = false,
): Response {
  return new Response(JSON.stringify({ message, code }), {
    status,
    headers: {
      'content-type': 'application/json',
      ...PROTECTED_RESPONSE_HEADERS,
      ...(challenge ? { 'www-authenticate': INTERNAL_REFERENCE_BASIC_AUTH_CHALLENGE } : {}),
    },
  })
}

export async function serveStorybookPages(
  request: Request,
  env: StorybookPagesEnv,
): Promise<Response> {
  const decision = requiredBasicAuthDecision(
    request.headers.get('authorization'),
    env.BASIC_AUTH_CREDENTIALS,
  )
  if (decision === 'misconfigured') {
    return authErrorResponse(
      503,
      'Basic authentication is not configured',
      'BASIC_AUTH_CONFIG_INVALID',
    )
  }
  if (decision === 'unauthorized') {
    return authErrorResponse(401, 'Authentication required', 'UNAUTHORIZED', true)
  }
  if (!env.ASSETS) {
    return authErrorResponse(500, 'Pages asset binding is missing', 'ASSETS_BINDING_MISSING')
  }

  const headers = new Headers(request.headers)
  headers.delete('authorization')
  const response = await env.ASSETS.fetch(new Request(request, { headers }))
  return protectedResponse(response)
}

const storybookPagesAuthWorker = {
  fetch(request: Request, env: StorybookPagesEnv): Promise<Response> {
    return serveStorybookPages(request, env)
  },
}

export default storybookPagesAuthWorker
