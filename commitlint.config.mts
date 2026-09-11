export default {
  extends: ['@commitlint/config-conventional'],
  parserPreset: {
    parserOpts: {
      headerPattern:
        /^(?:(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\p{Emoji_Modifier}|\uFE0E|\uFE0F)*(?:\u200D(?:\p{Emoji_Presentation}|\p{Extended_Pictographic})(?:\p{Emoji_Modifier}|\uFE0E|\uFE0F)*)*\s+)?(\w*)(?:\((.*)\))?!?: (.*)$/u,
      headerCorrespondence: ['type', 'scope', 'subject'],
    },
  },
  rules: {
    'header-max-length': [0], // Disabled to allow long dependency bump PR titles
    'subject-case': [0], // Disabled to allow acronyms like "LLM" in PR titles
    'body-max-line-length': [0], // Disabled to allow long Co-authored-by trailers
  },
}
