import type { WorkflowCallEdge, WorkflowJobNode, WorkflowNode, WorkflowTopology } from 'no-mistakes'

const DEFAULT_PERMISSIONS = {
  source: 'default' as const,
  scopes: {},
  assumed_default: true,
}

export function makeJob(overrides: Partial<WorkflowJobNode> & { id: string }): WorkflowJobNode {
  const [idWorkflow, idKey] = overrides.id.split('#')
  return {
    workflowId: idWorkflow ?? '.github/workflows/synthetic.yml',
    key: idKey ?? 'job',
    kind: 'job',
    steps: [],
    permissions: DEFAULT_PERMISSIONS,
    ...overrides,
  }
}

export function makeWorkflow(
  overrides: Omit<Partial<WorkflowNode>, 'callable' | 'workflowCall'> & {
    id: string
    path?: string
    callable?: boolean
  },
): WorkflowNode {
  const path = overrides.path ?? overrides.id
  const { callable, ...rest } = overrides
  if (callable === true) {
    return {
      name: path,
      triggers: [{ event: 'workflow_call' }],
      jobIds: [],
      ...rest,
      path,
      callable: true,
      workflowCall: { inputs: {}, secrets: {}, outputs: {} },
    }
  }
  return {
    name: path,
    triggers: [],
    jobIds: [],
    ...rest,
    path,
    callable: false,
  }
}

export function makeTopology(overrides: Partial<WorkflowTopology> = {}): WorkflowTopology {
  return {
    schemaVersion: 1,
    workflows: [],
    jobs: [],
    edges: [],
    diagnostics: [],
    ...overrides,
  }
}

export function makeCallEdge(
  from: string,
  to: string,
  overrides: Partial<WorkflowCallEdge> = {},
): WorkflowCallEdge {
  return {
    kind: 'calls',
    from,
    to,
    target: to,
    local: true,
    bindings: { inputs: {}, secrets: { mode: 'inherit' } },
    ...overrides,
  }
}
