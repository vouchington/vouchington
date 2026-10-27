import { createServer, request as sendHttpRequest } from 'node:http'
import { listenOnRunnerUnreservedEphemeralPort } from 'vouchington-tooling/runner-port-policy'
import type { DeviceTokenPayload } from '../../ts-shared/session-jwt/types.mts'
import { v7 as mintUUIDv7 } from 'uuid'
import { getOptionalRequestClientInfo } from '../modules/request-client-info/index.mts'
import { createRequestClientInfoListener } from '../modules/request-client-info/listener.mts'

export type RequestClientInfoTestOptions = {
  method?: string
  path?: string
  headers: Record<string, string>
  isEnforced?: () => boolean
  mintDeviceId?: () => string
  verifyDeviceIdentity?: (
    token: string,
    sessionToken?: string,
  ) => Promise<DeviceTokenPayload | null>
  useDefaultDependencies?: boolean
}

export async function sendRequestClientInfo(
  options: RequestClientInfoTestOptions,
): Promise<Response> {
  const server = createServer(
    createRequestClientInfoListener(
      (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(getOptionalRequestClientInfo() ?? null))
      },
      options.useDefaultDependencies
        ? undefined
        : {
            isEnforced: options.isEnforced ?? (() => true),
            mintDeviceId: options.mintDeviceId ?? mintUUIDv7,
            verifyDeviceIdentity: options.verifyDeviceIdentity ?? (async () => null),
          },
    ),
  )
  const port = await listenOnRunnerUnreservedEphemeralPort(server, '127.0.0.1')
  try {
    return await new Promise<Response>((resolve, reject) => {
      const request = sendHttpRequest({
        host: '127.0.0.1',
        port,
        path: options.path ?? '/api/v1/posts',
        method: options.method,
        headers: options.headers,
      })
      request.on('response', response => {
        const body: Buffer[] = []
        response.on('data', chunk => body.push(Buffer.from(chunk)))
        response.on('end', () =>
          resolve(new Response(Buffer.concat(body), { status: response.statusCode ?? 500 })),
        )
      })
      request.on('error', reject)
      request.end()
    })
  } finally {
    server.close()
  }
}
