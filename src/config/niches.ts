export type NicheKey =
  | 'concept'
  | 'advogado'
  | 'clinica'
  | 'fotografo'
  | 'barbeiro'
  | 'ecommerce'
  | 'imobiliaria';

export interface NicheFieldLabels {
  serviceLabel: string;
  conditionLabel: string;
  actionLabel: string;
}

export interface NicheConfig {
  key: NicheKey;
  label: string;
  description: string;
  defaultReactivationDays: number;
  tone: string;
  badge: string;
  hasMapsScraper: boolean;
  fieldLabels: NicheFieldLabels;
}

export const NICHES: Record<NicheKey, NicheConfig> = {
  concept: {
    key: 'concept',
    label: 'Concept Digital (Agência)',
    description: 'Prospecção B2B de novos clientes com Maps Scraper, Laya e radar interno.',
    defaultReactivationDays: 45,
    tone: 'Consultivo, estratégico, parceiro de negócios',
    badge: 'Agência Digital',
    hasMapsScraper: true,
    fieldLabels: {
      serviceLabel: 'Solução / Projeto',
      conditionLabel: 'Proposta Comercial',
      actionLabel: 'Reunião de Diagnóstico',
    },
  },
  advogado: {
    key: 'advogado',
    label: 'Advogados & Escritórios',
    description: 'Prospecção consultiva e preventiva com total aderência ao Código de Ética da OAB.',
    defaultReactivationDays: 180,
    tone: 'Formal, consultivo e informativo',
    badge: 'Jurídico',
    hasMapsScraper: false,
    fieldLabels: {
      serviceLabel: 'Área / Causa',
      conditionLabel: 'Informativo / Consulta',
      actionLabel: 'Agendar Consulta',
    },
  },
  clinica: {
    key: 'clinica',
    label: 'Clínicas & Consultórios',
    description: 'Resgate de orçamentos, recalls preventivos e avaliações pós-procedimento.',
    defaultReactivationDays: 90,
    tone: 'Humanizado, atencioso e técnico',
    badge: 'Saúde & Estética',
    hasMapsScraper: false,
    fieldLabels: {
      serviceLabel: 'Procedimento / Consulta',
      conditionLabel: 'Condição Especial / Retorno',
      actionLabel: 'Agendar Horário',
    },
  },
  fotografo: {
    key: 'fotografo',
    label: 'Fotógrafos & Estúdios',
    description: 'Ensaios anuais, datas comemorativas e campanhas sazonais de retratos.',
    defaultReactivationDays: 60,
    tone: 'Afetivo, estético e acolhedor',
    badge: 'Fotografia & Eventos',
    hasMapsScraper: false,
    fieldLabels: {
      serviceLabel: 'Tipo de Ensaio',
      conditionLabel: 'Pacote Sazonal / Vagas',
      actionLabel: 'Reservar Sessão',
    },
  },
  barbeiro: {
    key: 'barbeiro',
    label: 'Barbearias & Salões',
    description: 'Régua de retorno semanal/quinzenal e resgate de clientes sumidos.',
    defaultReactivationDays: 21,
    tone: 'Descontraído, direto e amigável',
    badge: 'Beleza & Estilo',
    hasMapsScraper: false,
    fieldLabels: {
      serviceLabel: 'Corte / Barba',
      conditionLabel: 'Horário / Promoção',
      actionLabel: 'Garantir Cadeira',
    },
  },
  ecommerce: {
    key: 'ecommerce',
    label: 'E-commerce & Lojas',
    description: 'Recuperação de compras passadas, reposição de estoque pessoal e cupons VIP.',
    defaultReactivationDays: 30,
    tone: 'Ágil, promocional e focado em conveniência',
    badge: 'Varejo Online',
    hasMapsScraper: false,
    fieldLabels: {
      serviceLabel: 'Produto / Linha',
      conditionLabel: 'Cupom / Benefício',
      actionLabel: 'Acessar Oferta',
    },
  },
  imobiliaria: {
    key: 'imobiliaria',
    label: 'Imobiliárias & Corretores',
    description: 'Apresentação de lançamentos, imóveis compatíveis e avaliação de mercado.',
    defaultReactivationDays: 60,
    tone: 'Seguro, patrimonial e exclusivo',
    badge: 'Mercado Imobiliário',
    hasMapsScraper: false,
    fieldLabels: {
      serviceLabel: 'Tipo de Imóvel',
      conditionLabel: 'Perfil / Oportunidade',
      actionLabel: 'Agendar Visita',
    },
  },
};

export const AVAILABLE_NICHES: NicheConfig[] = Object.values(NICHES);

export function isValidNiche(key: string): key is NicheKey {
  return key in NICHES;
}

export function getNicheConfig(key?: string | null): NicheConfig {
  if (key && isValidNiche(key)) {
    return NICHES[key];
  }
  return NICHES.concept;
}
