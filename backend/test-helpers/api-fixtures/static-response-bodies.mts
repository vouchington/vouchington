import responseBodies from './static-response-bodies.json' with { type: 'json' }

export function responseBody(id: string): unknown {
  if (!Object.hasOwn(responseBodies, id)) {
    throw new Error(`Missing static API fixture response body for ${id}`)
  }

  return responseBodies[id as keyof typeof responseBodies]
}
