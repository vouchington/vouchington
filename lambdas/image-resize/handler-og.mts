import type { APIGatewayProxyResult } from 'aws-lambda'
import type { EnvironmentConfig } from './config.mts'
import type { ParsedOgRequest } from './request/parse-og.mts'
import { buildResponse } from './response/index.mts'
import { renderOgImage, type OgRenderDependencies } from './og/render.mts'

// OG requests read avatars from the same images-origin bucket /images/*
// already reads from (config.s3_bucket_origin), so this reuses
// EnvironmentConfig rather than introducing a third, redundant config
// parameter to createLambdaHandler.
export async function handleOgRequest(
  request: ParsedOgRequest,
  config: EnvironmentConfig,
  dependencies: OgRenderDependencies,
): Promise<APIGatewayProxyResult> {
  const png = await renderOgImage(request.params, config, dependencies)
  return buildResponse(200, png, 'png')
}
