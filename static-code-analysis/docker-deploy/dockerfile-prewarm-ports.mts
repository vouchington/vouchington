import {
  parseDockerfilePrewarmStages as parsePublished,
  type DockerfilePrewarmStage,
  type ParseDockerfilePrewarmOptions,
} from 'vouchington-tooling/dockerfile-parse'

export type { DockerfilePrewarmStage, ParseDockerfilePrewarmOptions }

export function parseDockerfilePrewarmStages(
  dockerfile: string,
  options: ParseDockerfilePrewarmOptions = {},
): DockerfilePrewarmStage[] {
  return parsePublished(dockerfile, {
    copySourcePrefix: '/prod/',
    prewarmBinary: 'node-prewarm',
    prewarmPortEnv: 'NODE_PREWARM_PORT',
    ...options,
  })
}
