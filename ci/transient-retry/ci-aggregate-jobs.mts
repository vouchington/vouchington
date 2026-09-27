// Area workflows expose one required gate. Required coverage checks and informational Codecov
// uploads are not fan-ins: their real failures must not be hidden by an unrelated leaf failure.
const areaGateByWorkflow = new Map([
  ['Static', 'static'],
  ['Backend', 'backend'],
  ['Web', 'web'],
  ['Cloudflare Worker', 'cloudflare-worker'],
  ['Lambdas', 'lambdas'],
  ['Tooling', 'tooling'],
])

export function isAreaGateJob(workflowName: string, jobName: string): boolean {
  return areaGateByWorkflow.get(workflowName) === jobName
}
