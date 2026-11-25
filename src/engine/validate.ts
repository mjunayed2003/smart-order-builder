import type { Counts, Group, Rule, Violation } from './types'

export function validate(config: Counts, groups: Group[], rules: Rule[]): Violation[] {
  const out: Violation[] = []
  const sel = (id: string) => config[id] ?? 0
  const name = (id: string) =>
    groups.flatMap(g => g.options).find(o => o.id === id)?.name ?? id

  // overrideLimit: base max-এর বদলে override বসে (একাধিক হলে সবচেয়ে ছোটটা)
  const overrides = new Map<string, number>()
  for (const r of rules)
    if (r.type === 'overrideLimit' && sel(r.when) > 0)
      overrides.set(r.group, Math.min(overrides.get(r.group) ?? Infinity, r.max))

  for (const g of groups) {
    const total = g.options.reduce((s, o) => s + sel(o.id), 0)
    const distinct = g.options.filter(o => sel(o.id) > 0).length
    const max = overrides.has(g.id) ? overrides.get(g.id)! : g.max
    if (total < g.min) out.push({ id: g.id, message: `${g.name}: at least ${g.min} required` })
    if (max !== undefined && total > max)
      out.push({ id: g.id, message: `${g.name}: max ${max}${overrides.has(g.id) ? ' (reduced by your selection)' : ''}` })
    if (g.step && total % g.step !== 0)
      out.push({ id: g.id, message: `${g.name}: total must be a multiple of ${g.step}` })
    if (g.maxDistinct !== undefined && distinct > g.maxDistinct)
      out.push({ id: g.id, message: `${g.name}: at most ${g.maxDistinct} different options` })
    if (g.maxPerOption !== undefined)
      for (const o of g.options)
        if (sel(o.id) > g.maxPerOption)
          out.push({ id: g.id, message: `${o.name}: max ${g.maxPerOption} each` })
  }
  for (const r of rules) {
    if (r.type === 'requires' && sel(r.option) > 0 && !r.anyOf.some(x => sel(x) > 0))
      out.push({ id: r.id, message: `${name(r.option)} requires ${r.anyOf.map(name).join(' or ')}` })
    if (r.type === 'excludes' && sel(r.option) > 0) {
      const bad = r.anyOf.filter(x => sel(x) > 0)
      if (bad.length) out.push({ id: r.id, message: `${name(r.option)} cannot be combined with ${bad.map(name).join(', ')}` })
    }
  }
  return out
}