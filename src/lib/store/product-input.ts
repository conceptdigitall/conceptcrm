// Validação do produto vindo da tela Configurações → Loja.

const SLUG = /^[a-z0-9][a-z0-9-]{0,62}$/

const strList = (v: unknown) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x.trim()).map((x: string) => x.trim().slice(0, 40)) : null

export type ProductRow = {
  slug: string
  name: string
  price_cents: number
  colors: string[]
  sizes: string[]
  weight_oz: number
  image_url: string | null
  active: boolean
}

/** `partial` = PATCH: só valida os campos presentes. */
export function parseProductInput(
  body: Record<string, unknown> | null,
  partial = false,
): { ok: true; row: Partial<ProductRow> } | { ok: false; error: string } {
  if (!body) return { ok: false, error: 'Invalid body' }
  const row: Partial<ProductRow> = {}
  const has = (k: string) => k in body

  if (!partial || has('slug')) {
    if (typeof body.slug !== 'string' || !SLUG.test(body.slug)) return { ok: false, error: 'Slug: use a-z, 0-9 e hífen' }
    row.slug = body.slug
  }
  if (!partial || has('name')) {
    if (typeof body.name !== 'string' || !body.name.trim()) return { ok: false, error: 'Nome obrigatório' }
    row.name = body.name.trim().slice(0, 120)
  }
  if (!partial || has('priceCents')) {
    const p = body.priceCents
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 0) return { ok: false, error: 'Preço inválido' }
    row.price_cents = p
  }
  if (!partial || has('colors')) {
    const c = strList(body.colors)
    if (!c || c.length === 0) return { ok: false, error: 'Informe ao menos uma cor' }
    row.colors = c
  }
  if (!partial || has('sizes')) {
    const s = strList(body.sizes)
    if (!s || s.length === 0) return { ok: false, error: 'Informe ao menos um tamanho' }
    row.sizes = s
  }
  if (!partial || has('weightOz')) {
    const w = body.weightOz
    if (typeof w !== 'number' || !(w >= 0) || w > 1000) return { ok: false, error: 'Peso inválido' }
    row.weight_oz = w
  }
  if (has('imageUrl')) row.image_url = typeof body.imageUrl === 'string' && body.imageUrl.trim() ? body.imageUrl.trim() : null
  if (has('active')) row.active = body.active === true
  return { ok: true, row }
}
