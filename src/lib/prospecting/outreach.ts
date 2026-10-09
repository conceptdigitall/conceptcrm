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

/**
 * Mensagens comerciais estratégicas da Barbearia do Alemão 777 (Kawe):
 * - Noivos e Eventos: Cerimonialistas, lojas de terno, fotógrafos e espaços para o "Dia do Noivo".
 * - Estilo de Vida Masculino: Academias, crossfit, estúdios de tattoo, moda masculina e estética automotiva (cross-promotion).
 * - B2B Corporativo: Empresas, escritórios e consultórios para convênio corporativo e voucher de boas-vindas.
 */
export function buildOutreachMessage(lead: OutreachLead, sender = 'Kawe'): string {
  const cat = (lead.category || '').toLowerCase();
  const name = (lead.name || '').toLowerCase();
  const textContext = `${cat} ${name}`;

  const isWeddingEvent =
    textContext.includes('casamento') ||
    textContext.includes('noiv') ||
    textContext.includes('cerimonial') ||
    textContext.includes('evento') ||
    textContext.includes('terno') ||
    textContext.includes('alfaiat') ||
    textContext.includes('traje') ||
    textContext.includes('fotograf') ||
    textContext.includes('buffet');

  const isLifestyle =
    textContext.includes('academia') ||
    textContext.includes('crossfit') ||
    textContext.includes('tattoo') ||
    textContext.includes('tatuag') ||
    textContext.includes('moda masculina') ||
    textContext.includes('vestuário') ||
    textContext.includes('vestuario') ||
    textContext.includes('moto') ||
    textContext.includes('automotiva') ||
    textContext.includes('lava rápido') ||
    textContext.includes('lava-rápido') ||
    textContext.includes('estética auto');

  const elogio =
    lead.rating && lead.review_count && Number(lead.rating) >= 4.3
      ? ` Vi que vocês têm ${lead.rating}★ com ${lead.review_count} avaliações no Google, parabéns pelo trabalho!`
      : '';

  if (isWeddingEvent) {
    return [
      `Olá! Tudo bem? Encontrei o contato da ${lead.name} no Google Maps.${elogio}`,
      `Sou o ${sender}, da Barbearia do Alemão aqui no Casqueiro (Cubatão). Temos um espaço completo com área de jogos, chopp gelado e pacote exclusivo do Dia do Noivo e Padrinhos (corte, barba, barboterapia relaxante e toalha quente).`,
      'Trabalhamos com parcerias e vantagens especiais para profissionais que indicam noivos. Posso te enviar uma apresentação rápida de como funciona nossa parceria?',
    ].join('\n\n');
  }

  if (isLifestyle) {
    return [
      `Olá! Tudo bem? Encontrei a ${lead.name} no Google Maps.${elogio}`,
      `Sou o ${sender}, da Barbearia do Alemão aqui no Jardim Casqueiro. Como atendemos um público muito conectado na nossa região, estamos montando ações de benefícios e vouchers cruzados com negócios parceiros.`,
      'A ideia é gerar valor para os clientes de vocês e movimentar nosso público local. Podemos trocar uma ideia rápida no WhatsApp para você ver como funciona?',
    ].join('\n\n');
  }

  return [
    `Olá! Tudo bem? Encontrei a ${lead.name} no Google Maps.${elogio}`,
    `Sou o ${sender}, da Barbearia do Alemão aqui no Jardim Casqueiro (Cubatão). Fechamos convênios corporativos de cuidados masculinos (corte, barba e barboterapia) com vantagens exclusivas para colaboradores de empresas da nossa região.`,
    'Podemos liberar um voucher cortesia de primeiro corte para vocês conhecerem nosso espaço e apresentar a proposta para a equipe?',
  ].join('\n\n');
}

export function whatsappUrl(phone: string, text: string): string {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}

