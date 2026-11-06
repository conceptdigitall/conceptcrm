// Supabase falso em memória, só para testes do módulo Loja.
// Cobre o subconjunto do query builder que o módulo usa: select/insert/
// update/upsert/delete, eq/in/neq/is/order/limit, single/maybeSingle e rpc.

type Row = Record<string, unknown>
type Tables = Record<string, Row[]>
type Filter = (r: Row) => boolean
type Rpc = (args: Record<string, unknown>) => unknown

let seq = 0
const newId = () => `id-${++seq}`

export function fakeDb(initial: Tables, rpcs: Record<string, Rpc> = {}) {
  const tables: Tables = {}
  for (const [k, v] of Object.entries(initial)) tables[k] = v.map((r) => ({ ...r }))
  const table = (name: string) => (tables[name] ??= [])

  function builder(name: string) {
    let op: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
    let payload: Row | Row[] | null = null
    let onConflict: string[] = []
    let ignoreDuplicates = false
    const filters: Filter[] = []
    let order: { col: string; asc: boolean } | null = null
    let limit: number | null = null
    let wantSingle: 'single' | 'maybe' | null = null

    const run = () => {
      const rows = table(name)
      let result: Row[] = []
      let error: { message: string; code?: string } | null = null

      if (op === 'insert' || op === 'upsert') {
        const list = Array.isArray(payload) ? payload : [payload as Row]
        for (const raw of list) {
          const row: Row = { id: newId(), ...raw }
          const keys = op === 'upsert' && onConflict.length ? onConflict : uniqueKeys[name] ?? []
          const existing = keys.length
            ? rows.find((r) => keys.every((k) => r[k] === row[k]))
            : undefined
          if (existing) {
            if (op === 'insert' || ignoreDuplicates) {
              if (op === 'insert') error = { message: 'duplicate key', code: '23505' }
              continue
            }
            Object.assign(existing, raw)
            result.push(existing)
          } else {
            rows.push(row)
            result.push(row)
          }
        }
      } else {
        const matched = rows.filter((r) => filters.every((f) => f(r)))
        if (op === 'update') matched.forEach((r) => Object.assign(r, payload))
        if (op === 'delete') tables[name] = rows.filter((r) => !matched.includes(r))
        result = matched
      }

      if (order) {
        const { col, asc } = order
        result = [...result].sort((a, b) =>
          (a[col] as string) > (b[col] as string) ? (asc ? 1 : -1) : (asc ? -1 : 1))
      }
      if (limit != null) result = result.slice(0, limit)

      if (error) return { data: null, error, count: null }
      if (wantSingle === 'single') {
        return result.length === 1
          ? { data: result[0], error: null }
          : { data: null, error: { message: 'not single', code: 'PGRST116' } }
      }
      if (wantSingle === 'maybe') return { data: result[0] ?? null, error: null }
      return { data: result, error: null, count: result.length }
    }

    const b = {
      select: () => b,
      insert: (p: Row | Row[]) => { op = 'insert'; payload = p; return b },
      update: (p: Row) => { op = 'update'; payload = p; return b },
      upsert: (p: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) => {
        op = 'upsert'; payload = p
        onConflict = o?.onConflict?.split(',').map((s) => s.trim()) ?? []
        ignoreDuplicates = Boolean(o?.ignoreDuplicates)
        return b
      },
      delete: () => { op = 'delete'; return b },
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return b },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return b },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return b },
      in: (c: string, vs: unknown[]) => { filters.push((r) => vs.includes(r[c])); return b },
      gte: (c: string, v: string) => { filters.push((r) => String(r[c]) >= v); return b },
      lt: (c: string, v: string) => { filters.push((r) => String(r[c]) < v); return b },
      ilike: (c: string, v: string) => {
        filters.push((r) => String(r[c] ?? '').toLowerCase() === v.toLowerCase()); return b
      },
      order: (col: string, o?: { ascending?: boolean }) => {
        order = { col, asc: o?.ascending !== false }; return b
      },
      limit: (n: number) => { limit = n; return b },
      single: () => { wantSingle = 'single'; return Promise.resolve(run()) },
      maybeSingle: () => { wantSingle = 'maybe'; return Promise.resolve(run()) },
      then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject),
    }
    return b
  }

  return {
    tables,
    from: (name: string) => builder(name),
    rpc: (fn: string, args: Record<string, unknown>) => {
      const impl = rpcs[fn]
      if (!impl) return Promise.resolve({ data: null, error: { message: `no rpc ${fn}` } })
      return Promise.resolve({ data: impl(args), error: null })
    },
  }
}

// Chaves únicas usadas quando o insert/upsert não diz onConflict.
const uniqueKeys: Record<string, string[]> = {
  store_settings: ['account_id'],
  store_secrets: ['account_id'],
  processed_webhooks: ['provider', 'event_id'],
  orders: ['payment_provider', 'payment_ref'],
  shipments: ['order_id'],
}
