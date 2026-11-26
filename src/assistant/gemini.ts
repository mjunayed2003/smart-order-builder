import { CANNOT_ANSWER_TEXT, NO_TOOL_TEXT, declarations, runTool } from './tools'
import type { StatOrder } from '../engine/stats'

export type GeminiErrorKind = 'missing_key' | 'invalid_key' | 'quota' | 'network' | 'other'
export class GeminiError extends Error {
  kind: GeminiErrorKind
  constructor(kind: GeminiErrorKind, message: string) { super(message); this.kind = kind }
}

export function errorMessage(e: unknown): string {
  if (e instanceof GeminiError) {
    switch (e.kind) {
      case 'missing_key': return 'Gemini API key is missing. Add VITE_GEMINI_API_KEY to .env.local and restart the dev server.'
      case 'invalid_key': return 'Gemini API key is invalid. Check the key in .env.local.'
      case 'quota': return 'Gemini quota exceeded (429). Wait a bit and try again.'
      case 'network': return 'Network error: could not reach Gemini. Check your connection.'
      default: return `Gemini error: ${e.message}`
    }
  }
  return 'Something went wrong while asking the assistant.'
}

type Part = { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: unknown } }
type Content = { role?: string; parts: Part[] }
type GeminiResponse = { candidates?: { content?: Content }[] }

export type Deps = {
  fetchOrders: () => Promise<StatOrder[]>
  nameOf: (id: string) => string
  apiKey?: string
  model?: string
  fetchFn?: typeof fetch 
}

const systemText = () => {
  const today = new Date(Date.now() + 6 * 3600_000).toISOString().slice(0, 10)
  return [
    'You are a sales assistant for a breakfast shop. You have no data of your own.',
    'For every question you must call exactly one tool. If no tool fits (customers, profit, stock, anything outside the tools), call cannot_answer.',
    'Never invent names, numbers or dates.',
    `Today in Dhaka is ${today}. A date without a year means 2026. Convert dates to YYYY-MM-DD.`,
    'When you receive a tool result, state only what it says in one or two short sentences. Amounts are in BDT.',
    'Reply in the language of the question.',
  ].join(' ')
}

async function callModel(body: unknown, key: string, model: string, fetchFn: typeof fetch) {
  let res: Response
  try {
    res = await fetchFn(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body),
    })
  } catch {
    throw new GeminiError('network', 'Network error')
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: { message?: string } }
    const msg = data.error?.message ?? `HTTP ${res.status}`
    if (res.status === 429) throw new GeminiError('quota', msg)
    if (res.status === 401 || res.status === 403 || (res.status === 400 && /api key/i.test(msg)))
      throw new GeminiError('invalid_key', msg)
    throw new GeminiError('other', msg)
  }
  return (await res.json()) as GeminiResponse
}

export async function askAssistant(question: string, deps: Deps): Promise<string> {
  const key = deps.apiKey ?? (import.meta.env.VITE_GEMINI_API_KEY as string | undefined)
  if (!key) throw new GeminiError('missing_key', 'missing key')
  const model = deps.model ?? (import.meta.env.VITE_GEMINI_MODEL as string | undefined) ?? 'gemini-2.5-flash'
  const fetchFn = deps.fetchFn ?? fetch.bind(globalThis)
  const tools = [{ functionDeclarations: declarations }]
  const systemInstruction = { parts: [{ text: systemText() }] }

  const contents: Content[] = [{ role: 'user', parts: [{ text: question }] }]

  const r1 = await callModel({ systemInstruction, contents, tools,
    toolConfig: { functionCallingConfig: { mode: 'ANY' } } }, key, model, fetchFn)
  const modelContent = r1.candidates?.[0]?.content
  const call = modelContent?.parts.find(p => p.functionCall)?.functionCall
  if (!modelContent || !call) return NO_TOOL_TEXT
  if (call.name === 'cannot_answer') return CANNOT_ANSWER_TEXT

  const orders = await deps.fetchOrders()
  const result = runTool(call.name, call.args ?? {}, orders, deps.nameOf)

  const r2 = await callModel({
    systemInstruction,
    contents: [...contents, modelContent,
      { role: 'user', parts: [{ functionResponse: { name: call.name, response: { result } } }] }],
    tools, toolConfig: { functionCallingConfig: { mode: 'NONE' } },
  }, key, model, fetchFn)
  const text = r2.candidates?.[0]?.content?.parts.map(p => p.text ?? '').join('').trim()
  return text || String(result.summary ?? NO_TOOL_TEXT)
}