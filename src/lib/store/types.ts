// Tipos do módulo Loja (pedidos, pós-venda e analytics).

export type OrderStatus =
  | 'paid'
  | 'preparing'
  | 'label_ready'
  | 'shipped'
  | 'delivered'
  | 'canceled'
  | 'refunded'

export type OrderAction =
  | 'start_preparing'
  | 'label_bought'
  | 'mark_shipped'
  | 'mark_delivered'
  | 'refund'

export type CartLine = { slug: string; color: string; size: string; qty: number }

export type StoreProduct = {
  id: string
  slug: string
  name: string
  price_cents: number
  colors: string[]
  sizes: string[]
  weight_oz: number
  image_url: string | null
  active: boolean
}

export type PricedItem = {
  product: StoreProduct
  color: string
  size: string
  qty: number
  unit_cents: number
}

export type Address = {
  name: string
  street1: string
  street2?: string | null
  city: string
  state: string
  zip: string
  country: string
  phone?: string | null
  email?: string | null
}

/** Caixa padrão, em polegadas; weight_oz = caixa vazia. */
export type Box = { length: number; width: number; height: number; weight_oz: number }
