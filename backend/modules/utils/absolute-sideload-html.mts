import { CURRENT_SIDELOAD_PATH_PREFIX } from '@ts-shared/url-signing'
import { getImageOrigin } from './image-origin.mts'

const RELATIVE_SIDELOAD_SRC = `src="${CURRENT_SIDELOAD_PATH_PREFIX}`

export function absolutizeSideloadImageSources(
  html: string,
  imageOrigin: string = getImageOrigin(),
): string {
  return html.replaceAll(
    RELATIVE_SIDELOAD_SRC,
    `src="${imageOrigin}${CURRENT_SIDELOAD_PATH_PREFIX}`,
  )
}
