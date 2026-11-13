import { edgeErrorResponse } from '@vouchington/edge'

export const EDGE_HANDLER_HEADER = 'x-voucha-edge-handler'

/** JSON 404 that names the worker handler, so a 404 can be told apart from an origin's 404. */
export const edgeNotFoundResponse = (handler: string): Response =>
  edgeErrorResponse(404, 'Not Found', 'NOT_FOUND', { [EDGE_HANDLER_HEADER]: handler })
