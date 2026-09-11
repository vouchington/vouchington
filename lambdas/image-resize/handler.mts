import type { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda'
import { resolveRuntimeSecret } from '@lambdas/shared/ssm-secret'
import { SIDELOAD_SIGNING_KEYS_ENV } from '@ts-shared/url-signing'
import { isOgRequest, isSideloadRequest, parseRouterRequest } from './request/index.mts'
import { fetchImageFromUrl as defaultFetchImageFromUrl } from './http/index.mts'
import { buildErrorResponse } from './response/index.mts'
import {
  HTTP_FETCH_TIMEOUT,
  MAX_INPUT_IMAGE_BYTES,
  type EnvironmentConfig,
  type SideloadConfig,
} from './config.mts'
import { LambdaError } from './errors.mts'
import { normalizeS3Request, normalizeSideloadRequest } from './handler-normalize.mts'
import { handleOgRequest } from './handler-og.mts'
import {
  defaultImageRequestDependencies,
  type ImageRequestDependencies,
  processImageRequest,
} from './handler-processing.mts'

const sideloadSigningKeysParameterEnv = 'VOUCHA_SIDELOAD_SIGNING_KEYS_PARAMETER'

export interface LambdaHandlerDependencies extends ImageRequestDependencies {
  fetchImageFromUrl: typeof defaultFetchImageFromUrl
}

const defaultLambdaHandlerDependencies: LambdaHandlerDependencies = {
  ...defaultImageRequestDependencies,
  fetchImageFromUrl: defaultFetchImageFromUrl,
}

export function createLambdaHandler(
  environments: {
    source: EnvironmentConfig
    sideload: SideloadConfig
  },
  dependencies: Partial<LambdaHandlerDependencies> = {},
) {
  const resolvedDependencies: LambdaHandlerDependencies = {
    ...defaultLambdaHandlerDependencies,
    ...dependencies,
  }

  return async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
      let sideloadSigningKeys: string | undefined
      if (isSideloadRequest(event) || isOgRequest(event)) {
        sideloadSigningKeys = await resolveRuntimeSecret({
          parameterEnvName: sideloadSigningKeysParameterEnv,
          valueEnvName: SIDELOAD_SIGNING_KEYS_ENV,
        })
      }

      // Parse request using router
      const request = parseRouterRequest(event, { sideloadSigningKeys })

      // Branch based on request type
      if (request.type === 'og') {
        return await handleOgRequest(request, environments.source, resolvedDependencies)
      }
      if (request.type === 'sideload') {
        return await handleSideloadRequest(request, environments.sideload, resolvedDependencies)
      }
      return await handleS3Request(request, environments.source, resolvedDependencies)
    } catch (error: unknown) {
      if (error instanceof LambdaError) {
        return buildErrorResponse(error.statusCode, error.message)
      }
      return buildErrorResponse(500, 'Internal server error')
    }
  }
}

function handleS3Request(
  request: Extract<ReturnType<typeof parseRouterRequest>, { type: 's3' }>,
  config: EnvironmentConfig,
  dependencies: LambdaHandlerDependencies,
): Promise<APIGatewayProxyResult> {
  const { cacheKey, format, quality, width } = normalizeS3Request(request, config)
  const originClient = dependencies.createS3Client(config.s3_bucket_origin)

  return processImageRequest(
    request,
    config,
    format,
    width,
    quality,
    cacheKey,
    () => dependencies.fetchImageFromS3(originClient, config.s3_bucket_origin.bucket, request.key),
    dependencies,
  )
}

function handleSideloadRequest(
  request: Extract<ReturnType<typeof parseRouterRequest>, { type: 'sideload' }>,
  config: SideloadConfig,
  dependencies: LambdaHandlerDependencies,
): Promise<APIGatewayProxyResult> {
  const { cacheKey, format, quality, width } = normalizeSideloadRequest(request, config)
  return processImageRequest(
    request,
    config,
    format,
    width,
    quality,
    cacheKey,
    () => dependencies.fetchImageFromUrl(request.url, HTTP_FETCH_TIMEOUT, MAX_INPUT_IMAGE_BYTES),
    dependencies,
  )
}
