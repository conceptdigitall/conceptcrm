import type { ColumnKind } from '@/types';
import type { LayaAnswer, LayaQuestion } from '@/lib/prospecting/columns';

/** Limiar mínimo de separação entre a 1ª e a 2ª probabilidade (ΔP) para aceitar Laya local */
export const DEFAULT_CONFIDENCE_THRESHOLD = 0.60;

/** Palavras e termos de amenidades periféricas que causam falsos positivos no Laya */
const AMENITY_NOISE_REGEX = /\b(café|cafezinho|chá|cerveja|chopp|bar|snack|lanche|wi-?fi|ar[\s-]condicionado|estacionamento|valet|manobrista|brinquedoteca)\b/gi;

/**
 * Sanitiza o texto da ficha de lead para eliminar ruídos periféricos
 * que frequentemente induzem o modelo local a errar categorias.
 */
export function sanitizeLeadContext(rawContext: string): string {
  if (!rawContext) return '';

  const lines = rawContext.split('\n');
  const sanitizedLines: string[] = [];

  for (const line of lines) {
    // Linhas estruturais essenciais permanecem protegidas
    if (
      line.startsWith('Nome:') ||
      line.startsWith('Categoria:') ||
      line.startsWith('Local:') ||
      line.startsWith('Nota no Google:') ||
      line.startsWith('Tem site') ||
      line.startsWith('Sem site') ||
      line.startsWith('Tem celular') ||
      line.startsWith('Só telefone fixo')
    ) {
      sanitizedLines.push(line);
      continue;
    }

    // Em linhas de 'Sobre:' ou 'Descrição:', remove amenidades confusas
    if (line.startsWith('Sobre:') || line.startsWith('Descrição:')) {
      const cleaned = line.replace(AMENITY_NOISE_REGEX, '').replace(/\s{2,}/g, ' ').trim();
      if (cleaned.length > 10) {
        sanitizedLines.push(cleaned);
      }
      continue;
    }

    sanitizedLines.push(line);
  }

  return sanitizedLines.join('\n');
}

export interface ConfidenceAssessment {
  value: string;
  confidence: number;
  margin: number;
  isConfident: boolean;
}

/**
 * Avalia a margem de certeza da Laya calculando a separação entre a melhor
 * hipótese e a segunda melhor (ΔP = P_top1 - P_top2).
 */
export function assessLayaConfidence(
  kind: ColumnKind,
  options: string[],
  answer: LayaAnswer,
  threshold = DEFAULT_CONFIDENCE_THRESHOLD,
): ConfidenceAssessment {
  if (kind === 'noul') {
    const pYes = typeof answer.noul === 'number' ? Math.max(0, Math.min(1, answer.noul)) : 0.5;
    const pNo = 1 - pYes;
    const isYes = pYes >= 0.5;
    const topP = isYes ? pYes : pNo;
    const margin = Math.abs(pYes - pNo); // |2p - 1|

    return {
      value: isYes ? 'sim' : 'não',
      confidence: Math.round(topP * 1000) / 1000,
      margin: Math.round(margin * 1000) / 1000,
      isConfident: margin >= threshold,
    };
  }

  const probs = answer.probabilities ?? {};
  const entries = Object.entries(probs)
    .map(([key, p]) => ({ key, p }))
    .sort((a, b) => b.p - a.p);

  if (entries.length === 0) {
    return {
      value: answer.choice ?? options[0] ?? '',
      confidence: answer.answer_confidence ?? 0.5,
      margin: 0,
      isConfident: false,
    };
  }

  const top1 = entries[0];
  const top2 = entries.length > 1 ? entries[1] : { p: 0 };
  const margin = top1.p - top2.p;

  let resolvedValue = top1.key;
  if (kind === 'score') {
    const idx = Number(top1.key);
    resolvedValue = Number.isInteger(idx) && idx >= 0 && idx < options.length ? options[idx] : options[0];
  } else if (kind === 'choice') {
    resolvedValue = options.find((o) => o === top1.key) ?? answer.choice ?? options[0];
  }

  return {
    value: resolvedValue,
    confidence: Math.round(top1.p * 1000) / 1000,
    margin: Math.round(margin * 1000) / 1000,
    isConfident: margin >= threshold,
  };
}

export interface EnsembleArbitrationDeps {
  arbitrateWithClaude?: (leadText: string, question: LayaQuestion, options: string[]) => Promise<string>;
}

export interface EnsembleResult {
  value: string;
  confidence: number;
  source: 'laya' | 'claude_arbitration';
  escalated: boolean;
  margin: number;
}

/**
 * Pipeline Zero-Error:
 * 1. Avalia a resposta da Laya local.
 * 2. Se a confiança for alta (margem >= threshold), adota a resposta da Laya (custo zero, ~50ms).
 * 3. Se a Laya estiver em dúvida (margem < threshold), escala a dúvida para o árbitro inteligente (Claude),
 *    garantindo que NENHUM dado incorreto seja entregue ao usuário.
 */
export async function resolveEnsemblePrediction(
  kind: ColumnKind,
  options: string[],
  answer: LayaAnswer,
  leadContext: string,
  question: LayaQuestion,
  deps: EnsembleArbitrationDeps = {},
  threshold = DEFAULT_CONFIDENCE_THRESHOLD,
): Promise<EnsembleResult> {
  const assessment = assessLayaConfidence(kind, options, answer, threshold);

  // Se a Laya tem alta certeza, usa imediatamente
  if (assessment.isConfident) {
    return {
      value: assessment.value,
      confidence: assessment.confidence,
      source: 'laya',
      escalated: false,
      margin: assessment.margin,
    };
  }

  // Se a Laya hesitou e temos o árbitro disponível, escalamos para desempate
  if (deps.arbitrateWithClaude) {
    try {
      const sanitized = sanitizeLeadContext(leadContext);
      const claudeValue = await deps.arbitrateWithClaude(sanitized, question, options);
      if (claudeValue && (options.length === 0 || options.includes(claudeValue) || claudeValue === 'sim' || claudeValue === 'não')) {
        return {
          value: claudeValue,
          confidence: 0.99,
          source: 'claude_arbitration',
          escalated: true,
          margin: 1.0,
        };
      }
    } catch (err) {
      console.warn('[Ensemble] Falha no árbitro Claude, mantendo melhor palpite da Laya:', err);
    }
  }

  // Fallback seguro se não houver árbitro conectado
  return {
    value: assessment.value,
    confidence: assessment.confidence,
    source: 'laya',
    escalated: false,
    margin: assessment.margin,
  };
}
