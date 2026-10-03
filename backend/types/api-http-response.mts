/** Compiler-discovered variants carried by an opaque response without reading its body. */
export type ApiHttpResponseVariant =
  | { status: number; bodyKind: 'content'; mediaType: string; body: unknown }
  | { status: number; bodyKind: 'none' }

export type ApiHttpResponse<TVariants extends ApiHttpResponseVariant> = Response & {
  readonly apiHttpResponseVariants?: TVariants
}
