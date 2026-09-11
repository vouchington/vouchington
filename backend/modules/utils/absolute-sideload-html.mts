import { getImageOrigin } from './image-origin.mts'

const RELATIVE_SIDELOAD_SRC = 'src="/sideload/'

export function absolutizeSideloadImageSources(
  html: string,
  imageOrigin: string = getImageOrigin(),
): string {
  return html.replaceAll(RELATIVE_SIDELOAD_SRC, `src="${imageOrigin}/sideload/`)
}
