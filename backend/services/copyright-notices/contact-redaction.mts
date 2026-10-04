// Preserve legal references and URLs before considering phone-shaped numeric text.
const preservedText = [
  String.raw`(?:https?:\/\/|www\.)[^\s<>]+`,
  String.raw`\b\d{4}-\d{2}-\d{2}\b`,
  String.raw`\b\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}\b`,
  String.raw`\b\d+:\d{2}-[a-z]+-\d+(?:-[a-z\d]+)*\b`,
  String.raw`\b(?:case|docket|claim)\s+(?:(?:number|no\.)\s*)?#?\s*[a-z\d]+(?:[-:/][a-z\d]+)*\b`,
].join('|')
const emailAddress = String.raw`(?<![\w.+-])[\w.!#$%&'*+/=?^\x60{|}~-]+@[a-z\d](?:[a-z\d.-]*[a-z\d])?\.[a-z]{2,}(?![\w-])`
const phoneNumber = [
  String.raw`(?<![\w])(?:\+?\d{1,3}[ .-])?(?:\(\d{2,4}\)|\d{2,4})[ .-]?\d{3,4}[ .-]\d{3,4}(?![\w])`,
  String.raw`(?<![\w])\d{3}[-.]\d{4}(?![\w])`,
  String.raw`(?<![\w])(?:\+\d{8,15}|\d{10})(?![\w])`,
].join('|')
const contactOrPreservedText = new RegExp(
  `(${preservedText})|(${emailAddress})|(${phoneNumber})`,
  'gi',
)

/** Strip contact details before sanitizing or hashing external filing text. */
export function stripContactDetails(text: string): string {
  return text.replace(
    contactOrPreservedText,
    (match: string, preserved: string | undefined, email: string | undefined) => {
      if (preserved) return match
      return email ? '[email removed]' : '[phone removed]'
    },
  )
}
