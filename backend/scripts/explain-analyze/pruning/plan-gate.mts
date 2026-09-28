interface PlanNode {
  'Node Type'?: string
  'Relation Name'?: string
  'Actual Loops'?: number
  Plans?: PlanNode[]
}

export interface PruningGateInput {
  label: string
  plan: { Plan?: PlanNode }
  parent: string
  allLeaves: readonly string[]
  expectedLeaves: readonly string[]
}

export function executingPartitionLeaves(
  plan: PruningGateInput['plan'],
  leaves: readonly string[],
): string[] {
  const known = new Set(leaves)
  const executed = new Set<string>()
  function visit(node: PlanNode): void {
    if (
      node['Relation Name'] &&
      known.has(node['Relation Name']) &&
      node['Node Type']?.endsWith('Scan') &&
      (node['Actual Loops'] ?? 0) > 0
    ) {
      executed.add(node['Relation Name'])
    }
    for (const child of node.Plans ?? []) visit(child)
  }
  if (plan.Plan) visit(plan.Plan)
  return [...executed].toSorted()
}

export function assertExecutingPrunedLeaves(input: PruningGateInput): string[] {
  const actual = executingPartitionLeaves(input.plan, input.allLeaves)
  const expected = [...new Set(input.expectedLeaves)].toSorted()
  if (input.allLeaves.length < 3 || expected.some(leaf => !input.allLeaves.includes(leaf))) {
    throw new Error(`${input.label}: ${input.parent} lacks two ranges plus default fixtures`)
  }
  if (actual.length !== expected.length || actual.some((leaf, index) => leaf !== expected[index])) {
    throw new Error(
      `${input.label}: ${input.parent} executed leaves [${actual.join(', ')}], expected [${expected.join(', ')}]`,
    )
  }
  return actual
}
