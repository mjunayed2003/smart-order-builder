import seedJson from '../../public/orders.seed.json'
import { buildOrder } from '../mocks/serverState'
import * as S from '../engine/stats'
import { runTool } from '../assistant/tools'

const seed = seedJson as unknown as { orders: { id: string; createdAt: string; paymentMethod: string
  couponCode: string | null; lines: { qty: number; options: Record<string, number> }[] }[] }
const orders = seed.orders.map(o => buildOrder(o.id, o.createdAt, o.paymentMethod, o.couponCode, o.lines))
const nameOf = (id: string) => id

test('count and revenue', () => {
  expect(S.orderCount(orders)).toBe(6)
  expect(S.totalRevenue(orders)).toBe(orders.reduce((s, o) => s + o.totals.payable, 0))
})
test('best seller by units (line qty x option qty)', () => {
  const b = S.bestSellingOption(orders, nameOf)!
  expect(b.leaders.map(l => l.id)).toEqual(['fried'])
  expect(b.units).toBe(10)
})
test('revenue by payment adds up to total', () => {
  const r = S.revenueByPayment(orders)
  expect(Object.values(r).reduce((a, b) => a + b, 0)).toBe(S.totalRevenue(orders))
  expect(Object.keys(r).sort()).toEqual(['bkash', 'card', 'cash'])
})
test('average is rounded half-up', () => {
  const n = 6, sum = S.totalRevenue(orders)
  expect(S.averageOrderValue(orders)).toBe(Math.floor((2 * sum + n) / (2 * n)))
})
test('coupon actually applied', () => {
  expect(S.couponAppliedCount(orders)).toBe(3)
  const late = orders.find(o => o.id === 'ORD-1006')!
  expect(late.couponEntered).toBe('MORNING15')
  expect(late.couponApplied).toBe(false)
})
test('orders on date (Dhaka)', () => {
  expect(S.ordersOnDate(orders, '2026-11-20').count).toBe(2)
  expect(S.ordersOnDate(orders, '2026-11-25').count).toBe(0)
})
test('tool runner never invents', () => {
  expect(runTool('get_orders_on_date', { date: '2026-11-21' }, orders, nameOf).count).toBe(2)
  expect(runTool('get_orders_on_date', { date: 'yesterday' }, orders, nameOf).error).toBe('invalid_date')
  expect(runTool('who_is_best_customer', {}, orders, nameOf).error).toBe('unknown_tool')
})