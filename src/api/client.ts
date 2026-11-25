import type { CartItem, Counts, Group, Rule } from '../engine/types'
import type { PriceResult, Promos } from '../engine/pricing'
import type { Usage } from '../engine/stock'

export type MenuData = {
  product: { id: string; name: string; basePrice: number }
  groups: Group[]; rules: Rule[]; stock: Usage; promos: Promos
}
export type StoredItem = {
  id: string; qty: number; options: Counts
  reservedAt: number; expiresAt: number; expired: boolean
}
export type Snapshot = { serverTime: number; version: number; items: StoredItem[]; free: Usage }
export type OrderDto = {
  id: string; createdAt: string; paymentMethod: string
  couponEntered: string | null; couponApplied: boolean
  totals: { subtotal: number; discountType: string | null; discount: number
    discounted: number; vat: number; payable: number }
}
export type ApiError = {
  status?: number; error?: string; message?: string; short?: Usage
  violations?: { id: string; message: string }[]
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw { status: res.status, ...data } as ApiError
  return data as T
}
const H = { 'Content-Type': 'application/json' }

export const getMenu = () => req<MenuData>('/api/menu')
export const getState = () => req<Snapshot>('/api/state')
export const getOrders = () => req<{ orders: OrderDto[] }>('/api/orders')

export const postPrice = (items: CartItem[], couponCode: string | null, signal: AbortSignal) =>
  req<PriceResult & { serverTime: number }>('/api/price',
    { method: 'POST', headers: H, body: JSON.stringify({ items, couponCode }), signal })

export const addItem = (item: CartItem, key: string) =>
  req<{ item: StoredItem; serverTime: number }>('/api/cart/items',
    { method: 'POST', headers: { ...H, 'Idempotency-Key': key }, body: JSON.stringify(item) })

export const editItem = (id: string, item: CartItem) =>
  req<{ item: StoredItem }>(`/api/cart/items/${id}`,
    { method: 'PUT', headers: H, body: JSON.stringify(item) })

export const removeItem = (id: string) =>
  req<{ ok: true }>(`/api/cart/items/${id}`, { method: 'DELETE' })

export const checkout = (paymentMethod: string, couponCode: string | null, key: string) =>
  req<{ order: OrderDto }>('/api/checkout',
    { method: 'POST', headers: { ...H, 'Idempotency-Key': key },
      body: JSON.stringify({ paymentMethod, couponCode }) })

export function errorText(e: unknown): string {
  const er = e as ApiError
  if (er.error === 'stock' && er.message) return er.message 
  if (er.error === 'rules' && er.violations) return er.violations.map(v => v.message).join(' · ')
  if (er.message) return er.message
  return 'Network or server problem. Your input is kept, press Retry.'
}