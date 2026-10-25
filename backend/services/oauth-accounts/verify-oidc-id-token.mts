import createHttpError from 'http-errors'
import {
  OidcVerificationError,
  type OidcClaims,
  type OidcVerifyOptions,
} from '@vouchington/utils/oidc-id-token'
import { rethrowProviderTransportError } from '@modules/api-egress-proxy'

/** Verifies an ID token, mapping verifier failures to 401 (502 for JWKS fetch) and timeouts to 502. */
export async function verifyOidcIdToken(
  verifier: { verify(idToken: string, options?: OidcVerifyOptions): Promise<OidcClaims> },
  idToken: string,
  label: string,
  options?: OidcVerifyOptions,
): Promise<OidcClaims> {
  try {
    return await verifier.verify(idToken, options)
  } catch (err) {
    if (err instanceof OidcVerificationError) {
      throw createHttpError(err.code === 'jwks_fetch' ? 502 : 401, err.message, {
        cause: err,
      })
    }
    return rethrowProviderTransportError(label, err)
  }
}
