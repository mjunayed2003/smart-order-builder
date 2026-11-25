import { useCallback, useEffect, useState } from 'react'
import { Builder } from './components/Builder'
import { Cart } from './components/Cart'
import { Checkout } from './components/Checkout'
import { getMenu, getOrders, getState, removeItem, type MenuData, type Snapshot } from './api/client'
import { useServerNow } from './hooks'

export default function App() {
  const [menu, setMenu] = useState<MenuData | null>(null)
  const [snap, setSnap] = useState<Snapshot | null>(null)
  const [offset, setOffset] = useState(0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const [fatal, setFatal] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const s = await getState()
    setOffset(s.serverTime - Date.now())
    setSnap(s)
  }, [])

  useEffect(() => {
    getMenu().then(setMenu).catch(() => setFatal('Could not load menu'))
    refresh().catch(() => setFatal('Could not load server state'))
  }, [refresh])

  useEffect(() => {
    const t = setInterval(() => { refresh().catch(() => {}) }, 10_000)
    return () => clearInterval(t)
  }, [refresh])

  const now = useServerNow(offset)

  const lapsed = snap?.items.some(i => !i.expired && now >= i.expiresAt) ?? false
  useEffect(() => { if (lapsed) refresh().catch(() => {}) }, [lapsed, refresh])

  if (fatal) return <p className="errors">{fatal}</p>
  if (!menu || !snap) return <p>Loading…</p>


  const items = snap.items.map(i => ({ ...i, expired: i.expired || now >= i.expiresAt }))
  const active = items.filter(i => !i.expired).map(({ qty, options }) => ({ qty, options }))
  const editing = items.find(i => i.id === editingId) ?? null

  async function remove(id: string) {
    await removeItem(id).catch(() => {})
    refresh().catch(() => {})
  }
  async function download() {
    const { orders } = await getOrders()
    const body = { schemaVersion: 1, currency: 'BDT', currencyUnit: 'poisha', orders }
    const blob = new Blob([JSON.stringify(body, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob); a.download = 'orders.json'; a.click()
    URL.revokeObjectURL(a.href)
  }
  const dhaka = new Date(now + 6 * 3600_000).toISOString().slice(11, 19)

  return (
    <div className="app">
      <header>
        <h1>{menu.product.name}</h1>
        <small>Server time (Dhaka): {dhaka}</small>
        <button onClick={download}>Download orders.json</button>
      </header>
      <main>
        <section>
          <Builder key={`${editingId ?? 'new'}-${nonce}`} menu={menu} free={snap.free}
            editingId={editingId} editing={editing} refresh={refresh}
            onDone={() => { setEditingId(null); setNonce(n => n + 1) }} />
        </section>
        <section>
          <Cart menu={menu} items={items} now={now} editingId={editingId}
            onEdit={setEditingId} onRemove={remove} />
          <Checkout active={active} onPaid={refresh} />
        </section>
      </main>
    </div>
  )
}