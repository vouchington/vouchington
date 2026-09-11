import {
  parseDockerfileRuntimeImages as parsePublished,
  type DockerfileRuntimeImage,
  type ParseDockerfileRuntimeImagesOptions,
} from 'vouchington-tooling/dockerfile-parse'

export type { DockerfileRuntimeImage, ParseDockerfileRuntimeImagesOptions }

export function parseDockerfileRuntimeImages(
  dockerfile: string,
  options: ParseDockerfileRuntimeImagesOptions,
): DockerfileRuntimeImage[] {
  return parsePublished(dockerfile, { copySourcePrefix: '/prod/', ...options })
}
