import menuJson from '../../public/menu.json'
import { validate } from '../engine/validate'
import { priceCart } from '../engine/pricing'
import { freeStock, shortages, shortText, usageOf } from '../engine/stock'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { groups, rules, promos, product, stock } = menuJson as any
const menu = { basePrice: product.basePrice as number, groups }

type Opts = Record<string, number>
const A: Opts = { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 }
const B: Opts = { croissant: 1, omelette: 2, fried: 2, sausage: 1, bacon: 1, hashbrown: 1, mushroom: 1, hollandaise: 1 }
const C: Opts = { paratha: 1, fried: 2, tofu: 1, cheese: 2, beans: 1, mushroom: 1, chili: 1 }

const at = (h: number, m: number, s = 0) =>
  Date.parse(`2026-11-26T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}+06:00`)

const run = (cfg: Opts) => validate(cfg, groups, rules)
const ids = (cfg: Opts) => run(cfg).map(v => v.id)
const unit = (o: Opts) => priceCart([{ qty: 1, options: o }], menu, promos, at(12, 0)).lines[0].unitPrice

// ---------- Rules ----------
test('TC-01 eggs step', () => {
  expect(ids({ ...A, scrambled: 3 })).toContain('eggs')
})
test('TC-02 croissant override', () => {
  expect(ids({ ...B, hashbrown: 1, mushroom: 1, beans: 1 })).toContain('extras')
})
test('TC-03 hollandaise needs scrambled/omelette', () => {
  expect(ids({ toast: 1, fried: 2, sausage: 1, hollandaise: 1 })).toContain('R1')
})
test('TC-04 both excludes listed', () => {
  expect(ids({ toast: 1, scrambled: 2, tofu: 1, bacon: 1, chili: 1, hollandaise: 1 }))
    .toEqual(expect.arrayContaining(['R2', 'R4']))
})

// ---------- Pricing ----------
test('TC-05 unit prices', () => {
  expect([unit(A), unit(B), unit(C)]).toEqual([38000, 67950, 49000])
})
test('TC-06', () => {
  const r = priceCart([{ qty: 1, options: B }, { qty: 2, options: C }], menu, promos, at(10, 59, 59), 'MORNING15')
  expect(r.subtotal).toBe(165950)
  expect(r.discount).toEqual({ type: 'C2', amount: 15000 })
  expect(r.vat).toBe(7548)
  expect(r.payable).toBe(158500)
})
test('TC-07', () => {
  const r = priceCart([{ qty: 1, options: B }, { qty: 2, options: C }], menu, promos, at(11, 0, 0), 'MORNING15')
  expect(r.couponRejected).toBe(true)
  expect(r.discount).toEqual({ type: 'C1', amount: 10000 })
  expect(r.vat).toBe(7798)
  expect(r.payable).toBe(163700)
})

// ---------- Stock ----------
const cart = [{ qty: 1, options: B }, { qty: 2, options: C }]
const left = (others: typeof cart) => freeStock(stock, others, groups)

test('TC-08 remaining stock', () => {
  const f = left(cart)
  expect([f.egg, f.cheese, f.croissant]).toEqual([0, 0, 1])
})
test('TC-09 edit B to omelette 3 + fried 1', () => {
  const B2 = { ...B, omelette: 3, fried: 1 }
  const s = shortages(usageOf({ qty: 1, options: B2 }, groups), left([cart[1]]))
  expect(shortText(s)).toBe('Short: 1 egg')
})
test('TC-10 edit B to omelette 1 + fried 3', () => {
  const B2 = { ...B, omelette: 1, fried: 3 }
  expect(shortages(usageOf({ qty: 1, options: B2 }, groups), left([cart[1]]))).toEqual({})
  expect(unit(B2)).toBe(64350)
  expect(left([{ qty: 1, options: B2 }, cart[1]]).egg).toBe(1)
})
test('TC-11 C qty 2 -> 3', () => {
  const s = shortages(usageOf({ qty: 3, options: C }, groups), left([cart[0]]))
  expect(shortText(s)).toBe('Short: 2 egg, 2 cheese')
})