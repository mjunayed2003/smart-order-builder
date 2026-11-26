import { askAssistant, GeminiError } from '../assistant/gemini'
import { CANNOT_ANSWER_TEXT } from '../assistant/tools'
import type { StatOrder } from '../engine/stats'

const mk = (n: number): StatOrder[] => Array.from({ length: n }, (_, i) => ({
  id: `ORD-${i}`, createdAt: '2026-11-20T09:00:00+06:00', paymentMethod: 'card',
  couponEntered: null, couponApplied: false, lines: [], totals: { payable: 100 } }))
const reply = (body: unknown, status = 200) =>
  ({ ok: status < 400, status, json: async () => body }) as unknown as Response
const callOf = (name: string, args = {}) =>
  reply({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] } }] })
const textOf = (t: string) => reply({ candidates: [{ content: { parts: [{ text: t }] } }] })
const base = { nameOf: (id: string) => id, apiKey: 'test-key' }

test('count comes from our code, model only phrases it', async () => {
  const fetchFn = vi.fn().mockResolvedValueOnce(callOf('get_order_count')).mockResolvedValueOnce(textOf('There are 6 orders.'))
  const a = await askAssistant('How many orders?', { ...base, fetchOrders: async () => mk(6), fetchFn })
  expect(a).toBe('There are 6 orders.')
  const second = JSON.parse(fetchFn.mock.calls[1][1].body as string)
  expect(second.contents.at(-1).parts[0].functionResponse.response.result.count).toBe(6)
})

test('TC-18: answer changes by exactly one without reload', async () => {
  let n = 6
  const fetchFn = vi.fn().mockImplementation(async (_u: string, init: { body: string }) => {
    const b = JSON.parse(init.body)
    return b.contents.length === 1 ? callOf('get_order_count')
      : textOf(String(b.contents.at(-1).parts[0].functionResponse.response.result.count))
  })
  const ask = () => askAssistant('How many orders?', { ...base, fetchOrders: async () => mk(n), fetchFn })
  const first = Number(await ask()); n = 7
  expect(Number(await ask()) - first).toBe(1)
})

test('TC-20: best customer is not invented', async () => {
  const fetchFn = vi.fn().mockResolvedValueOnce(callOf('cannot_answer', { reason: 'no customers' }))
  const a = await askAssistant('Who is our best customer?', { ...base, fetchOrders: async () => mk(6), fetchFn })
  expect(a).toBe(CANNOT_ANSWER_TEXT)
  expect(fetchFn).toHaveBeenCalledTimes(1)
})

test('error kinds', async () => {
  const dep = { ...base, fetchOrders: async () => mk(1) }
  await expect(askAssistant('x', { ...dep, apiKey: '' })).rejects.toMatchObject({ kind: 'missing_key' })
  await expect(askAssistant('x', { ...dep, fetchFn: vi.fn().mockResolvedValue(reply({ error: { message: 'API key not valid' } }, 400)) }))
    .rejects.toMatchObject({ kind: 'invalid_key' })
  await expect(askAssistant('x', { ...dep, fetchFn: vi.fn().mockResolvedValue(reply({}, 429)) }))
    .rejects.toMatchObject({ kind: 'quota' })
  await expect(askAssistant('x', { ...dep, fetchFn: vi.fn().mockRejectedValue(new TypeError('fail')) }))
    .rejects.toBeInstanceOf(GeminiError)
})