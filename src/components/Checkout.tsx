import { useRef, useState } from 'react'
import { fmt } from '../engine/money'
import type { CartItem } from '../engine/types'
import { checkout, errorText, type OrderDto } from '../api/client'
import { usePrice } from '../hooks'

type Props = { active: CartItem[]; onPaid: () => Promise<void> }

export function Checkout({ active, onPaid }: Props) {
  const [method, setMethod] = useState('card')
  const [coupon, setCoupon] = useState('')
  const [pending, setPending] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [placed, setPlaced] = useState<OrderDto | null>(null)
  const inFlight = useRef(false)
  const key = useRef(crypto.randomUUID())

  const code = coupon.trim() || null
  const { price, loading, error, retry } = usePrice(active, code, active.length > 0)

  async function pay() {
    if (inFlight.current || active.length === 0) return
    inFlight.current = true; setPending(true); setErr(null)
    try {
      const { order } = await checkout(method, code, key.current)
      key.current = crypto.randomUUID()
      setPlaced(order); setCoupon('')
      onPaid().catch(() => {})
    } catch (e) {
      setErr(errorText(e))
      onPaid().catch(() => {})
    } finally { inFlight.current = false; setPending(false) }
  }

  return (
    <div className="card">
      <h2>Checkout</h2>
      {placed && (
        <div className="banner ok">
          Order <b>{placed.id}</b> placed. Payable {fmt(placed.totals.payable)} BDT
          {placed.couponEntered && (placed.couponApplied ? ' (coupon applied)' : ' (coupon not applied)')}.
        </div>
      )}

      {active.length > 0 && (
        <>
          <div className="row">
            <label className="grow">Coupon <input value={coupon} placeholder="MORNING15"
              onChange={e => setCoupon(e.target.value)} /></label>
            <label>Payment <select value={method} onChange={e => setMethod(e.target.value)}>
              <option value="card">card</option><option value="bkash">bkash</option>
              <option value="cash">cash</option>
            </select></label>
          </div>

          {error ? <p className="errors">Price failed. <button onClick={retry}>Retry</button></p>
            : price ? (
              <table className="breakdown" aria-live="polite">
                <tbody>
                  <tr><td>Subtotal</td><td>{fmt(price.subtotal)}</td></tr>
                  {price.discount.type && (
                    <tr><td>Discount ({price.discount.type})</td><td>−{fmt(price.discount.amount)}</td></tr>
                  )}
                  {price.couponRejected && (
                    <tr><td colSpan={2} className="errors">Coupon is not valid right now.</td></tr>
                  )}
                  <tr><td>After discount</td><td>{fmt(price.discounted)}</td></tr>
                  <tr><td>VAT 5%</td><td>{fmt(price.vat)}</td></tr>
                  <tr><td><b>Payable</b></td><td><b>{fmt(price.payable)}</b></td></tr>
                </tbody>
              </table>
            ) : <p>Calculating…</p>}
          {loading && price && <small>updating…</small>}
          <p><small>Final price is calculated by the server when you press Pay.</small></p>
        </>
      )}

      {err && <p className="errors">{err}</p>}
      <button disabled={pending || active.length === 0} onClick={pay}>
        {pending ? 'Paying…' : err ? 'Retry Pay' : 'Pay'}
      </button>
    </div>
  )
}