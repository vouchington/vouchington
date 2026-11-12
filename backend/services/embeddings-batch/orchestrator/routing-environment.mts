import { getDeployEnvironment, type DeployEnvironment } from '@ts-shared/deploy-environment'

export function getVertexBatchRoutingEnvironment(): DeployEnvironment {
  const environment = process.env.ENVIRONMENT
  if (
    environment !== 'development' &&
    environment !== 'test' &&
    environment !== 'staging' &&
    environment !== 'production'
  ) {
    throw new Error('ENVIRONMENT must be development, test, staging, or production')
  }
  return getDeployEnvironment({ ENVIRONMENT: environment })
}
