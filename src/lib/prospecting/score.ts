export interface ScoreInput {
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  isMobile: boolean;
}

// Higher = better target for selling a site/CRM/IA receptionist.
export function scoreLead(input: ScoreInput): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (!input.website || !input.website.trim()) {
    score += 35;
    reasons.push('Sem site');
  }
  if (input.rating !== null && input.rating < 4.3) {
    score += 20;
    reasons.push(`Nota baixa (${input.rating.toFixed(1).replace('.', ',')})`);
  }
  if (input.reviewCount === null || input.reviewCount === 0) {
    score += 20;
    reasons.push('Sem avaliações');
  } else if (input.reviewCount < 30) {
    score += 20;
    reasons.push(`Poucas avaliações (${input.reviewCount})`);
  }
  if (input.isMobile) {
    score += 25;
    reasons.push('Tem celular (WhatsApp)');
  }
  return { score: Math.min(score, 100), reasons };
}
