import menuJson from '../../public/menu.json'
import seedJson from '../../public/orders.seed.json'
import { validate } from '../engine/validate'
import { priceCart, unitPrice } from '../engine/pricing'
import { freeStock, remainingFor, shortages, usageOf } from '../engine/stock'
import { fmt } from '../engine/money'
import { buildOrder } from '../mocks/serverState'
import * as S from '../engine/stats'
import type { CartItem, Counts, Group, Rule } from '../engine/types'


const { groups, rules, promos, product, stock } = menuJson as any as {
    groups: Group[]; rules: Rule[]; promos: any; product: { basePrice: number }; stock: Record<string, number>
}
const menu = { basePrice: product.basePrice, groups }
const at = (d: string, h: number, m: number) => Date.parse(`${d}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+06:00`)
const log = (...a: unknown[]) => console.log(...a)

const A: Counts = { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 }
const B: Counts = { croissant: 1, omelette: 2, fried: 2, sausage: 1, bacon: 1, hashbrown: 1, mushroom: 1, hollandaise: 1 }
const C: Counts = { paratha: 1, fried: 2, tofu: 1, cheese: 2, beans: 1, mushroom: 1, chili: 1 }

test('Q1: max C from empty cart', () => {
    const cart: CartItem[] = []
    let n = 0

    for (; ;) {
        const need = usageOf({ qty: 1, options: C }, groups)
        if (Object.keys(shortages(need, freeStock(stock, cart, groups))).length) break
        cart.push({ qty: 1, options: C }); n++
    }
    const blocked = shortages(usageOf({ qty: 1, options: C }, groups), freeStock(stock, cart, groups))
    log(`Q1: max C = ${n}; limited by:`, Object.keys(blocked))
    log('Q1 free stock after:', freeStock(stock, cart, groups))
})

test('Q2: cheapest valid configuration', () => {
    const opts = groups.map(g => g.options)
    let best: { price: number; cfg: Counts } | null = null
    const maxQ = 3

    const dist = (g: Group): Counts[] => {
        const out: Counts[] = []
        const rec = (i: number, left: number, cur: Counts) => {
            if (i === g.options.length) { out.push({ ...cur }); return }
            for (let q = 0; q <= left; q++) { if (q) cur[g.options[i].id] = q; else delete cur[g.options[i].id]; rec(i + 1, left - q, cur) }
            delete cur[g.options[i].id]
        }
        rec(0, Math.min(maxQ, g.max ?? maxQ), {})
        return out
    }
    void opts
    const per = groups.map(dist)
    const walk = (i: number, cur: Counts) => {
        if (i === groups.length) {
            if (validate(cur, groups, rules).length) return
            const p = unitPrice(cur, menu, promos)
            if (!best || p < best.price) best = { price: p, cfg: { ...cur } }
            return
        }
        for (const d of per[i]) walk(i + 1, { ...cur, ...d })
    }
    walk(0, {})
    log('Q2: cheapest =', fmt(best!.price), 'BDT', best!.cfg)
}, 60_000)

test('Q3: A x3 at 10:30 and 11:30', () => {
    for (const [h, m] of [[10, 30], [11, 30]]) {
        const r = priceCart([{ qty: 3, options: A }], menu, promos, at('2026-11-26', h, m), 'MORNING15')
        log(`Q3 ${h}:${m} unit=${fmt(r.lines[0].unitPrice)} subtotal=${fmt(r.subtotal)} discount=${r.discount.type} ${fmt(r.discount.amount)} after=${fmt(r.discounted)} vat=${fmt(r.vat)} payable=${fmt(r.payable)} couponRejected=${r.couponRejected}`)
    }
})

test('Q4: after TC-10, payable at 11:30', () => {
    const B2: Counts = { ...B, omelette: 1, fried: 3 }
    const r = priceCart([{ qty: 1, options: B2 }, { qty: 2, options: C }], menu, promos, at('2026-11-26', 11, 30), 'MORNING15')
    log(`Q4 subtotal=${fmt(r.subtotal)} discount=${r.discount.type} ${fmt(r.discount.amount)} vat=${fmt(r.vat)} payable=${fmt(r.payable)}`)
    log('Q4 egg remaining:', freeStock(stock, [{ qty: 1, options: B2 }, { qty: 2, options: C }], groups).egg)
})

const seed = (seedJson as any).orders as { id: string; createdAt: string; paymentMethod: string; couponCode: string | null; lines: CartItem[] }[]
const orders = seed.map(o => buildOrder(o.id, o.createdAt, o.paymentMethod, o.couponCode, o.lines))

test('Q5: payable per seed order and total', () => {
    for (const o of orders) log(`Q5 ${o.id} payable=${fmt(o.totals.payable)}`)
    log('Q5 total revenue =', fmt(S.totalRevenue(orders)))
})

test('Q6: best-selling option', () => {
    const nameOf = (id: string) => groups.flatMap(g => g.options).find(o => o.id === id)?.name ?? id
    log('Q6', S.bestSellingOption(orders, nameOf))
})

test('Q7: revenue by payment method', () => {
    const r = S.revenueByPayment(orders)
    log('Q7', Object.fromEntries(Object.entries(r).map(([k, v]) => [k, fmt(v)])))
})

test('Q8: coupon actually applied', () => {
    for (const o of orders)
        if (o.couponEntered)
            log(`Q8 ${o.id} at ${o.createdAt} subtotal=${fmt(o.totals.subtotal)} applied=${o.couponApplied} reason=${o.couponRejectedReason} discount=${o.totals.discountType} ${fmt(o.totals.discount)}`)
    log('Q8 applied count =', S.couponAppliedCount(orders))
})

test('sanity: remainingFor is usable', () => {
    expect(remainingFor('cheese', { qty: 1, options: {} }, [], stock, groups)).toBe(4)
})