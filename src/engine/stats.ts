export type StatOrder = {
  id: string; createdAt: string; paymentMethod: string
  couponEntered: string | null; couponApplied: boolean
  lines: { qty: number; options: Record<string, number> }[]
  totals: { payable: number }
}

export const orderCount = (orders: StatOrder[]) => orders.length

export const totalRevenue = (orders: StatOrder[]) =>
  orders.reduce((s, o) => s + o.totals.payable, 0)

export function bestSellingOption(orders: StatOrder[], nameOf: (id: string) => string) {
  const units: Record<string, number> = {}
  for (const o of orders)
    for (const l of o.lines)
      for (const [id, n] of Object.entries(l.options)) units[id] = (units[id] ?? 0) + l.qty * n
  const sorted = Object.entries(units).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  if (!sorted.length) return null
  const top = sorted[0][1]
  return {
    units: top,
    leaders: sorted.filter(([, u]) => u === top).map(([id]) => ({ id, name: nameOf(id) })),
  }
}

export function revenueByPayment(orders: StatOrder[]) {
  const r: Record<string, number> = {}
  for (const o of orders) r[o.paymentMethod] = (r[o.paymentMethod] ?? 0) + o.totals.payable
  return r
}

export function averageOrderValue(orders: StatOrder[]) {
  const n = orders.length
  return n === 0 ? 0 : Math.floor((2 * totalRevenue(orders) + n) / (2 * n))
}

export const couponAppliedCount = (orders: StatOrder[]) =>
  orders.filter(o => o.couponApplied).length

export const dhakaDate = (iso: string) =>
  new Date(Date.parse(iso) + 6 * 3600_000).toISOString().slice(0, 10)

export function ordersOnDate(orders: StatOrder[], date: string) {
  const hit = orders.filter(o => dhakaDate(o.createdAt) === date)
  return { count: hit.length, ids: hit.map(o => o.id) }
}