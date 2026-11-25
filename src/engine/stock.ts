import type { CartItem, Group } from './types'

export type Usage = Record<string, number>

export function usageOf(item: CartItem, groups: Group[]): Usage {
  const byId = new Map(groups.flatMap(g => g.options).map(o => [o.id, o]))
  const u: Usage = {}
  for (const [oid, q] of Object.entries(item.options))
    for (const [ing, per] of Object.entries(byId.get(oid)?.uses ?? {}))
      u[ing] = (u[ing] ?? 0) + per * q * item.qty
  return u
}

export function sumUsage(items: CartItem[], groups: Group[]): Usage {
  const t: Usage = {}
  for (const it of items) for (const [k, v] of Object.entries(usageOf(it, groups))) t[k] = (t[k] ?? 0) + v
  return t
}

export function freeStock(stock: Usage, others: CartItem[], groups: Group[]): Usage {
  const used = sumUsage(others, groups)
  return Object.fromEntries(Object.entries(stock).map(([k, v]) => [k, v - (used[k] ?? 0)]))
}

export function shortages(need: Usage, free: Usage): Usage {
  const s: Usage = {}
  for (const [k, n] of Object.entries(need)) {
    if (!(k in free)) continue 
    if (n > free[k]) s[k] = n - free[k]
  }
  return s
}

export const shortText = (s: Usage) =>
  Object.keys(s).length ? 'Short: ' + Object.entries(s).map(([k, v]) => `${v} ${k}`).join(', ') : ''

export function remainingFor(optionId: string, current: CartItem, others: CartItem[],
  stock: Usage, groups: Group[]): number {
  const opt = groups.flatMap(g => g.options).find(o => o.id === optionId)!
  const free = freeStock(stock, others, groups)
  const cur = usageOf(current, groups)
  let n = Infinity
  for (const [ing, per] of Object.entries(opt.uses)) {
    if (!(ing in free)) continue
    n = Math.min(n, Math.floor((free[ing] - (cur[ing] ?? 0)) / (per * current.qty)))
  }
  return Math.max(0, n)
}