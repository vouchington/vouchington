import type { Job, Workflow } from '../workflow-area-coverage-model.mts'

type Mutation = {
  name: string
  mutate: (documents: Record<string, Workflow>) => void
  violations: string[]
}
const backend = (documents: Record<string, Workflow>): Record<string, Job> =>
  documents['.github/workflows/backend.yml']!.jobs!
/** Each mutation names an independently literal regression expectation. */
export const areaCoverageMutations: Mutation[] = [
  {
    name: 'coverage area input',
    mutate: d => {
      backend(d).coverage!.with = { area: 'wrong' }
    },
    violations: ['backend: coverage inputs equal its area'],
  },
  {
    name: 'producer publication',
    mutate: d => {
      backend(d).first!.with!.publish_coverage = false
    },
    violations: ['backend: every producer publishes coverage'],
  },
  {
    name: 'coverage dependencies',
    mutate: d => {
      backend(d).coverage!.needs = ['first']
    },
    violations: ['backend: coverage needs every producer'],
  },
  {
    name: 'upload dependencies',
    mutate: d => {
      backend(d).codecov!.needs = ['first']
    },
    violations: ['backend: Codecov needs every producer and selection'],
  },
  {
    name: 'gate dependency',
    mutate: d => {
      backend(d).backend!.needs = []
    },
    violations: ['backend: required gate needs patch coverage'],
  },
  {
    name: 'informational upload dependency',
    mutate: d => {
      backend(d).backend!.needs = ['coverage', 'codecov']
    },
    violations: ['backend: required gate does not need informational Codecov'],
  },
  {
    name: 'upload OIDC',
    mutate: d => {
      backend(d).codecov!.permissions = {}
    },
    violations: ['backend: Codecov gets OIDC'],
  },
  {
    name: 'fork eligibility',
    mutate: d => {
      backend(d).codecov!.if += ' && trusted-secret-context'
    },
    violations: ['backend: Codecov remains eligible for forks'],
  },
  {
    name: 'patch OIDC',
    mutate: d => {
      backend(d).coverage!.permissions = { 'id-token': 'write' }
    },
    violations: ['backend: patch coverage has no OIDC'],
  },
  {
    name: 'tooling bounds-only selection',
    mutate: d => {
      d['.github/workflows/tooling.yml']!.jobs!.codecov!.if = '!cancelled()'
    },
    violations: ['tooling: skip uploads when only bounds runs'],
  },
  {
    name: 'producer success inventory',
    mutate: d => {
      backend(d).codecov!.if =
        "needs.first.result == 'success' || needs.changes.result == 'success'"
    },
    violations: ['backend: Codecov success clause names exactly the LCOV producers'],
  },
  {
    name: 'PR-only patch check',
    mutate: d => {
      backend(d).coverage!.if = '!cancelled()'
    },
    violations: ['backend: patch coverage runs on uncancelled pull requests'],
  },
  {
    name: 'merge-group patch check',
    mutate: d => {
      backend(d).coverage!.if += ' && merge_group'
    },
    violations: ['backend: patch coverage excludes merge groups'],
  },
  {
    name: 'event-independent uploads',
    mutate: d => {
      backend(d).codecov!.if += " && github.event_name == 'pull_request'"
    },
    violations: ['backend: uploads are independent of event name'],
  },
  {
    name: 'invalid flags',
    mutate: d => {
      backend(d).codecov!.with!.uploads = '[{"flag":"Upper","pattern":"lcov-full-backend*"}]'
    },
    violations: ['uploads: flags use lowercase hyphenated names'],
  },
  {
    name: 'duplicate flags',
    mutate: d => {
      backend(d).codecov!.with!.uploads = '[{"flag":"web","pattern":"lcov-full-backend*"}]'
    },
    violations: ['uploads: flags are globally unique'],
  },
  {
    name: 'unused upload pattern',
    mutate: d => {
      backend(d).codecov!.with!.uploads =
        '[{"flag":"backend","pattern":"lcov-full-backend*"},{"flag":"unused","pattern":"never"}]'
    },
    violations: ['backend: every upload pattern matches an artifact'],
  },
  {
    name: 'absent upload patterns',
    mutate: d => {
      backend(d).codecov!.with!.uploads = '[]'
    },
    violations: [
      'backend: each LCOV artifact matches exactly one upload',
      'uploads: artifacts match exactly one pattern across areas',
    ],
  },
  {
    name: 'overlapping global upload patterns',
    mutate: d => {
      backend(d).codecov!.with!.uploads = '[{"flag":"backend","pattern":"lcov-full-*"}]'
    },
    violations: ['uploads: artifacts match exactly one pattern across areas'],
  },
  {
    name: 'wildcard producer success',
    mutate: d => {
      backend(d).codecov!.if += " && contains(needs.*.result, 'success')"
    },
    violations: ['backend: no wildcard needs success'],
  },
  {
    name: 'wrong result gate identity',
    mutate: d => {
      const { backend: gate, ...others } = backend(d)
      d['.github/workflows/backend.yml']!.jobs = { ...others, wrong: gate! }
    },
    violations: ['backend: exactly its required result gate'],
  },
]
