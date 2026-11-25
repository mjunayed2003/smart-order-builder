import type { MenuData, StoredItem } from '../api/client'

type Props = {
  menu: MenuData
  items: StoredItem[]
  now: number
  editingId: string | null
  onEdit: (id: string) => void
  onRemove: (id: string) => void
}

const mmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function Cart({ menu, items, now, editingId, onEdit, onRemove }: Props) {
  const names = new Map(menu.groups.flatMap(g => g.options).map(o => [o.id, o.name]))
  const text = (o: Record<string, number>) =>
    Object.entries(o).map(([id, n]) => `${names.get(id) ?? id}${n > 1 ? ` ×${n}` : ''}`).join(', ')

  return (
    <div className="card">
      <h2>Cart ({items.length})</h2>
      {items.length === 0 && <p>Cart is empty.</p>}
      {items.map(it => (
        <div key={it.id} className={`cartitem ${it.expired ? 'expired' : ''}`}>
          <div><b>Qty {it.qty}</b>: {text(it.options)}</div>
          <div className="row">
            {it.expired
              ? <span className="errors">Expired (read-only)</span>
              : <small>Reserved for {mmss(it.expiresAt - now)}</small>}
            <span className="grow" />
            <button disabled={it.expired || editingId === it.id} onClick={() => onEdit(it.id)}>Edit</button>
            <button onClick={() => onRemove(it.id)}>Remove</button>
          </div>
        </div>
      ))}
    </div>
  )
}