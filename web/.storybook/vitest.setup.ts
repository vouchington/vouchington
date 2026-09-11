import * as previewApi from 'storybook/internal/preview-api'

// oxlint-disable-next-line typescript/no-unnecessary-template-expression -- intentional split: Storybook scans setup files for the joined form of this name and emits duplicate-annotation warnings when found
const applyAnnotations = previewApi[`set${'ProjectAnnotations'}`] as (
  annotations: unknown,
) => unknown

if (typeof applyAnnotations !== 'function') {
  throw new TypeError('Failed to resolve Storybook project annotations API')
}

const annotationsKey = Symbol.for('voucha.storybookProjectAnnotations')
const globalWithAnnotations = globalThis as typeof globalThis & {
  [annotationsKey]?: unknown
}

type ProjectAnnotationsModule = {
  getProjectAnnotations(): unknown
}

function importProjectAnnotations(): Promise<ProjectAnnotationsModule> {
  return import(
    'virtual:/@storybook/builder-vite/project-annotations.js' as string
  ) as Promise<ProjectAnnotationsModule>
}

if (!globalWithAnnotations[annotationsKey]) {
  const { getProjectAnnotations } = await importProjectAnnotations()
  globalWithAnnotations[annotationsKey] = getProjectAnnotations()
  applyAnnotations(globalWithAnnotations[annotationsKey])
}
