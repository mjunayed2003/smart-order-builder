import menuJson from '../../public/menu.json'
import seedJson from '../../public/orders.seed.json'
import { priceCart, type Menu, type Promos } from '../engine/pricing'
import { freeStock, shortages, usageOf, type Usage } from '../engine/stock'
import type { CartItem, Counts, Group, Rule } from '../engine/types'

const M = menuJson as unknown as {
  product: { id: string; name: string; basePrice: number }
  groups: Group[]; rules: Rule[]; stock: Usage; promos: Promos
}
export const MENU_JSON = menuJson
export const GROUPS = M.groups
export const RULES = M.rules
export const PROMOS = M.promos
export const PRICING_MENU: Menu = { basePrice: M.product.basePrice, groups: M.groups }

export const CLOCK_SKEW_MS = 90_000
export const RESERVATION_MS = 5 * 60_000
export const serverNow = () => Date.now() + CLOCK_SKEW_MS
export const toDhakaIso = (ms: number) =>
  new Date(ms + 6 * 3600_000).toISOString().replace('Z', '+06:00')

export type StoredItem = {
  id: string; qty: number; options: Counts
  reservedAt: number; expiresAt: number; expired: boolean
}
export type Order = {
  id: string; createdAt: string; paymentMethod: string
  couponEntered: string | null; couponApplied: boolean
  couponRejectedReason: 'invalid_code' | 'expired' | 'not_better' | null
  lines: { qty: number; options: Counts; unitPrice: number; total: number }[]
  totals: { subtotal: number; discountType: 'C1' | 'C2' | null; discount: number
    discounted: number; vat: number; payable: number }
  currencyUnit: 'poisha'
}
type Cached = { status: number; body: unknown }
export type ServerState = {
  items: StoredItem[]; sold: Usage; orders: Order[]
  idem: Record<string, Cached>; version: number
}

export function buildOrder(id: string, createdAt: string, paymentMethod: string,
  couponCode: string | null, lines: CartItem[]): Order {
  const r = priceCart(lines, PRICING_MENU, PROMOS, Date.parse(createdAt), couponCode)
  const applied = r.discount.type === 'C2'
  let reason: Order['couponRejectedReason'] = null
  if (couponCode && !applied) {
    if (couponCode !== PROMOS.cartDiscounts.c2.code) reason = 'invalid_code'
    else if (r.couponRejected) reason = 'expired'
    else reason = 'not_better'
  }
  return {
    id, createdAt, paymentMethod, couponEntered: couponCode || null,
    couponApplied: applied, couponRejectedReason: reason,
    lines: lines.map((l, i) => ({ qty: l.qty, options: l.options,
      unitPrice: r.lines[i].unitPrice, total: r.lines[i].total })),
    totals: { subtotal: r.subtotal, discountType: r.discount.type, discount: r.discount.amount,
      discounted: r.discounted, vat: r.vat, payable: r.payable },
    currencyUnit: 'poisha',
  }
}

const KEY = 'sob-server-v1'
let state: ServerState | null = null

function fresh(): ServerState {
  const seed = seedJson as { orders: { id: string; createdAt: string; paymentMethod: string
    couponCode: string | null; lines: CartItem[] }[] }
  const s: ServerState = {
    items: [], sold: {}, idem: {}, version: 1,
    orders: seed.orders.map(o => buildOrder(o.id, o.createdAt, o.paymentMethod, o.couponCode, o.lines)),
  }
  save(s)
  return s
}
function save(s: ServerState) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* ignore */ } }

export function getState(): ServerState {
  if (!state) {
    try { const raw = localStorage.getItem(KEY); state = raw ? JSON.parse(raw) : fresh() }
    catch { state = fresh() }
  }
  return state!
}
export function commit(next: ServerState) { next.version += 1; state = next; save(next) }
export function resetState() { try { localStorage.removeItem(KEY) } catch { /* */ } state = null }

export function sweep() {
  const s = getState(), now = serverNow()
  let changed = false
  for (const it of s.items) if (!it.expired && now >= it.expiresAt) { it.expired = true; changed = true }
  if (changed) { s.version += 1; save(s) }
}
export const activeItems = (s: ServerState) => s.items.filter(i => !i.expired)

export function freeFor(s: ServerState, excludeId?: string): Usage {
  const base: Usage = Object.fromEntries(
    Object.entries(M.stock).map(([k, v]) => [k, v - (s.sold[k] ?? 0)]))
  const others = activeItems(s).filter(i => i.id !== excludeId)
  return freeStock(base, others, GROUPS)
}
export const needOf = (item: CartItem) => usageOf(item, GROUPS)
export { shortages }

export function sanitize(options: Counts): Counts {
  const known = new Set(GROUPS.flatMap(g => g.options.map(o => o.id)))
  const out: Counts = {}
  for (const [k, v] of Object.entries(options ?? {}))
    if (known.has(k) && Number.isInteger(v) && v > 0) out[k] = v
  return out
}

export const chaos = { failNext: false }