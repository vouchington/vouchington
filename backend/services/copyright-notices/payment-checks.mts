/** Luhn check for a candidate payment-card number; separators are ignored. */
export function isValidCardNumber(candidate: string): boolean {
  const digits = candidate.replaceAll(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false
  let sum = 0
  let double = false
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let digit = Number(digits[index])
    if (double) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
    double = !double
  }
  return sum % 10 === 0
}

/** ISO 13616 length and mod-97 check for a candidate IBAN; spaces are ignored. */
export function isValidIban(candidate: string): boolean {
  const iban = candidate.replaceAll(' ', '')
  if (iban.length < 15 || iban.length > 34) return false
  let remainder = 0
  for (const character of `${iban.slice(4)}${iban.slice(0, 4)}`) {
    const value = character <= '9' ? character : String(character.charCodeAt(0) - 55)
    for (const digit of value) remainder = (remainder * 10 + Number(digit)) % 97
  }
  return remainder === 1
}
