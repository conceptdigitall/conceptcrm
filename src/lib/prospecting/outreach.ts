import type { Lead } from '@/types';

export type SatisfactionLevel = 'muito-alta' | 'alta' | 'media' | 'baixa' | 'sem-dados';

export const SATISFACTION_LABEL: Record<SatisfactionLevel, string> = {
  'muito-alta': 'Clientes muito satisfeitos',
  alta: 'Clientes satisfeitos',
  media: 'Satisfação média',
  baixa: 'Clientes insatisfeitos',
  'sem-dados': 'Sem avaliações',
};

// A 4.9★ with 3 reviews says little; below 10 reviews we cap at "media".
export function satisfactionLevel(
  rating: number | null | undefined,
  reviewCount: number | null | undefined,
): SatisfactionLevel {
  if (rating == null || !reviewCount) return 'sem-dados';
  const r = Number(rating);
  if (reviewCount < 10) return r >= 3.8 ? 'media' : 'baixa';
  if (r >= 4.7 && reviewCount >= 50) return 'muito-alta';
  if (r >= 4.3) return 'alta';
  if (r >= 3.8) return 'media';
  return 'baixa';
}

type OutreachLead = Pick<Lead, 'name' | 'category' | 'rating' | 'review_count' | 'website'>;

// Primeiro contato: sem preço (regra comercial da Concept), curto e com pergunta no fim.
export function buildOutreachMessage(lead: OutreachLead, sender = 'João'): string {
  const elogio =
    lead.rating && lead.review_count && Number(lead.rating) >= 4.3
      ? ` ${lead.rating}★ com ${lead.review_count} avaliações no Google, parabéns pelo trabalho!`
      : '';
  const gancho = lead.website
    ? 'Ajudamos negócios como o de vocês a responder clientes e marcar horários no WhatsApp 24h, com uma recepcionista de IA.'
    : 'Vi que vocês ainda não têm site. Ajudamos negócios como o de vocês a aparecer no Google e receber clientes direto no WhatsApp.';
  return [
    `Oi, tudo bem? Encontrei a ${lead.name} no Google Maps.${elogio}`,
    `Sou o ${sender}, da Concept Digital. ${gancho}`,
    'Posso te mostrar um exemplo rápido de como ficaria para vocês?',
  ].join('\n\n');
}

export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
