// Modelos dos e-mails ao comprador (em inglês, com a marca da loja).

export type OrderEmailKind = 'confirmed' | 'shipped' | 'delivered' | 'refunded'

export type OrderEmailContext = {
  storeName: string
  orderNumber: string
  customerName: string
  items: { name: string; color: string | null; size: string | null; qty: number; unitCents: number }[]
  totalCents: number
  trackingNumber?: string | null
  trackingUrl?: string | null
  eta?: string | null
  reviewUrl?: string | null
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c])

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`

const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'there'

function etaText(eta?: string | null): string | null {
  if (!eta) return null
  const d = new Date(eta)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${esc(href)}" style="background:#1a1a1a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${esc(label)}</a></p>`

export function renderOrderEmail(
  kind: OrderEmailKind,
  ctx: OrderEmailContext,
): { subject: string; html: string; text: string } {
  const hi = `Hi ${firstName(ctx.customerName)},`
  const eta = etaText(ctx.eta)
  let subject: string
  let lines: string[]
  let extraHtml = ''

  switch (kind) {
    case 'confirmed':
      subject = `Order ${ctx.orderNumber} confirmed`
      lines = [hi, `Thank you for your order! We're getting it ready and will email you as soon as it ships.`]
      break
    case 'shipped':
      subject = 'Your order is on the way'
      lines = [
        hi,
        `Good news: order ${ctx.orderNumber} has shipped.`,
        ...(ctx.trackingNumber ? [`Tracking number: ${ctx.trackingNumber}`] : []),
        ...(eta ? [`Estimated delivery: ${eta}`] : []),
      ]
      if (ctx.trackingUrl) extraHtml = button(ctx.trackingUrl, 'Track your package')
      break
    case 'delivered':
      subject = 'Delivered!'
      lines = [hi, `Your order ${ctx.orderNumber} was delivered. We hope you love it.`]
      if (ctx.reviewUrl) {
        lines.push('Would you share how it fits? Your review helps our small shop a lot.')
        extraHtml = button(ctx.reviewUrl, 'Leave a review')
      }
      break
    case 'refunded':
      subject = 'Your refund is on its way'
      lines = [hi, `We refunded order ${ctx.orderNumber}. It usually shows on your statement within 5-10 business days.`]
      break
  }

  const variant = (i: OrderEmailContext['items'][number]) => [i.color, i.size].filter(Boolean).join(' / ')
  const itemsHtml = ctx.items
    .map((i) => {
      const v = variant(i)
      const label = `${esc(i.qty)} × ${esc(i.name)}${v ? ` <span style="color:#777">(${esc(v)})</span>` : ''}`
      return `<tr><td style="padding:4px 0">${label}</td><td style="padding:4px 0;text-align:right">${money(i.unitCents * i.qty)}</td></tr>`
    })
    .join('')
  const showItems = kind === 'confirmed' || kind === 'refunded'
  const table = showItems
    ? `<table style="width:100%;border-top:1px solid #eee;margin-top:16px;padding-top:8px;font-size:14px">${itemsHtml}<tr><td style="padding-top:8px;font-weight:bold">Total</td><td style="padding-top:8px;text-align:right;font-weight:bold">${money(ctx.totalCents)}</td></tr></table>`
    : ''

  const html = `<!doctype html><html><body style="margin:0;background:#f6f4f1;font-family:Helvetica,Arial,sans-serif;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:32px 24px">
<p style="font-size:20px;font-weight:bold;letter-spacing:.04em;margin:0 0 24px">${esc(ctx.storeName)}</p>
<div style="background:#fff;border-radius:10px;padding:28px">
${lines.map((l) => `<p style="margin:0 0 12px;line-height:1.5">${esc(l)}</p>`).join('\n')}
${extraHtml}
${table}
<p style="margin:16px 0 0;color:#777;font-size:13px">Order ${esc(ctx.orderNumber)}</p>
</div>
<p style="color:#999;font-size:12px;margin-top:16px">Questions? Just reply to this email.</p>
</div></body></html>`

  const text = [
    ...lines,
    ...(kind === 'shipped' && ctx.trackingUrl ? [`Track: ${ctx.trackingUrl}`] : []),
    ...(kind === 'delivered' && ctx.reviewUrl ? [`Review: ${ctx.reviewUrl}`] : []),
    ...(showItems
      ? ['', ...ctx.items.map((i) => `${i.qty} x ${i.name} ${variant(i)} - ${money(i.unitCents * i.qty)}`), `Total: ${money(ctx.totalCents)}`]
      : []),
    '',
    `Order ${ctx.orderNumber} - ${ctx.storeName}`,
  ].join('\n')

  return { subject, html, text }
}
