import { useEffect, useRef, useState } from 'react'
import type { CartItem } from './engine/types'
import type { PriceResult } from './engine/pricing'
import { postPrice } from './api/client'

export function useServerNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset)
  useEffect(() => {
    const tick = () => setNow(Date.now() + offset)
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [offset])
  return now
}

export function usePrice(items: CartItem[], coupon: string | null, enabled: boolean) {
  const [price, setPrice] = useState<PriceResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [tick, setTick] = useState(0)
  const latest = useRef(0)
  const payload = JSON.stringify({ items, coupon })

  useEffect(() => {
    if (!enabled) return
    const id = ++latest.current
    const ctrl = new AbortController()
    const { items: it, coupon: c } = JSON.parse(payload) as { items: CartItem[]; coupon: string | null }
    setLoading(true); setError(false)
    const t = setTimeout(async () => {
      try {
        const data = await postPrice(it, c, ctrl.signal)
        if (id === latest.current) { setPrice(data); setLoading(false) }
      } catch {
        if (id === latest.current && !ctrl.signal.aborted) { setError(true); setLoading(false) }
      }
    }, 300)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [payload, enabled, tick])

  return { price, loading, error, retry: () => setTick(n => n + 1) }
}