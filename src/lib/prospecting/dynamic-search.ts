import type { Lead, LeadColumnValue } from '@/types';
import { satisfactionLevel } from './outreach';

export type ProbabilityLevel = 'alta' | 'media' | 'baixa';

export interface LeadRankingResult {
  leadId: string;
  probability: number; // 0 a 100
  probabilityLevel: ProbabilityLevel;
  reasons: string[];
}

export const AUDIENCE_CATEGORIES: Record<string, string[]> = {
  'Saúde & Clínicas': ['clinica', 'medico', 'dentista', 'odontolog', 'psicolog', 'fisioterap', 'hospital', 'laboratorio', 'saude'],
  'Beleza & Bem-Estar': ['barbearia', 'salao', 'estetica', 'manicure', 'spa', 'beleza', 'cabelo', 'tatuagem'],
  'Alimentação & Bares': ['restaurante', 'lanchonete', 'adega', 'pizzaria', 'hamburguer', 'bar', 'cafe', 'padaria', 'delivery'],
  'Serviços & Reparos': ['oficina', 'mecanica', 'auto', 'advogado', 'contabilidade', 'imobiliaria', 'pet shop', 'veterinari', 'academia'],
};

/**
 * Normaliza strings para comparações case-insensitive e sem acentos.
 */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

/**
 * Extrai regiões distintas (bairros ou cidades) a partir da lista de leads.
 */
export function extractDistinctRegions(leads: Lead[]): string[] {
  const regions = new Set<string>();

  for (const lead of leads) {
    const raw = (lead.raw ?? {}) as Record<string, unknown>;
    const complete = (raw.complete_address ?? {}) as Record<string, unknown>;
    const borough = typeof complete.borough === 'string' && complete.borough.trim() ? complete.borough.trim() : null;
    const city = typeof complete.city === 'string' && complete.city.trim() ? complete.city.trim() : null;

    if (borough && city) {
      regions.add(`${borough}, ${city}`);
    } else if (city) {
      regions.add(city);
    } else if (borough) {
      regions.add(borough);
    } else if (lead.address) {
      // Heurística para extrair bairro/cidade do endereço textual simples
      const parts = lead.address.split(' - ');
      if (parts.length >= 2) {
        const lastPart = parts[parts.length - 1].trim();
        if (lastPart) regions.add(lastPart);
      }
    }
  }

  return Array.from(regions).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

/**
 * Mapeia o público de um lead com base na categoria e termos da ficha do Google.
 */
export function getLeadAudience(lead: Lead): string {
  const categoryText = normalizeText(lead.category ?? '');
  const raw = (lead.raw ?? {}) as Record<string, unknown>;
  const rawCategories = Array.isArray(raw.categories)
    ? raw.categories.map((c) => (typeof c === 'string' ? normalizeText(c) : '')).join(' ')
    : '';

  const fullText = `${categoryText} ${rawCategories}`;

  for (const [audience, keywords] of Object.entries(AUDIENCE_CATEGORIES)) {
    if (keywords.some((k) => fullText.includes(k))) {
      return audience;
    }
  }

  return 'Outros Negócios';
}

/**
 * Extrai todos os grupos de público presentes na lista de leads.
 */
export function extractAudienceList(leads: Lead[]): string[] {
  const audiences = new Set<string>();
  for (const lead of leads) {
    audiences.add(getLeadAudience(lead));
  }
  return Array.from(audiences).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export interface CalculateProbabilityOptions {
  query?: string;
  layaScore?: number; // 0.0 a 1.0 vindo da inferência semântica do Laya
  columnValues?: LeadColumnValue[];
}

/**
 * Calcula a probabilidade de fechamento de negócio para um lead.
 * Combina Laya + Colunas IA existentes (PR #9) + Nível de Satisfação + Oportunidade prática.
 */
export function calculateClosingProbability(
  lead: Lead,
  options: CalculateProbabilityOptions = {},
): { probability: number; probabilityLevel: ProbabilityLevel; reasons: string[] } {
  let score = 30; // base inicial
  const reasons: string[] = [];

  const queryNorm = normalizeText(options.query ?? '');

  // 1. Inferência semântica do Laya (se fornecida)
  if (typeof options.layaScore === 'number') {
    const layaPoints = Math.round(options.layaScore * 35);
    score += layaPoints;
    if (options.layaScore >= 0.7) {
      reasons.push('Alta afinidade detectada pela Laya');
    } else if (options.layaScore <= 0.3) {
      reasons.push('Baixa aderência semântica');
    }
  } else if (queryNorm) {
    // Heurística de apoio caso o Laya esteja indisponível
    const leadText = normalizeText(`${lead.name} ${lead.category ?? ''} ${lead.address ?? ''}`);
    const tokens = queryNorm.split(' ').filter((t) => t.length > 3);
    const matches = tokens.filter((t) => leadText.includes(t));
    if (matches.length > 0) {
      const matchBonus = Math.min(25, matches.length * 10);
      score += matchBonus;
      reasons.push(`Correspondência com termos da busca`);
    }
  }

  // 2. Colunas da Planilha Preditiva já calculadas pelo Laya (PR #9)
  if (options.columnValues && options.columnValues.length > 0) {
    for (const cv of options.columnValues) {
      const effectiveVal = (cv.corrected_value ?? cv.value ?? '').toLowerCase();
      // Checa colunas de poder aquisitivo / financeiro
      if (effectiveVal === 'alto') {
        score += 15;
        reasons.push('Alto poder aquisitivo estimado');
      } else if (effectiveVal === 'baixo') {
        score -= 10;
      }
      // Checa colunas sobre ter site
      if (queryNorm.includes('site') || queryNorm.includes('presenca')) {
        if (effectiveVal === 'não' || effectiveVal === 'nao') {
          score += 20;
          reasons.push('Sem site (alta necessidade)');
        }
      }
    }
  }

  // 3. Satisfação dos clientes e volume de avaliações
  const sat = satisfactionLevel(lead.rating, lead.review_count);
  const reviewCount = lead.review_count ?? 0;

  if (queryNorm.includes('recepcionista') || queryNorm.includes('atendimento') || queryNorm.includes('ia')) {
    // Negócios com alto fluxo de avaliações e média/baixa satisfação têm dores críticas de atendimento
    if (reviewCount >= 40 && (sat === 'media' || sat === 'baixa')) {
      score += 20;
      reasons.push('Alto volume com gargalo de atendimento');
    } else if (sat === 'muito-alta' || sat === 'alta') {
      score += 12;
      reasons.push('Negócio estabelecido e bem avaliado');
    }
  } else {
    if (sat === 'muito-alta' || sat === 'alta') {
      score += 15;
      reasons.push('Ótima reputação no Google');
    } else if (sat === 'media' || sat === 'baixa') {
      score += 10;
      reasons.push('Oportunidade de melhoria de reputação');
    }
  }

  // 4. Canal de contato pronto (WhatsApp)
  if (lead.phone && lead.is_mobile) {
    score += 10;
    reasons.push('WhatsApp direto disponível');
  } else if (!lead.phone) {
    score -= 20;
    reasons.push('Sem telefone de contato');
  }

  // 5. Presença web
  if (!lead.website) {
    score += 10;
    reasons.push('Sem site próprio cadastrado');
  }

  // Clampa a probabilidade entre 5% e 98%
  const probability = Math.max(5, Math.min(98, score));

  let probabilityLevel: ProbabilityLevel = 'baixa';
  if (probability >= 70) {
    probabilityLevel = 'alta';
  } else if (probability >= 45) {
    probabilityLevel = 'media';
  }

  // Garante no máximo 3 justificativas concisas
  const cleanReasons = Array.from(new Set(reasons)).slice(0, 3);

  return { probability, probabilityLevel, reasons: cleanReasons };
}

/** True when the query reads like a name/place lookup that hits this lead's own text. */
export function matchesLeadText(lead: Pick<Lead, 'name' | 'address' | 'category'>, query: string): boolean {
  const q = normalizeText(query);
  if (q.length < 2) return false;
  return normalizeText(`${lead.name} ${lead.address ?? ''} ${lead.category ?? ''}`).includes(q);
}

export interface RankedLead {
  result: LeadRankingResult;
  /** The query matched the lead's name/address/category: shown before everything else. */
  textMatch: boolean;
}

/**
 * Instant, in-browser ranking used while the user types. `laya` (when it has
 * answered for this exact query) replaces the rule-based estimate per lead.
 */
export function rankLeads(
  leads: Lead[],
  query: string,
  valuesByLead: Map<string, LeadColumnValue[]>,
  laya?: Map<string, LeadRankingResult> | null,
): Map<string, RankedLead> {
  const ranked = new Map<string, RankedLead>();
  for (const lead of leads) {
    const result =
      laya?.get(lead.id) ?? {
        leadId: lead.id,
        ...calculateClosingProbability(lead, { query, columnValues: valuesByLead.get(lead.id) }),
      };
    ranked.set(lead.id, { result, textMatch: matchesLeadText(lead, query) });
  }
  return ranked;
}

export function compareRanked(a: RankedLead | undefined, b: RankedLead | undefined): number {
  if (!a || !b) return 0;
  if (a.textMatch !== b.textMatch) return a.textMatch ? -1 : 1;
  return b.result.probability - a.result.probability;
}
