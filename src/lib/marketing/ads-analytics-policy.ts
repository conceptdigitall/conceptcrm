export type AdPolicyVerdict = 'aprovado' | 'atencao' | 'risco_bloqueio';
export type TrafficHealthStatus = 'aprendizado' | 'escalar' | 'otimizar_atendimento' | 'otimizar_criativo';

export interface PolicyFlag {
  term: string;
  reason: string;
  suggestion: string;
}

export interface AdPolicyAudit {
  score: number;
  verdict: AdPolicyVerdict;
  verdictLabel: string;
  flaggedTerms: PolicyFlag[];
  safeRewrite: string;
}

export interface LayaTriageSpec {
  enabled: boolean;
  questions: { kind: 'noul' | 'choice' | 'score'; label: string; rule: string }[];
}

export interface TrafficMetricsInput {
  spendBrl: number;
  clicks: number;
  whatsappConversations: number;
  salesCount: number;
  averageTicketBrl: number;
  daysRunning: number;
}

export interface TrafficHealthDiagnosis {
  status: TrafficHealthStatus;
  statusLabel: string;
  cplBrl: number;
  cacBrl: number;
  revenueBrl: number;
  roas: number;
  headlineVerdict: string;
  actionRecommendation: string;
  antiMistakeAlert: string;
}

const POLICY_RISK_RULES: { pattern: RegExp; term: string; reason: string; suggestion: string }[] = [
  {
    pattern: /\b(100%\s*garantid[oa]|garantia\s+absoluta|resultado\s+garantido)\b/i,
    term: 'Promessa de resultado 100% garantido',
    reason: 'A Meta reprova promessas absolutas ou irreais de resultado.',
    suggestion: 'Use "método comprovado", "alta satisfação" ou "acompanhamento dedicado".',
  },
  {
    pattern: /\b(antes\s+e\s+depois|emagreça\s+\d+\s*kg|cura\s+definitiva|sem\s+dor\s+alguma)\b/i,
    term: 'Termo médico/estético sensível (Antes e Depois / Cura)',
    reason: 'Políticas de Saúde e Aparência Pessoal da Meta penalizam comparações diretas ou promessas clínicas.',
    suggestion: 'Foque no conforto do protocolo, avaliação individualizada e bem-estar.',
  },
  {
    pattern: /\b(fique\s+rico|dinheiro\s+f[aá]cil|dobrar\s+seu\s+faturamento\s+em\s+\d+\s+dias)\b/i,
    term: 'Promessa financeira irreal',
    reason: 'Classificado como oportunidade enganosa de ganhos pelo algoritmo de revisão.',
    suggestion: 'Use "previsibilidade comercial", "mais orçamentos qualificados" ou "crescimento estruturado".',
  },
  {
    pattern: /\b(voc[êe]\s+est[aá]\s+acima\s+do\s+peso|voc[êe]\s+est[aá]\s+endividad[oa]|sua\s+calv[íi]cie)\b/i,
    term: 'Atributo pessoal direto ("Você sofre de...")',
    reason: 'A Meta proíbe apontar condições físicas, financeiras ou de saúde diretamente ao usuário.',
    suggestion: 'Troque "Você está com..." por "Para quem busca melhorar..." ou "Conheça a solução para...".',
  },
];

export function auditMetaAdPolicy(text: string): AdPolicyAudit {
  const flaggedTerms: PolicyFlag[] = [];
  let safeRewrite = text;

  for (const rule of POLICY_RISK_RULES) {
    if (rule.pattern.test(text)) {
      flaggedTerms.push({
        term: rule.term,
        reason: rule.reason,
        suggestion: rule.suggestion,
      });
      safeRewrite = safeRewrite.replace(rule.pattern, 'resultados reais com atendimento especializado');
    }
  }

  const penalty = flaggedTerms.length * 30;
  const score = Math.max(10, 100 - penalty);
  const verdict: AdPolicyVerdict =
    flaggedTerms.length === 0 ? 'aprovado' : flaggedTerms.length === 1 ? 'atencao' : 'risco_bloqueio';
  const verdictLabel =
    verdict === 'aprovado'
      ? 'Aprovado pela Laya (100% Seguro para Meta Ads)'
      : verdict === 'atencao'
      ? 'Atenção: 1 termo sensível detectado (Recomendado ajustar)'
      : 'Risco de Bloqueio: Substitua os termos sinalizados antes de subir';

  return { score, verdict, verdictLabel, flaggedTerms, safeRewrite };
}

export function buildLayaLeadTriageSpec(): LayaTriageSpec {
  return {
    enabled: true,
    questions: [
      {
        kind: 'noul',
        label: 'Tem intenção real de compra?',
        rule: 'Separa leads prontos para fechar de curiosos logo na 1ª mensagem do WhatsApp.',
      },
      {
        kind: 'choice',
        label: 'Nível de urgência: imediato, orçando, curioso',
        rule: 'Prioriza no topo do CRM quem quer horário/entrega para hoje ou esta semana.',
      },
      {
        kind: 'score',
        label: 'Potencial de fechamento (0 a 3)',
        rule: 'Pontua automaticamente para o time comercial ou Recepcionista de IA focar no lucro.',
      },
    ],
  };
}

export function analyzeTrafficHealth(input: TrafficMetricsInput): TrafficHealthDiagnosis {
  const spend = Math.max(0, input.spendBrl);
  const convs = Math.max(0, input.whatsappConversations);
  const sales = Math.max(0, input.salesCount);
  const ticket = Math.max(0, input.averageTicketBrl);
  const days = Math.max(1, input.daysRunning);

  const cplBrl = convs > 0 ? Number((spend / convs).toFixed(2)) : spend;
  const cacBrl = sales > 0 ? Number((spend / sales).toFixed(2)) : spend;
  const revenueBrl = Number((sales * ticket).toFixed(2));
  const roas = spend > 0 ? Number((revenueBrl / spend).toFixed(2)) : 0;

  if (days < 3) {
    return {
      status: 'aprendizado',
      statusLabel: 'Fase de Aprendizado (Não Pausar)',
      cplBrl,
      cacBrl,
      revenueBrl,
      roas,
      headlineVerdict: 'O algoritmo da Meta ainda está calibrando o público do seu raio local.',
      actionRecommendation: 'Mantenha o anúncio rodando por pelo menos 4 a 7 dias antes de mexer no orçamento.',
      antiMistakeAlert: 'Regra de Ouro Concept: Parar campanha no 1º ou 2º dia joga fora a inteligência do pixel.',
    };
  }

  if (convs >= 6 && sales === 0) {
    return {
      status: 'otimizar_atendimento',
      statusLabel: 'Atenção no Fechamento (WhatsApp)',
      cplBrl,
      cacBrl,
      revenueBrl,
      roas,
      headlineVerdict: `O anúncio trouxe ${convs} conversas no WhatsApp (R$ ${cplBrl.toFixed(2)}/lead), mas ainda sem vendas fechadas.`,
      actionRecommendation: 'O anúncio está cumprindo o papel dele! Revise a velocidade de resposta no WhatsApp e ative a Recepcionista de IA.',
      antiMistakeAlert: 'Anúncio traz o cliente até a porta; quem fecha a venda é o atendimento rápido + CRM.',
    };
  }

  if (sales > 0 && (roas >= 3 || (convs >= 5 && cplBrl <= 12))) {
    return {
      status: 'escalar',
      statusLabel: 'Saúde Excelente · Pronto para Escalar',
      cplBrl,
      cacBrl,
      revenueBrl,
      roas,
      headlineVerdict: `Retorno de ${roas}x sobre o investimento com Custo por Conversa de R$ ${cplBrl.toFixed(2)}.`,
      actionRecommendation: 'Aumente o orçamento diário em 20% mantendo o mesmo criativo vencedor.',
      antiMistakeAlert: 'Nunca julgue apenas o CPL isolado: foque no lucro líquido (ROAS e CAC) que entra no CRM.',
    };
  }

  return {
    status: 'otimizar_criativo',
    statusLabel: 'Ajustar Gancho do Criativo',
    cplBrl,
    cacBrl,
    revenueBrl,
    roas,
    headlineVerdict: `Custo por conversa em R$ ${cplBrl.toFixed(2)}. Podemos atrair mais cliques qualificados no raio local.`,
    actionRecommendation: 'Teste o Ângulo 1 (Dor Urgente) ou transforme um vídeo/Reels da aba Marketing em anúncio com 1 clique.',
    antiMistakeAlert: 'Criativos focados em uma dor clara filtram curiosos antes mesmo do clique.',
  };
}
