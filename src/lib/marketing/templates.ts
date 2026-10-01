export type MarketingTemplateId = 'discount' | 'highlight' | 'institutional' | 'testimonial';

export interface TemplateFieldConfig {
  id: string;
  label: string;
  placeholder: string;
  required?: boolean;
}

export interface MarketingTemplate {
  id: MarketingTemplateId;
  title: string;
  tagline: string;
  description: string;
  fields: TemplateFieldConfig[];
}

export type TemplateFieldValues = Record<string, string | undefined>;

export const MARKETING_TEMPLATES: MarketingTemplate[] = [
  {
    id: 'discount',
    title: 'Oferta & Desconto',
    tagline: 'Promoção rápida com preço e prazo',
    description: 'Ideal para criar senso de urgência e atrair agendamentos rápidos no WhatsApp.',
    fields: [
      { id: 'item', label: 'Qual é o produto ou serviço?', placeholder: 'Ex: Corte de Cabelo + Barba', required: true },
      { id: 'price', label: 'Preço ou desconto promocional:', placeholder: 'Ex: R$ 59,90 ou 30% OFF', required: true },
      { id: 'deadline', label: 'Prazo ou condição especial (opcional):', placeholder: 'Ex: Somente nesta quinta e sexta' },
      { id: 'cta', label: 'Chamada para ação (CTA):', placeholder: 'Ex: Agende agora pelo WhatsApp' },
    ],
  },
  {
    id: 'highlight',
    title: 'Destaque de Serviço / Produto',
    tagline: 'Foco na qualidade e nos benefícios',
    description: 'Destaca as fotos dos seus melhores serviços, mostrando os diferenciais.',
    fields: [
      { id: 'name', label: 'Nome do serviço ou produto:', placeholder: 'Ex: Tratamento Capilar Intensivo', required: true },
      { id: 'benefit', label: 'Principal benefício ou diferencial:', placeholder: 'Ex: Hidratação profunda e restauração dos fios', required: true },
      { id: 'target', label: 'Para quem é indicado (opcional):', placeholder: 'Ex: Quem quer brilho e força imediata' },
      { id: 'cta', label: 'Chamada para ação (CTA):', placeholder: 'Ex: Consulte horários disponíveis no WhatsApp' },
    ],
  },
  {
    id: 'institutional',
    title: 'Conheça Nosso Espaço',
    tagline: 'Apresente seu ambiente e localização',
    description: 'Gera acolhimento e credibilidade convidando o cliente para uma visita física.',
    fields: [
      { id: 'businessName', label: 'Nome da sua empresa / espaço:', placeholder: 'Ex: Barbearia do Alemão', required: true },
      { id: 'highlights', label: 'O que o cliente encontra no espaço:', placeholder: 'Ex: Ambiente climatizado, café especial e atendimento VIP', required: true },
      { id: 'location', label: 'Endereço ou bairro:', placeholder: 'Ex: Rua das Palmeiras, 120 - Gonzaga, Santos' },
      { id: 'cta', label: 'Chamada para ação (CTA):', placeholder: 'Ex: Venha nos visitar' },
    ],
  },
  {
    id: 'testimonial',
    title: 'Prova Social & Avaliação',
    tagline: 'Depoimento e nota de cliente satisfeito',
    description: 'Usa a opinião de clientes reais para quebrar objeções e acelerar novas vendas.',
    fields: [
      { id: 'feedback', label: 'O que o cliente disse (elogio/avaliação):', placeholder: 'Ex: Melhor atendimento que já tive, profissionais nota 10!', required: true },
      { id: 'clientName', label: 'Nome do cliente ou fonte da nota:', placeholder: 'Ex: Avaliação 5 estrelas no Google' },
      { id: 'service', label: 'Serviço que ele realizou:', placeholder: 'Ex: Design de Barba' },
      { id: 'cta', label: 'Chamada para ação (CTA):', placeholder: 'Ex: Agende seu horário também' },
    ],
  },
];

/**
 * Compõe um briefing profissional e persuasivo a partir dos campos guiados do template.
 */
export function composeTemplatePrompt(
  templateId: MarketingTemplateId,
  values: TemplateFieldValues
): string {
  // Limpa espaços
  const cleanValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    if (v && v.trim()) {
      cleanValues[k] = v.trim();
    }
  }

  // Se nenhum campo foi preenchido
  if (Object.keys(cleanValues).length === 0) {
    return '';
  }

  switch (templateId) {
    case 'discount': {
      const { item, price, deadline, cta } = cleanValues;
      const parts: string[] = ['Vídeo promocional de alta conversão. Oferta imperdível:'];
      if (item) parts.push(`Destaque para o serviço/produto: ${item}.`);
      if (price) parts.push(`Condição especial: ${price}.`);
      if (deadline) parts.push(`Válido por tempo limitado: ${deadline}.`);
      if (cta) parts.push(`Chamada para ação: ${cta}.`);
      parts.push('Mostre as fotos dos serviços com transições atraentes, tipografia de impacto com o preço em evidência e ritmo dinâmico.');
      return parts.join(' ');
    }

    case 'highlight': {
      const { name, benefit, target, cta } = cleanValues;
      const parts: string[] = ['Vídeo de apresentação e valorização de serviço/produto:'];
      if (name) parts.push(`Apresentando: ${name}.`);
      if (benefit) parts.push(`Diferencial exclusivo: ${benefit}.`);
      if (target) parts.push(`Perfeito para: ${target}.`);
      if (cta) parts.push(`Finalize convidando: ${cta}.`);
      parts.push('Destaque as imagens com movimentos suaves de zoom e foco nos detalhes da qualidade.');
      return parts.join(' ');
    }

    case 'institutional': {
      const { businessName, highlights, location, cta } = cleanValues;
      const parts: string[] = ['Vídeo institucional convidativo:'];
      if (businessName) parts.push(`Conheça o espaço ${businessName}.`);
      if (highlights) parts.push(`Destaques do ambiente: ${highlights}.`);
      if (location) parts.push(`Estamos localizados em: ${location}.`);
      if (cta) parts.push(`Chamada final: ${cta}.`);
      parts.push('Crie uma atmosfera de acolhimento, sofisticação e profissionalismo.');
      return parts.join(' ');
    }

    case 'testimonial': {
      const { feedback, clientName, service, cta } = cleanValues;
      const parts: string[] = ['Vídeo de prova social e credibilidade:'];
      if (feedback) parts.push(`Depoimento em destaque: "${feedback}".`);
      if (clientName) parts.push(`Origem da avaliação: ${clientName}.`);
      if (service) parts.push(`Serviço realizado: ${service}.`);
      if (cta) parts.push(`Chamada para ação: ${cta}.`);
      parts.push('Use as fotos reais como plano de fundo elegante, transmitindo confiança máxima para quem está assistindo.');
      return parts.join(' ');
    }

    default:
      return '';
  }
}
