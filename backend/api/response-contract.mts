import type { AnyQueryContractCarrier, ValidatedQueryContractCarriers } from '@modules/pagination'

/**
 * Marks an HTTP response body as a shared API fixture contract.
 *
 * The fixture generator reads these calls with the TypeScript compiler. The
 * identity return type ensures this marker cannot change the runtime payload.
 */
export function apiResponse<const TKey extends string, TBody>(_key: TKey, body: TBody): TBody {
  return body
}

/** Marks a fixture-backed response that intentionally has no response body. */
export function apiNoContent<const TKey extends string>(_key: TKey): void {
  return undefined
}

/** Documents a helper-emitted fixed-status bodyless response for OpenAPI route discovery only. */
export function apiOpenApiNoContent<const TKey extends string>(_key: TKey, _status: number): void {
  return undefined
}

/**
 * Documents a fixed-media raw response for OpenAPI route discovery without changing the streamed
 * runtime payload. Raw email evidence is intentionally not a JSON fixture response.
 */
export function apiOpenApiRawResponse<const TKey extends string, TBody>(
  _key: TKey,
  _mediaType: string,
  body: TBody,
): TBody {
  return body
}

/**
 * Marks a request body as a shared API fixture contract, mirroring `apiResponse`. The identity
 * return type ensures this marker cannot change the parsed request payload.
 */
export function apiRequest<const TKey extends string, TBody>(_key: TKey, body: TBody): TBody {
  return body
}

/** Adds JSON Schema array constraints to a statically extracted API request contract. */
export type ApiArrayContract<
  TItem,
  _TMinItems extends number,
  _TMaxItems extends number,
  _TUniqueItems extends boolean,
> = TItem[]

/**
 * Marks a request schema without constructing a runtime body. Use for handlers whose body is
 * parsed by a shared factory, where a placeholder value would make the contract drift-prone.
 */
export function apiRequestContract<const TKey extends string, TBody>(
  _key: TKey,
): TBody | undefined {
  return undefined
}

/** Marks a route that intentionally reads no meaningful request body. */
export function apiNoRequestBody<const TKey extends string>(_key: TKey): void {
  return undefined
}

/** Marks the query contract for one API operation for static OpenAPI discovery. */
export function apiQuery<
  const TKey extends string,
  const TSources extends readonly [AnyQueryContractCarrier, ...AnyQueryContractCarrier[]],
>(_key: TKey, ..._sources: TSources & ValidatedQueryContractCarriers<TSources>): void {
  return undefined
}

/**
 * Marks request and response headers for compiler-backed OpenAPI discovery.
 * Header metadata is documentation-only and cannot affect route behavior.
 */
export function apiHeaders<const TKey extends string>(
  _key: TKey,
  _contract: ApiHeaderContract,
): void {
  return undefined
}

type ApiHeader = {
  description?: string
  format?: 'uuid'
  required?: boolean
  type: 'integer' | 'string'
}

type ApiHeaderContract = {
  request?: Readonly<Record<string, ApiHeader>>
  responses?: Readonly<
    Record<
      number,
      {
        description?: string
        errors?: readonly { code: string; message: string }[]
        headers?: Readonly<Record<string, ApiHeader>>
      }
    >
  >
}
