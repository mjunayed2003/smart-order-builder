export const mulDivHalfUp = (amount: number, num: number, den = 100) =>
  Math.floor((2 * amount * num + den) / (2 * den))
export const roundToTaka = (poisha: number) => Math.floor((poisha + 50) / 100) * 100
export const fmt = (poisha: number) => (poisha / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })