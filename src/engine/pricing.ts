
import type { CartItem, Group } from './types'
import { mulDivHalfUp, roundToTaka } from './money'

export type Menu = { basePrice: number; groups: Group[] }
export type Promos = {
  extrasDeal: { groupId: string; every: number }
  combo: { eggsGroup: string; minEggs: number; proteinGroup: string; minProtein: number; percent: number }
  cartDiscounts: { c1: { minSubtotal: number; off: number }
    c2: { code: string; percent: number; cap: number; beforeMinutesDhaka: number } }
  vatPercent: number
}
export type PriceResult = {
  lines: { unitPrice: number; qty: number; total: number }[]
  subtotal: number; discount: { type: 'C1' | 'C2' | null; amount: number }
  couponRejected: boolean; discounted: number; vat: number; payable: number
}

const groupQty = (g: Group, c: Record<string, number>) => g.options.reduce((s, o) => s + (c[o.id] ?? 0), 0)

export function unitPrice(options: Record<string, number>, menu: Menu, promos: Promos): number {
  const all = menu.groups.flatMap(g => g.options)
  let u = menu.basePrice
  for (const o of all) u += o.price * (options[o.id] ?? 0)                 

  const ex = menu.groups.find(g => g.id === promos.extrasDeal.groupId)       
  if (ex) {
    const prices: number[] = []
    for (const o of ex.options) for (let i = 0; i < (options[o.id] ?? 0); i++) prices.push(o.price)
    prices.sort((a, b) => a - b)
    const free = Math.floor(prices.length / promos.extrasDeal.every)
    u -= prices.slice(0, free).reduce((s, p) => s + p, 0)
  }
  const cb = promos.combo                                                    
  const eg = menu.groups.find(g => g.id === cb.eggsGroup), pr = menu.groups.find(g => g.id === cb.proteinGroup)
  if (eg && pr && groupQty(eg, options) >= cb.minEggs && groupQty(pr, options) >= cb.minProtein)
    u -= mulDivHalfUp(u, cb.percent)
  return u
}

const dhakaMsOfDay = (ms: number) => (((ms + 6 * 3600_000) % 86_400_000) + 86_400_000) % 86_400_000

export function priceCart(cart: CartItem[], menu: Menu, promos: Promos, serverTime: number,
  couponCode?: string | null): PriceResult {
  const lines = cart.map(it => { const up = unitPrice(it.options, menu, promos)
    return { unitPrice: up, qty: it.qty, total: up * it.qty } }) 
  const subtotal = lines.reduce((s, l) => s + l.total, 0)

  const { c1, c2 } = promos.cartDiscounts                                    
  const d1 = subtotal >= c1.minSubtotal ? c1.off : 0
  const couponGiven = !!couponCode && couponCode === c2.code
  const couponValid = couponGiven && dhakaMsOfDay(serverTime) < c2.beforeMinutesDhaka * 60_000
  const d2 = couponValid ? Math.min(mulDivHalfUp(subtotal, c2.percent), c2.cap) : 0
  const discount = d2 > d1 ? { type: 'C2' as const, amount: d2 }
    : d1 > 0 ? { type: 'C1' as const, amount: d1 } : { type: null, amount: 0 } 

  const discounted = subtotal - discount.amount  
  const vat = mulDivHalfUp(discounted, promos.vatPercent)
  return { lines, subtotal, discount, couponRejected: couponGiven && !couponValid,
    discounted, vat, payable: roundToTaka(discounted + vat) }
}