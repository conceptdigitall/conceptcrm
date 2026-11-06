import Stripe from 'stripe'

/** Cliente Stripe com a chave secreta da loja (vem de store_secrets). */
export function getStripe(secretKey: string): Stripe {
  return new Stripe(secretKey)
}
