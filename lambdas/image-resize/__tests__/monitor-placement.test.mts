import { once } from 'node:events'
import { createServer, type Server } from 'node:http'
import type { APIGatewayProxyEvent } from 'aws-lambda'
import { describe, expect, it } from 'vitest'
import { runImageResizeSmoke } from '../../../monitors/lambdas/image-resize.mts'
import { parseRequest } from '../request/parse.mts'

const LIVE_PATH = `/images/placements/${crypto.randomUUID()}/3/${crypto.randomUUID()}`

function parseImagePath(path: string) {
  return parseRequest({
    path,
    queryStringParameters: { w: '200' },
    headers: {},
  } as unknown as APIGatewayProxyEvent)
}

async function listen(server: Server): Promise<string> {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local HTTP address')
  return `http://127.0.0.1:${address.port}`
}

describe('image resize placement monitor', () => {
  it('checks a missing canonical tuple, removed route denial and optional live placement', async () => {
    const paths: string[] = []
    // This HTTP boundary represents CloudFront: unknown tuples/removed routes deny before Lambda.
    await using edge = createServer((request, response) => {
      const path = new URL(request.url!, 'http://localhost').pathname
      paths.push(path)
      response.writeHead(path === LIVE_PATH ? 200 : 404, { 'content-type': 'image/png' })
      response.end()
    })
    const directPaths: string[] = []
    await using direct = createServer((request, response) => {
      directPaths.push(new URL(request.url!, 'http://localhost').pathname)
      response.writeHead(403)
      response.end()
    })
    const [imageOrigin, lambdaFunctionUrl] = await Promise.all([listen(edge), listen(direct)])
    const results = await runImageResizeSmoke({
      imageOrigin,
      testImagePlacementPath: LIVE_PATH,
      lambdaFunctionUrl,
    })
    expect(results.map(result => result.passed)).toEqual([true, true, true, true])
    expect(parseImagePath(paths[0]!)).toMatchObject({ placementRevision: 0, width: 200 })
    expect(() => parseImagePath(paths[1]!)).toThrow('Invalid placement route')
    expect(parseImagePath(paths[2]!)).toMatchObject({ placementRevision: 3, width: 200 })
    expect(directPaths).toEqual([paths[0]])
  })
  it.each([200, 400, 403, 451, 503])('fails exact denial checks on HTTP %s', async status => {
    await using edge = createServer((_request, response) => {
      response.writeHead(status)
      response.end()
    })
    const results = await runImageResizeSmoke({ imageOrigin: await listen(edge) })
    expect(results.map(result => result.passed)).toEqual([false, false])
  })
  it('fails the live check when a 200 response is not an image', async () => {
    await using edge = createServer((request, response) => {
      response.writeHead(request.url!.startsWith(LIVE_PATH) ? 200 : 404, {
        'content-type': 'text/html',
      })
      response.end()
    })
    const results = await runImageResizeSmoke({
      imageOrigin: await listen(edge),
      testImagePlacementPath: LIVE_PATH,
    })
    expect(results.map(result => result.passed)).toEqual([true, true, false])
  })
  it.each([
    '/images/source-key',
    `${LIVE_PATH}?w=200`,
    LIVE_PATH.replace('/3/', '/03/'),
    LIVE_PATH.replace('/3/', '/2147483648/'),
  ])('rejects a noncanonical configured live placement path %s', async testImagePlacementPath => {
    await expect(
      runImageResizeSmoke({ imageOrigin: 'http://127.0.0.1', testImagePlacementPath }),
    ).rejects.toThrow('TEST_IMAGE_PLACEMENT_PATH')
  })
})
