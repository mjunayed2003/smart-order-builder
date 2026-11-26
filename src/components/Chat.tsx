import { useMemo, useState } from 'react'
import { getOrders, type MenuData } from '../api/client'
import { askAssistant, errorMessage } from '../assistant/gemini'

type Msg = { who: 'me' | 'bot' | 'err'; text: string }
const SAMPLES = ['How many orders?', 'Total revenue?', 'Best-selling option?',
  'Revenue by payment method?', 'Average order value?', 'How many orders got the coupon?',
  'Orders on 2026-11-21?', 'Who is our best customer?']

export function Chat({ menu }: { menu: MenuData }) {
  const [log, setLog] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const nameOf = useMemo(() => {
    const m = new Map(menu.groups.flatMap(g => g.options).map(o => [o.id, o.name]))
    return (id: string) => m.get(id) ?? id
  }, [menu])

  async function send(q: string) {
    const question = q.trim()
    if (!question || pending) return
    setLog(l => [...l, { who: 'me', text: question }]); setText(''); setPending(true)
    try {
      const answer = await askAssistant(question, {
        nameOf, fetchOrders: async () => (await getOrders()).orders,
      })
      setLog(l => [...l, { who: 'bot', text: answer }])
    } catch (e) {
      setLog(l => [...l, { who: 'err', text: errorMessage(e) }])
    } finally { setPending(false) }
  }

  return (
    <div className="card">
      <h2>Sales assistant</h2>
      <div className="row">
        {SAMPLES.map(s => <button key={s} disabled={pending} onClick={() => send(s)}>{s}</button>)}
      </div>
      <div className="chatlog" aria-live="polite">
        {log.map((m, i) => <p key={i} className={`msg ${m.who}`}><b>{m.who === 'me' ? 'You' : 'Bot'}:</b> {m.text}</p>)}
        {pending && <p className="msg bot">Thinking…</p>}
      </div>
      <form className="row" onSubmit={e => { e.preventDefault(); send(text) }}>
        <input className="grow" value={text} onChange={e => setText(e.target.value)}
          placeholder="Ask about sales…" />
        <button type="submit" disabled={pending || !text.trim()}>Send</button>
      </form>
    </div>
  )
}