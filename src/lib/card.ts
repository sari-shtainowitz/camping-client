// Mock credit-card checks for the demo payment screen. Nothing here talks to a
// payment provider, and nothing is ever stored: the checkout page keeps the raw
// values in component state only and keeps just the last 4 digits for the receipt.

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, '')
}

/** "4242424242424242" -> "4242 4242 4242 4242" (max 19 digits). */
export function formatCardNumber(value: string): string {
  return digitsOnly(value)
    .slice(0, 19)
    .replace(/(\d{4})(?=\d)/g, '$1 ')
}

/** "1228" -> "12/28" while typing. */
export function formatExpiry(value: string): string {
  const d = digitsOnly(value).slice(0, 4)
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d
}

/** Luhn (mod 10) checksum. */
export function luhnValid(cardNumber: string): boolean {
  const d = digitsOnly(cardNumber)
  if (d.length < 13 || d.length > 19) return false
  let sum = 0
  let double = false
  for (let i = d.length - 1; i >= 0; i--) {
    let n = d.charCodeAt(i) - 48
    if (double) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    double = !double
  }
  return sum % 10 === 0
}

/** MM/YY that is a real month and not before the current month. */
export function expiryValid(value: string, now: Date = new Date()): boolean {
  const m = /^(\d{2})\/(\d{2})$/.exec(value.trim())
  if (!m) return false
  const month = Number(m[1])
  const year = 2000 + Number(m[2])
  if (month < 1 || month > 12) return false
  // A card is valid through the last day of its expiry month.
  const thisMonth = now.getFullYear() * 12 + now.getMonth()
  return year * 12 + (month - 1) >= thisMonth
}

export function cvvValid(value: string): boolean {
  return /^\d{3}$/.test(value)
}

export function holderValid(value: string): boolean {
  return value.trim().length >= 2
}

export function cardBrand(cardNumber: string): string | null {
  const d = digitsOnly(cardNumber)
  if (/^4/.test(d)) return 'Visa'
  if (/^(5[1-5]|2[2-7])/.test(d)) return 'Mastercard'
  if (/^3[47]/.test(d)) return 'American Express'
  return null
}

export function lastFour(cardNumber: string): string {
  return digitsOnly(cardNumber).slice(-4)
}
