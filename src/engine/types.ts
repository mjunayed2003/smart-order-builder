export type Counts = Record<string, number>
export type Option = { id: string; name: string; price: number; uses: Record<string, number> }
export type Group = {
    id: string; name: string; min: number; max?: number; step?: number
    maxDistinct?: number; maxPerOption?: number; options: Option[]
}
export type Rule =
    | { id: string; type: 'requires'; option: string; anyOf: string[] }
    | { id: string; type: 'excludes'; option: string; anyOf: string[] }
    | { id: string; type: 'overrideLimit'; when: string; group: string; max: number }
export type Violation = { id: string; message: string }
export type CartItem = { qty: number; options: Counts }