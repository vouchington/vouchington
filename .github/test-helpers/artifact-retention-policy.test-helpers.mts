// Shared by artifact-retention-policy.test.mts; extracted to stay under the 300-line Vitest
// test-file cap (same rationale as coverage-summary.test-helpers.mts in this directory).
import {
  Document,
  YAMLMap,
  isAlias,
  isMap,
  isPair,
  isScalar,
  isSeq,
  parseDocument,
  visit,
} from 'yaml'

export type UploadArtifactBlock = {
  retentionValue: unknown
  artifactName: unknown
  overwriteValue: unknown
  requiresOverwrite: boolean
  stepSource: string
}

const UPLOAD_ARTIFACT_ACTION = 'actions/upload-artifact'
const UPLOAD_ARTIFACT_MERGE_ACTION = 'actions/upload-artifact/merge'

// GitHub resolves an action reference's owner/repository case-insensitively (only the ref after
// `@` is case-sensitive), so `Actions/Upload-Artifact@v7` is the same action as the lowercase form.
function actionPath(uses: unknown): string | undefined {
  if (typeof uses !== 'string') return undefined
  const separatorIndex = uses.indexOf('@')
  return separatorIndex === -1 ? undefined : uses.slice(0, separatorIndex).toLowerCase()
}

function isUploadArtifactRef(uses: unknown): boolean {
  const path = actionPath(uses)
  return path === UPLOAD_ARTIFACT_ACTION || path === UPLOAD_ARTIFACT_MERGE_ACTION
}

// The official merge sub-action produces/exposes an artifact with its own retention-days and name
// inputs but, unlike the base action, has no `overwrite` input at all — it must never be held to
// the repo-wide overwrite:true requirement.
function isBaseUploadArtifactRef(uses: unknown): boolean {
  return actionPath(uses) === UPLOAD_ARTIFACT_ACTION
}

// Any node reached while walking a step — `uses:`, the `with:` mapping itself, or one of its
// inputs — can independently be an Alias (e.g. `with: *upload-inputs`, or `retention-days: *one`
// pointing at an anchor on an earlier input's scalar) even when the surrounding step map is not
// aliased as a whole. Resolve through the document before checking the node's own type.
function resolveAliasNode(node: unknown, document: Document): unknown {
  return isAlias(node) ? node.resolve(document) : node
}

// The Actions toolkit's getInput() trims surrounding whitespace before an action reads a `with:`
// input, so a policy-compliant ' 1 '/' true '/' name ' must compare equal to its untrimmed form.
function resolvedScalarValue(node: unknown, document: Document): unknown {
  const resolved = resolveAliasNode(node, document)
  if (!isScalar(resolved)) return undefined
  return typeof resolved.value === 'string' ? resolved.value.trim() : resolved.value
}

function resolvedMap(node: unknown, document: Document): YAMLMap | undefined {
  const resolved = resolveAliasNode(node, document)
  return isMap(resolved) ? resolved : undefined
}

// The runner uppercases a `with:` input's key into `INPUT_<NAME>` before the action reads it via
// getInput(), so `Retention-Days` and `retention-days` reach the action as the same input — and a
// mapping key can itself be an Alias (`*uses-key: value`), which `YAMLMap.get()` cannot look up by
// string at all. Read `.items` directly and resolve + compare each key by hand instead.
function lookupPair(map: YAMLMap | undefined, name: string, document: Document): unknown {
  if (!map) return undefined
  const target = name.toLowerCase()
  for (const pair of map.items) {
    const key = resolvedScalarValue(pair.key, document)
    if (typeof key === 'string' && key.toLowerCase() === target) return pair.value
  }
  return undefined
}

// A Map is a real workflow/composite-action step only when it is a direct element of a `steps:`
// sequence — otherwise a nested `with:` input that happens to be named `uses` (e.g. a wrapper
// action taking an action reference as a parameter) would be misclassified as an upload step.
function isStepsSequenceElement(path: readonly unknown[]): boolean {
  const seq = path[path.length - 1]
  const pair = path[path.length - 2]
  return isSeq(seq) && isPair(pair) && isScalar(pair.key) && pair.key.value === 'steps'
}

// `steps: *upload-steps` puts an Alias directly as the `steps:` pair's value — a distinct shape
// from `- *upload` (an alias for one sequence element, handled by isStepsSequenceElement above).
function isStepsPairValue(path: readonly unknown[]): boolean {
  const pair = path[path.length - 1]
  return isPair(pair) && isScalar(pair.key) && pair.key.value === 'steps'
}

// Shared by the Map and Alias visitors below: an aliased step (`- *upload`) resolves to the same
// kind of step map as a literal one, so both extract identically once resolved to a YAMLMap.
function collectUploadArtifactBlock(
  blocks: UploadArtifactBlock[],
  step: YAMLMap,
  source: string,
  document: Document,
): void {
  const uses = resolvedScalarValue(lookupPair(step, 'uses', document), document)
  if (!isUploadArtifactRef(uses)) return
  if (!step.range) throw new Error('Upload-artifact step has no source range')

  const withInputs = resolvedMap(lookupPair(step, 'with', document), document)
  const retention = lookupPair(withInputs, 'retention-days', document)
  const name = lookupPair(withInputs, 'name', document)
  const overwrite = lookupPair(withInputs, 'overwrite', document)
  blocks.push({
    // Compare the parsed scalar value, not its raw source text, so a quoted `'1'`/`"1"` is
    // treated identically to a bare `1` — GitHub Actions accepts every `with:` input as a
    // string regardless of YAML quoting.
    retentionValue: resolvedScalarValue(retention, document),
    // Read from the parsed AST, not by rescanning stepSource text, so an earlier decoy
    // `uses:`/`name:` pair inside an unrelated multiline value (e.g. an `env:` block scalar)
    // can never be picked up in place of the step's real `with.name`. Kept as the raw scalar
    // value (not coerced to string here) so a non-string name like `123` normalizes the same
    // way retentionValue does, instead of being rejected.
    artifactName: resolvedScalarValue(name, document),
    // Same reasoning as retentionValue: compare the parsed value so a quoted `'true'` matches
    // the bare boolean form instead of requiring an exact `overwrite: true` source substring.
    overwriteValue: resolvedScalarValue(overwrite, document),
    requiresOverwrite: isBaseUploadArtifactRef(uses),
    stepSource: source.slice(step.range[0], step.range[2]),
  })
}

// Scoped deliberately to actions/upload-artifact steps' `with.retention-days` input, not every
// `retention-days:` line repo-wide: that is the exact input GitHub Actions reads, so any other
// action's same-named key (or a decoy inside a multiline string) is not a real retention setting.
export function uploadArtifactBlocks(source: string): UploadArtifactBlock[] {
  const document = parseDocument(source)
  if (document.errors.length > 0) throw document.errors[0]

  const blocks: UploadArtifactBlock[] = []
  visit(document, {
    Map(_, step, path) {
      if (!isStepsSequenceElement(path)) return
      collectUploadArtifactBlock(blocks, step, source, document)
    },
    // An anchored step inserted into `steps:` as `- *upload` is an Alias node at that position,
    // not a Map — visiting only the anchor's definition site would miss it whenever the anchor is
    // declared outside any `steps:` sequence (e.g. under a shared templates key), letting an
    // aliased upload with omitted or expression-based retention bypass the policy entirely.
    Alias(_, alias, path) {
      if (isStepsSequenceElement(path)) {
        const resolved = alias.resolve(document)
        if (isMap(resolved)) collectUploadArtifactBlock(blocks, resolved, source, document)
        return
      }
      // `steps: *upload-steps` replaces the whole sequence, not one element — the anchor is
      // typically declared outside any `steps:` field (e.g. as reusable matrix data), so its
      // step maps are never otherwise visited at a path this Map visitor recognizes.
      if (isStepsPairValue(path)) {
        const resolved = alias.resolve(document)
        if (!isSeq(resolved)) return
        for (const item of resolved.items) {
          const step = resolvedMap(item, document)
          if (step) collectUploadArtifactBlock(blocks, step, source, document)
        }
      }
    },
  })
  return blocks
}

export function invalidRetentionBlocks(source: string): UploadArtifactBlock[] {
  return uploadArtifactBlocks(source).filter(block => String(block.retentionValue) !== '1')
}

export function artifactNameFromBlock(block: UploadArtifactBlock): string {
  if (block.artifactName == null) {
    throw new Error(`No artifact name found in upload-artifact block:\n${block.stepSource}`)
  }
  return String(block.artifactName).replace(/\$\{\{[^}]*\}\}/g, 'INTERPOLATED')
}
