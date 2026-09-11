/** Marks a statically extracted request string as a UUID. */
export type ApiUuidContract = string & { readonly __apiUuidContract: never }
