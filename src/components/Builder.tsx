import { useMemo, useRef, useState } from 'react'
import { validate } from '../engine/validate'
import { remainingFor, shortages, shortText, usageOf, type Usage } from '../engine/stock'
import { fmt } from '../engine/money'
import type { CartItem, Counts, Group } from '../engine/types'
import { addItem, editItem, errorText, type MenuData, type StoredItem } from '../api/client'
import { usePrice } from '../hooks'

type Props = {
  menu: MenuData
  free: Usage                    
  editingId: string | null
  editing: StoredItem | null    
  refresh: () => Promise<void>
  onDone: () => void
}

const limitText = (g: Group) => [
  g.min ? `min ${g.min}` : '', g.max !== undefined ? `max ${g.max}` : '',
  g.step ? `multiple of ${g.step}` : '',
  g.maxDistinct !== undefined ? `up to ${g.maxDistinct} different` : '',
  g.maxPerOption !== undefined ? `max ${g.maxPerOption} each` : '',
].filter(Boolean).join(', ')

export function Builder({ menu, free, editingId, editing, refresh, onDone }: Props) {
  const [qty, setQty] = useState(editing?.qty ?? 1)
  const [options, setOptions] = useState<Counts>(editing?.options ?? {})
  const [pending, setPending] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const inFlight = useRef(false)
  const key = useRef(crypto.randomUUID())

  const cur: CartItem = { qty, options }
  const locked = editingId !== null && (!editing || editing.expired)     

  const violations = useMemo(() => validate(options, menu.groups, menu.rules),
    [options, menu.groups, menu.rules])


  const own: Usage = editing && !editing.expired
    ? usageOf({ qty: editing.qty, options: editing.options }, menu.groups) : {}
  const avail: Usage = Object.fromEntries(
    Object.entries(free).map(([k, v]) => [k, v + (own[k] ?? 0)]))

  const short = shortages(usageOf(cur, menu.groups), avail)
  const hasShort = Object.keys(short).length > 0
  const valid = violations.length === 0 && !hasShort

  const { price, loading, error, retry } = usePrice([cur], null, violations.length === 0)

  const rem = (id: string) => remainingFor(id, cur, [], avail, menu.groups)
  const change = (id: string, d: number) =>
    setOptions(prev => {
      const v = (prev[id] ?? 0) + d
      const next = { ...prev }
      if (v <= 0) delete next[id]; else next[id] = v
      return next
    })

  async function submit(kind: 'add' | 'save') {
    if (inFlight.current) return                    
    inFlight.current = true; setPending(true); setMsg(null)
    try {
      if (kind === 'save') await editItem(editingId!, cur)
      else { await addItem(cur, key.current); key.current = crypto.randomUUID() }
      refresh().catch(() => {})
      onDone()
    } catch (e) {
      setMsg(errorText(e))           
      refresh().catch(() => {})
    } finally { inFlight.current = false; setPending(false) }
  }

  return (
    <div className="card">
      <h2>{editingId ? 'Edit item' : 'Build your item'}</h2>

      {locked && (
        <div className="banner warn">
          {editing ? 'This reservation expired.' : 'This item is no longer in the cart.'} Your changes
          are kept below. Saving is disabled; use "Add as new item" to reserve again.
        </div>
      )}

      {menu.groups.map(g => (
        <fieldset key={g.id}>
          <legend>{g.name} <small>({limitText(g)})</small></legend>
          {g.options.map(o => {
            const n = options[o.id] ?? 0, left = rem(o.id)
            return (
              <div className="row" key={o.id}>
                <span className="grow">{o.name} <small>{fmt(o.price)}</small></span>
                <small>{Number.isFinite(left) ? `${left} left` : 'unlimited'}</small>
                <button onClick={() => change(o.id, -1)} disabled={n === 0}
                  aria-label={`less ${o.name}`}>−</button>
                <b>{n}</b>
                <button onClick={() => change(o.id, 1)} disabled={left === 0}
                  aria-label={`more ${o.name}`}>+</button>
              </div>
            )
          })}
        </fieldset>
      ))}

      <div className="row">
        <span className="grow">Quantity</span>
        <button onClick={() => setQty(q => Math.max(1, q - 1))} disabled={qty <= 1}>−</button>
        <b>{qty}</b>
        <button onClick={() => setQty(q => Math.min(3, q + 1))} disabled={qty >= 3}>+</button>
      </div>

      {violations.length > 0 && (
        <ul className="errors">{violations.map((v, i) => <li key={i}>{v.message}</li>)}</ul>
      )}
      {hasShort && <p className="errors">{shortText(short)}</p>}

      {violations.length === 0 && (
        <p className="price" aria-live="polite">
          {error ? <>Price failed. <button onClick={retry}>Retry</button></>
            : price ? <>Unit {fmt(price.lines[0].unitPrice)} × {qty} = <b>{fmt(price.lines[0].total)}</b> BDT
                {loading && <small> (updating…)</small>}</>
            : 'Calculating…'}
        </p>
      )}

      {msg && <p className="errors">{msg}</p>}

      <div className="row">
        {editingId ? (
          <>
            <button disabled={!valid || pending || locked} onClick={() => submit('save')}>
              {pending ? 'Saving…' : msg ? 'Retry save' : 'Save changes'}
            </button>
            {locked && (
              <button disabled={!valid || pending} onClick={() => submit('add')}>Add as new item</button>
            )}
            <button onClick={onDone} disabled={pending}>Cancel</button>
          </>
        ) : (
          <button disabled={!valid || pending} onClick={() => submit('add')}>
            {pending ? 'Adding…' : msg ? 'Retry' : 'Add to Cart'}
          </button>
        )}
      </div>
    </div>
  )
}