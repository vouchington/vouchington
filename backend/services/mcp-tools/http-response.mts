import type {
  JSONRPCErrorResponse,
  JSONRPCResponse,
  RequestId,
} from '@modelcontextprotocol/sdk/types.js'
import type { ApiHttpResponse } from '@voucha/types/api-http-response'

// The transport and our registered-request validator emit null ids for unidentifiable requests.
type McpRequestErrorResponse = Omit<JSONRPCErrorResponse, 'id'> & { id: RequestId | null }
type McpTransportErrorResponse = Omit<JSONRPCErrorResponse, 'id'> & { id: null }

/** Variants reachable through our stateless, JSON-enabled POST transport. */
export type McpHttpResponse = ApiHttpResponse<
  | {
      status: 200
      bodyKind: 'content'
      mediaType: 'application/json'
      body: JSONRPCResponse | JSONRPCResponse[] | McpRequestErrorResponse
    }
  | { status: 202; bodyKind: 'none' }
  | {
      status: 400
      bodyKind: 'content'
      mediaType: 'application/json'
      body: McpTransportErrorResponse
    }
>
