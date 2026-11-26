import * as S from '../engine/stats'
import { fmt } from '../engine/money'

export const TOOL_NAMES = [
  'get_order_count', 'get_total_revenue', 'get_best_selling_option',
  'get_revenue_by_payment_method', 'get_average_order_value',
  'get_coupon_applied_count', 'get_orders_on_date', 'cannot_answer',
] as const

export const declarations = [
  { name: 'get_order_count', description: 'How many orders exist in total.' },
  { name: 'get_total_revenue', description: 'Total revenue (sum of payable) of all orders.' },
  { name: 'get_best_selling_option', description: 'The best-selling menu option by units sold.' },
  { name: 'get_revenue_by_payment_method', description: 'Revenue split by payment method (card, bkash, cash).' },
  { name: 'get_average_order_value', description: 'Average payable amount per order.' },
  { name: 'get_coupon_applied_count', description: 'How many orders actually received the coupon discount.' },
  { name: 'get_orders_on_date', description: 'How many orders were placed on one specific date.',
    parameters: { type: 'OBJECT', properties: {
      date: { type: 'STRING', description: 'Date as YYYY-MM-DD (Asia/Dhaka).' } }, required: ['date'] } },
  { name: 'cannot_answer',
    description: 'Use when the question cannot be answered by any other tool, e.g. customers, profit, stock, hourly trends, anything outside the order data.',
    parameters: { type: 'OBJECT', properties: {
      reason: { type: 'STRING', description: 'Short reason.' } } } },
]

const bdt = (p: number) => fmt(p)

export function runTool(name: string, args: Record<string, unknown>,
  orders: S.StatOrder[], nameOf: (id: string) => string): Record<string, unknown> {
  switch (name) {
    case 'get_order_count': {
      const count = S.orderCount(orders)
      return { count, summary: `There are ${count} orders in total.` }
    }
    case 'get_total_revenue': {
      const p = S.totalRevenue(orders)
      return { revenueBdt: p / 100, summary: `Total revenue is ${bdt(p)} BDT.` }
    }
    case 'get_best_selling_option': {
      const b = S.bestSellingOption(orders, nameOf)
      if (!b) return { summary: 'There are no orders yet.' }
      const names = b.leaders.map(l => l.name).join(' and ')
      return { units: b.units, options: b.leaders.map(l => l.name),
        summary: `Best-selling by units: ${names} (${b.units} units${b.leaders.length > 1 ? ' each, tied' : ''}).` }
    }
    case 'get_revenue_by_payment_method': {
      const r = S.revenueByPayment(orders)
      const bdtMap = Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v / 100]))
      return { revenueBdtByMethod: bdtMap,
        summary: Object.entries(r).map(([k, v]) => `${k}: ${bdt(v)} BDT`).join(', ') || 'No orders yet.' }
    }
    case 'get_average_order_value': {
      const p = S.averageOrderValue(orders)
      return { averageBdt: p / 100, summary: `Average order value is ${bdt(p)} BDT.` }
    }
    case 'get_coupon_applied_count': {
      const count = S.couponAppliedCount(orders)
      return { count, summary: `${count} orders actually received the coupon discount.` }
    }
    case 'get_orders_on_date': {
      const date = String(args.date ?? '')
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        return { error: 'invalid_date', summary: 'I need a clear date to look that up.' }
      const r = S.ordersOnDate(orders, date)
      return { date, count: r.count, orderIds: r.ids, summary: `${r.count} orders on ${date}.` }
    }
    default:
      return { error: 'unknown_tool', summary: 'That question is not supported.' }
  }
}

export const CANNOT_ANSWER_TEXT =
  "I can't answer that from this data. Orders store only the time, payment method, items, coupon and totals, " +
  'so there is nothing about customers (or anything else outside those fields) to base an answer on.'

export const NO_TOOL_TEXT =
  'I can only answer these: number of orders, total revenue, best-selling option, revenue by payment method, ' +
  'average order value, orders that got the coupon, and orders on a given date.'