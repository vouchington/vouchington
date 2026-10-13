import { fileURLToPath } from 'node:url'
import { checkFormKeyboardReference } from '../static-code-analysis/repo-file-policy/form-keyboard-reference-guard.mts'

checkFormKeyboardReference(fileURLToPath(new URL('..', import.meta.url)))
