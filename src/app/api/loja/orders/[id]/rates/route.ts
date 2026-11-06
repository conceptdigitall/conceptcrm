import { NextResponse } from 'next/server'
import { toErrorResponse } from '@/lib/auth/account'
import { supabaseAdmin } from '@/lib/store/admin-client'
import { storeAccount, storeErrorResponse } from '@/lib/store/authed-route'
import { itemsWeightOz, loadOrder } from '@/lib/store/order-query'
import { loadStoreSettings } from '@/lib/store/settings'
import { getRates, ShippoError } from '@/lib/store/shippo'

type Params = { params: Promise<{ id: string }> }

/** GET /api/loja/orders/[id]/rates — cotações do Shippo, a mais barata primeiro. */
export async function GET(_request: Request, { params }: Params) {
  try {
    const { accountId } = await storeAccount('agent')
    const { id } = await params
    const db = supabaseAdmin()
    const order = await loadOrder(db, accountId, id)
    if (!order) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (order.status !== 'paid' && order.status !== 'preparing') {
      return NextResponse.json({ error: 'invalid_status' }, { status: 409 })
    }

    const loaded = await loadStoreSettings(db, accountId)
    const { senderAddress, box } = loaded?.settings ?? {}
    const apiKey = loaded?.secrets.shippoApiKey
    if (!apiKey || !senderAddress || !box) {
      return NextResponse.json({ error: 'Configure o Shippo, o endereço de envio e a caixa em Configurações → Loja' }, { status: 412 })
    }
    if (!order.shipping_address) return NextResponse.json({ error: 'Pedido sem endereço de entrega' }, { status: 422 })

    const weight = (await itemsWeightOz(db, accountId, id)) + Number(box.weight_oz)
    const rates = await getRates(apiKey, {
      from: senderAddress,
      to: order.shipping_address,
      parcel: { length: box.length, width: box.width, height: box.height, weight_oz: weight },
    })
    return NextResponse.json({ rates })
  } catch (err) {
    if (err instanceof ShippoError) {
      return NextResponse.json({ error: err.message, messages: err.messages }, { status: 502 })
    }
    return storeErrorResponse(err, toErrorResponse)
  }
}
