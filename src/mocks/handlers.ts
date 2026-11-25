import { http, HttpResponse, delay } from 'msw'
import { validate } from '../engine/validate'
import { priceCart } from '../engine/pricing'
import { shortText } from '../engine/stock'
import type { CartItem, Counts } from '../engine/types'
import {
  GROUPS, RULES, PROMOS, PRICING_MENU, MENU_JSON, RESERVATION_MS, chaos,
  activeItems, buildOrder, commit, freeFor, getState, needOf, sanitize,
  serverNow, shortages, sweep, toDhakaIso, type StoredItem,
} from './serverState'

const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const err = (status: number, body: Record<string, unknown>) => HttpResponse.json(body, { status })
const ok = (status: number, body: unknown) => HttpResponse.json(body as never, { status })

type ItemBody = { qty: number; options: Counts }

function check(body: ItemBody, excludeId?: string) {
  const item: CartItem = { qty: body.qty, options: sanitize(body.options) }
  if (!Number.isInteger(item.qty) || item.qty < 1 || item.qty > 3)
    return { error: err(422, { error: 'qty', message: 'Quantity must be 1 to 3' }) }
  const violations = validate(item.options, GROUPS, RULES)
  if (violations.length) return { error: err(422, { error: 'rules', violations }) }
  const short = shortages(needOf(item), freeFor(getState(), excludeId))
  if (Object.keys(short).length)
    return { error: err(409, { error: 'stock', short, message: shortText(short) }) }
  return { item }
}

export const handlers = [
  http.get('/api/menu', () => ok(200, MENU_JSON)),

  http.get('/api/state', async () => {
    await delay(rnd(50, 200))
    sweep()
    const s = getState()
    return ok(200, {
      serverTime: serverNow(), version: s.version,
      items: s.items, free: freeFor(s),
    })
  }),

  http.post('/api/price', async ({ request }) => {
    const body = (await request.json()) as { items: CartItem[]; couponCode?: string | null }
    await delay(rnd(200, 1500))
    if (Math.random() < 0.15) return err(500, { error: 'random_failure', message: 'Price service failed' })
    const now = serverNow()
    const result = priceCart(body.items, PRICING_MENU, PROMOS, now, body.couponCode ?? null)
    return ok(200, { ...result, serverTime: now })
  }),

  // ---------- Add to cart ----------
  http.post('/api/cart/items', async ({ request }) => {
    const key = request.headers.get('Idempotency-Key')
    const body = (await request.json()) as ItemBody
    await delay(rnd(100, 400))

    if (!key) return err(400, { error: 'missing_key', message: 'Idempotency-Key required' })
    sweep()
    const s0 = getState()
    const prev = s0.idem['add:' + key]
    if (prev) return ok(prev.status, prev.body)   

    const r = check(body)
    if (r.error) return r.error

    const s = structuredClone(s0)   
    const now = serverNow()
    const item: StoredItem = { id: crypto.randomUUID(), qty: r.item!.qty, options: r.item!.options,
      reservedAt: now, expiresAt: now + RESERVATION_MS, expired: false }
    s.items.push(item)

    if (chaos.failNext) { chaos.failNext = false; return err(500, { error: 'server', message: 'Reserve failed' }) }

    const res = { item, serverTime: now }
    s.idem['add:' + key] = { status: 201, body: res }
    commit(s)
    return ok(201, res)
  }),

  http.put('/api/cart/items/:id', async ({ request, params }) => {
    const id = String(params.id)
    const body = (await request.json()) as ItemBody
    await delay(rnd(100, 400))
    sweep()
    const s0 = getState()
    const cur = s0.items.find(i => i.id === id)
    if (!cur) return err(404, { error: 'not_found', message: 'Item not found' })
    if (cur.expired) return err(409, { error: 'expired', message: 'Reservation expired. Remove the item or re-add it.' })

    const r = check(body, id)
    if (r.error) return r.error

    const s = structuredClone(s0)
    const it = s.items.find(i => i.id === id)!
    it.qty = r.item!.qty; it.options = r.item!.options 
    commit(s)
    return ok(200, { item: it, serverTime: serverNow() })
  }),

  http.delete('/api/cart/items/:id', async ({ params }) => {
    await delay(rnd(50, 200))
    const s = structuredClone(getState())
    s.items = s.items.filter(i => i.id !== String(params.id))
    commit(s)
    return ok(200, { ok: true })
  }),

  // ---------- Checkout ----------
  http.post('/api/checkout', async ({ request }) => {
    const key = request.headers.get('Idempotency-Key')
    const body = (await request.json()) as { paymentMethod: string; couponCode?: string | null }
    await delay(rnd(150, 500))
    if (!key) return err(400, { error: 'missing_key', message: 'Idempotency-Key required' })
    sweep()
    const s0 = getState()
    const prev = s0.idem['pay:' + key]
    if (prev) return ok(prev.status, prev.body)

    if (!['card', 'bkash', 'cash'].includes(body.paymentMethod))
      return err(422, { error: 'payment', message: 'Unknown payment method' })
    const active = activeItems(s0)
    if (!active.length) return err(409, { error: 'empty', message: 'No active items to pay for' })

    const s = structuredClone(s0)
    const nums = s.orders.map(o => Number(o.id.replace('ORD-', ''))).filter(Number.isFinite)
    const id = 'ORD-' + (Math.max(1000, ...nums) + 1) 
    const createdAt = toDhakaIso(serverNow()) 
    const order = buildOrder(id, createdAt, body.paymentMethod, body.couponCode?.trim() || null,
      active.map(i => ({ qty: i.qty, options: i.options })))

    for (const it of active)
      for (const [ing, n] of Object.entries(needOf(it))) s.sold[ing] = (s.sold[ing] ?? 0) + n
    s.items = []  
    s.orders.push(order)
    s.idem['pay:' + key] = { status: 201, body: { order } }
    commit(s)
    return ok(201, { order })
  }),

  http.get('/api/orders', async () => {
    await delay(rnd(50, 200))
    return ok(200, { orders: getState().orders })
  }),
]