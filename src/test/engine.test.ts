import menuJson from '../../public/menu.json'
import { validate } from '../engine/validate'
import { priceCart } from '../engine/pricing'

const { groups, rules, promos, product } = menuJson as any
const menu = { basePrice: product.basePrice, groups }
const A = { toast:1, scrambled:2, sausage:1, ketchup:1 }
const B = { croissant:1, omelette:2, fried:2, sausage:1, bacon:1, hashbrown:1, mushroom:1, hollandaise:1 }
const C = { paratha:1, fried:2, tofu:1, cheese:2, beans:1, mushroom:1, chili:1 }
const at = (h:number,m:number,s=0) => Date.parse(`2026-11-26T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}+06:00`)

test('TC-06', () => {
  const r = priceCart([{qty:1,options:B},{qty:2,options:C}], menu, promos, at(10,59,59), 'MORNING15')
  expect(r.subtotal).toBe(165950); expect(r.discount.amount).toBe(15000)
  expect(r.vat).toBe(7548); expect(r.payable).toBe(158500)
})
test('TC-07', () => {
  const r = priceCart([{qty:1,options:B},{qty:2,options:C}], menu, promos, at(11,0,0), 'MORNING15')
  expect(r.couponRejected).toBe(true); expect(r.discount.amount).toBe(10000)
  expect(r.vat).toBe(7798); expect(r.payable).toBe(163700)
})