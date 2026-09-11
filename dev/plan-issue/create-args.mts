export function buildPlanIssueCreateArgs(
  title: string,
  bodyFile: string,
  labels: string[],
  repo?: string,
): string[] {
  const uniqueLabels = ['plan', ...labels.filter(label => label !== 'plan')].filter(
    (label, index, all) => all.indexOf(label) === index,
  )
  return [
    'issue',
    'create',
    ...(repo === undefined ? [] : ['--repo', repo]),
    '--title',
    title,
    '--body-file',
    bodyFile,
    ...uniqueLabels.flatMap(label => ['--label', label]),
  ]
}
