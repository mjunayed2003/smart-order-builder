import { setupServer } from 'msw/node'
import { handlers } from '../mocks/handlers'
import { chaos, resetState } from '../mocks/serverState'


const server = setupServer(...handlers)
const originalFetch = globalThis.fetch

beforeAll(() => {
  server.listen()
  const patched = globalThis.fetch   

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
    patched(typeof input === 'string' && input.startsWith('/')
      ? new URL(input, window.location.origin).href : input, init)) as typeof fetch
})
afterAll(() => { server.close(); globalThis.fetch = originalFetch })
beforeEach(() => { resetState(); chaos.failNext = false })
afterEach(() => { vi.restoreAllMocks() })

const A = { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 }  

async function send(url: string, method: string, body?: unknown, key?: string) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as any }
}
const add = (key: string) => send('/api/cart/items', 'POST', { qty: 1, options: A }, key)
const pay = (key: string) => send('/api/checkout', 'POST', { paymentMethod: 'cash', couponCode: null }, key)
const state = () => send('/api/state', 'GET')

test('TC-13: three quick adds with one key make exactly one item and one reservation', async () => {
  const key = crypto.randomUUID()
  const rs = await Promise.all([add(key), add(key), add(key)])
  expect(new Set(rs.map(r => r.body.item.id)).size).toBe(1)
  const s = await state()
  expect(s.body.items).toHaveLength(1)
  expect(s.body.free.egg).toBe(8) 
})

test('TC-14: failed reserve holds no stock, and Retry with the same key works', async () => {
  const key = crypto.randomUUID()
  chaos.failNext = true
  const failed = await add(key)
  expect(failed.status).toBe(500)
  const s1 = await state()
  expect(s1.body.items).toHaveLength(0)
  expect(s1.body.free.egg).toBe(10) 

  const retry = await add(key)
  expect(retry.status).toBe(201)
  const s2 = await state()
  expect(s2.body.items).toHaveLength(1)
  expect(s2.body.free.egg).toBe(8)
})

test('TC-15: expiry uses server time, releases stock, and makes the item read-only', async () => {
  const t0 = Date.now()
  const added = await add(crypto.randomUUID())
  expect(added.status).toBe(201)

  const s1 = await state()

  expect(Math.abs(s1.body.serverTime - Date.now() - 90_000)).toBeLessThan(2000)

  const left = s1.body.items[0].expiresAt - s1.body.serverTime
  expect(left).toBeGreaterThan(290_000)
  expect(left).toBeLessThanOrEqual(300_000)
  expect(s1.body.items[0].expired).toBe(false)
  expect(s1.body.free.egg).toBe(8)

  vi.spyOn(Date, 'now').mockReturnValue(t0 + 310_000)
  const s2 = await state()
  expect(s2.body.items[0].expired).toBe(true)
  expect(s2.body.free.egg).toBe(10) 

  const edit = await send(`/api/cart/items/${s2.body.items[0].id}`, 'PUT', { qty: 1, options: A })
  expect(edit.status).toBe(409)
  expect(edit.body.error).toBe('expired')
})

test('TC-16: double Pay makes one order, empties the cart, and never releases sold stock', async () => {
  await add(crypto.randomUUID())
  const key = crypto.randomUUID()
  const [a, b] = await Promise.all([pay(key), pay(key)])
  expect(a.body.order.id).toBe(b.body.order.id)

  const orders = await send('/api/orders', 'GET')
  expect(orders.body.orders).toHaveLength(7)
  const s = await state()
  expect(s.body.items).toHaveLength(0)
  expect(s.body.free.egg).toBe(8) 

  const again = await pay(crypto.randomUUID()) 
  expect(again.status).toBe(409)
  expect((await state()).body.free.egg).toBe(8)
})