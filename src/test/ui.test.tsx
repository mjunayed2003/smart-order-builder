import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import menuJson from '../../public/menu.json'
import { Builder } from '../components/Builder'
import { usePrice } from '../hooks'
import * as client from '../api/client'
import type { MenuData } from '../api/client'
import type { CartItem } from '../engine/types'

vi.mock('../api/client', async orig => {
  const actual = await orig<typeof import('../api/client')>()
  return { ...actual, addItem: vi.fn(), postPrice: vi.fn() }
})
const addItem = vi.mocked(client.addItem)
const postPrice = vi.mocked(client.postPrice)

beforeEach(() => {
  addItem.mockReset()
  postPrice.mockReset()
  postPrice.mockResolvedValue({
    lines: [{ unitPrice: 38000, qty: 1, total: 38000 }], serverTime: 0,
  } as never)
})

test('TC-12: an older price response never replaces the latest one', async () => {
  const calls: { resolve: (v: unknown) => void }[] = []
  postPrice.mockImplementation((() =>
    new Promise(resolve => { calls.push({ resolve }) })) as never)

  const { result, rerender } = renderHook(
    ({ items }: { items: CartItem[] }) => usePrice(items, null, true),
    { initialProps: { items: [{ qty: 1, options: { toast: 1 } }] as CartItem[] } })

  await waitFor(() => expect(calls).toHaveLength(1), { timeout: 2000 })
  rerender({ items: [{ qty: 2, options: { toast: 1 } }] })
  await waitFor(() => expect(calls).toHaveLength(2), { timeout: 2000 })

  await act(async () => { calls[1].resolve({ payable: 222 }) }) 
  await act(async () => { calls[0].resolve({ payable: 111 }) }) 
  expect((result.current.price as unknown as { payable: number }).payable).toBe(222)
})

const menu = menuJson as unknown as MenuData
const stock = menuJson.stock as Record<string, number>

async function setup() {
  const user = userEvent.setup()
  const refresh = vi.fn().mockResolvedValue(undefined)
  const onDone = vi.fn()
  render(<Builder menu={menu} free={stock} editingId={null} editing={null}
    refresh={refresh} onDone={onDone} />)
  const more = (name: string) => user.click(screen.getByRole('button', { name: `more ${name}` }))
  await more('Toast'); await more('Fried'); await more('Fried'); await more('Chicken Sausage')
  return { user, onDone }
}

test('TC-13: triple click on Add to Cart sends exactly one request', async () => {
  addItem.mockImplementation(() =>
    new Promise(res => setTimeout(() => res({ item: {}, serverTime: 0 } as never), 100)))
  const { user, onDone } = await setup()

  await user.tripleClick(screen.getByRole('button', { name: 'Add to Cart' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
  expect(addItem).toHaveBeenCalledTimes(1)
})

test('TC-14: failed add keeps the configuration, and Retry reuses the same key', async () => {
  addItem
    .mockRejectedValueOnce({ status: 500, error: 'server', message: 'Reserve failed' })
    .mockResolvedValueOnce({ item: {}, serverTime: 0 } as never)
  const { user, onDone } = await setup()

  await user.click(screen.getByRole('button', { name: 'Add to Cart' }))
  expect(await screen.findByText('Reserve failed')).toBeInTheDocument()
  expect(onDone).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'less Fried' })).toBeEnabled() 

  await user.click(screen.getByRole('button', { name: 'Retry' }))
  await waitFor(() => expect(onDone).toHaveBeenCalled())
  expect(addItem).toHaveBeenCalledTimes(2)
  expect(addItem.mock.calls[1][1]).toBe(addItem.mock.calls[0][1]) 
})