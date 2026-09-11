import Template from './data-export-ready.tsx'
import type { DataExportReadyEmailProps, EmailRenderResultPromise } from './types.mts'
export function renderDataExportReadyEmail(
  props: DataExportReadyEmailProps,
): EmailRenderResultPromise {
  return Template.render(props)
}
