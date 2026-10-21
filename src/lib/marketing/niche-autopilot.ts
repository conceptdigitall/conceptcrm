import type { BusinessNiche, HashtagGroup, MarketingSettings, PostStatus } from '@/types';
import { buildCaption } from '@/lib/marketing/content';

export interface NichePreset {
  value: BusinessNiche;
  label: string;
  hint: string;
  defaultCta: string;
  hashtags: HashtagGroup[];
  dailyStories: { slot: 'Manhã' | 'Tarde' | 'Noite'; title: string; idea: string; frameText: string }[];
  dailyFeed: { title: string; idea: string };
}

export const BUSINESS_NICHES: NichePreset[] = [
  {
    value: 'barbearia',
    label: 'Barbearia',
    hint: 'Cortes, barba, agendamento rápido e fidelização.',
    defaultCta: 'Toque no link da bio e agende seu horário pelo WhatsApp sem fila.',
    hashtags: [
      { group: 'Ramo', tags: [{ t: '#barbearia', on: true }, { t: '#cortemasculino', on: true }, { t: '#barba', on: true }, { t: '#degrade', on: true }] },
    ],
    dailyStories: [
      { slot: 'Manhã', title: 'Story Manhã — Pergunta do Dia', idea: 'Sua agenda da semana já está corrida? Garanta seu horário de corte antes de lotar.', frameText: 'Semana começando! Já garantiu seu horário na cadeira hoje?' },
      { slot: 'Tarde', title: 'Story Tarde — Bastidor na Régua', idea: 'Acabamento impecável no corte e toalha quente para relaxar.', frameText: 'Cuidado nos mínimos detalhes: corte na régua + barba alinhada.' },
      { slot: 'Noite', title: 'Story Noite — Últimas Vagas', idea: 'Restam poucos horários para amanhã. Agende em 1 minuto no nosso WhatsApp.', frameText: 'Últimos horários de amanhã liberados. Chama no WhatsApp!' },
    ],
    dailyFeed: {
      title: '3 sinais de que está na hora de alinhar o visual',
      idea: 'Manter o corte e a barba em dia muda sua presença no trabalho e no fim de semana. Aqui você agenda pelo celular em segundos e é atendido na hora certa.',
    },
  },
  {
    value: 'clinica',
    label: 'Clínica / Consultório',
    hint: 'Odontologia, medicina, exames e atendimento humanizado.',
    defaultCta: 'Clique no link da bio para falar com nossa recepção e agendar sua avaliação.',
    hashtags: [
      { group: 'Saúde', tags: [{ t: '#saude', on: true }, { t: '#odontologia', on: true }, { t: '#consultorio', on: true }, { t: '#bemestar', on: true }] },
    ],
    dailyStories: [
      { slot: 'Manhã', title: 'Story Manhã — Dica de Prevenção', idea: 'Pequenos cuidados diários evitam tratamentos longos no futuro.', frameText: 'Há quanto tempo você não faz seu check-up preventivo?' },
      { slot: 'Tarde', title: 'Story Tarde — Conforto no Atendimento', idea: 'Equipamentos modernos e ambiente preparado para receber você com tranquilidade.', frameText: 'Atendimento pontual, seguro e pensado no seu conforto.' },
      { slot: 'Noite', title: 'Story Noite — Agendamento Fácil', idea: 'Precisa marcar ou tirar uma dúvida? Nossa equipe responde rápido pelo WhatsApp.', frameText: 'Ficou com alguma dúvida? Toque no link e fale conosco.' },
    ],
    dailyFeed: {
      title: 'Por que não deixar sua avaliação preventiva para depois',
      idea: 'Cuidar da saúde com antecedência garante tratamentos mais simples, rápidos e confortáveis. Nossa agenda está aberta para cuidar de você e da sua família.',
    },
  },
  {
    value: 'adega',
    label: 'Adega / Gastronomia',
    hint: 'Bebidas geladas, combos, delivery rápido e promoções.',
    defaultCta: 'Peça agora pelo nosso catálogo ou WhatsApp na bio — entrega rápida e gelada!',
    hashtags: [
      { group: 'Delivery', tags: [{ t: '#adega', on: true }, { t: '#delivery', on: true }, { t: '#bebidasgeladas', on: true }, { t: '#sextou', on: true }] },
    ],
    dailyStories: [
      { slot: 'Manhã', title: 'Story Manhã — Estoque Abastecido', idea: 'Freezer trincando e novidades prontas para o seu dia.', frameText: 'Freezer abastecido e trincando para hoje!' },
      { slot: 'Tarde', title: 'Story Tarde — Destaque do Dia', idea: 'Seleção especial de rótulos e combos com preço de loja direto na sua casa.', frameText: 'Qual vai ser a pedida de hoje? Veja nossos combos!' },
      { slot: 'Noite', title: 'Story Noite — Delivery no Ar', idea: 'Motoboy na pista! Peça direto no WhatsApp sem taxas extras.', frameText: 'Delivery rodando! Peça no WhatsApp e receba gelado em minutos.' },
    ],
    dailyFeed: {
      title: 'Combo pronto para reunir os amigos sem sair de casa',
      idea: 'Não perca tempo no mercado nem pague taxas caras em aplicativos. Peça direto pelo nosso WhatsApp e receba tudo gelado na porta de casa.',
    },
  },
  {
    value: 'estetica',
    label: 'Estética / Salão',
    hint: 'Procedimentos, autocuidado, beleza e resultados.',
    defaultCta: 'Agende seu momento de autocuidado pelo link da bio.',
    hashtags: [
      { group: 'Beleza', tags: [{ t: '#estetica', on: true }, { t: '#autocuidado', on: true }, { t: '#beleza', on: true }, { t: '#salaodebeleza', on: true }] },
    ],
    dailyStories: [
      { slot: 'Manhã', title: 'Story Manhã — Momento de Cuidado', idea: 'Separar uma hora da semana para cuidar de você renova sua autoestima.', frameText: 'Qual procedimento você merece fazer por você hoje?' },
      { slot: 'Tarde', title: 'Story Tarde — Protocolo em Ação', idea: 'Produtos de alta qualidade aplicados com técnica especializada.', frameText: 'Resultados reais com produtos selecionados para sua pele e cabelo.' },
      { slot: 'Noite', title: 'Story Noite — Horários da Semana', idea: 'Garanta seu horário para o fim de semana pelo nosso WhatsApp.', frameText: 'Agenda da semana aberta! Garanta seu horário pelo link da bio.' },
    ],
    dailyFeed: {
      title: 'O segredo para resultados duradouros no seu autocuidado',
      idea: 'A combinação entre atendimento personalizado e acompanhamento profissional transforma sua rotina de beleza. Venha conhecer nossos protocolos.',
    },
  },
  {
    value: 'advocacia',
    label: 'Escritório / Advocacia',
    hint: 'Orientação jurídica, contabilidade e consultoria.',
    defaultCta: 'Entre em contato pelo link da bio para falar com nossa equipe.',
    hashtags: [
      { group: 'Jurídico', tags: [{ t: '#advocacia', on: true }, { t: '#direito', on: true }, { t: '#consultoria', on: true }, { t: '#orientacaojuridica', on: true }] },
    ],
    dailyStories: [
      { slot: 'Manhã', title: 'Story Manhã — Dúvida Frequente', idea: 'Conhecer seus direitos e revisar contratos evita prejuízos futuros.', frameText: 'Você costuma revisar cláusulas antes de assinar um contrato?' },
      { slot: 'Tarde', title: 'Story Tarde — Bastidores e Análise', idea: 'Atuação técnica e acompanhamento transparente em cada etapa do caso.', frameText: 'Segurança jurídica e clareza em cada orientação.' },
      { slot: 'Noite', title: 'Story Noite — Canal de Atendimento', idea: 'Precisa de orientação especializada? Fale com nosso escritório pelo WhatsApp.', frameText: 'Dúvidas? Nossa equipe atende com agilidade pelo link da bio.' },
    ],
    dailyFeed: {
      title: '3 cuidados essenciais antes de fechar qualquer contrato',
      idea: 'A prevenção jurídica protege seu patrimônio e evita desgastes desnecessários. Conte com suporte especializado para tomar decisões seguras.',
    },
  },
  {
    value: 'comercio',
    label: 'Loja / Comércio',
    hint: 'Produtos, novidades na vitrine, ofertas e atendimento.',
    defaultCta: 'Chame no WhatsApp da bio para reservar o seu ou pedir entrega!',
    hashtags: [
      { group: 'Comércio', tags: [{ t: '#novidades', on: true }, { t: '#ofertas', on: true }, { t: '#lojalocal', on: true }, { t: '#qualidade', on: true }] },
    ],
    dailyStories: [
      { slot: 'Manhã', title: 'Story Manhã — Vitrine do Dia', idea: 'Novidades recém-chegadas na loja esperando por você.', frameText: 'Olha o que acabou de chegar na nossa loja hoje!' },
      { slot: 'Tarde', title: 'Story Tarde — Detalhes do Produto', idea: 'Qualidade testada e pronta entrega para você não esperar.', frameText: 'Pronta entrega e atendimento rápido pelo WhatsApp.' },
      { slot: 'Noite', title: 'Story Noite — Reserve pelo WhatsApp', idea: 'Gostou de algum item? Mande mensagem que separamos para você.', frameText: 'Quer garantir o seu? Chama no WhatsApp que separamos!' },
    ],
    dailyFeed: {
      title: 'Destaques da semana com pronta entrega para você',
      idea: 'Selecionamos os itens mais pedidos pelos nossos clientes com condições especiais. Chame nossa equipe no WhatsApp e receba atendimento na hora.',
    },
  },
  {
    value: 'agencia',
    label: 'Agência / Tecnologia',
    hint: 'Sites rápidos, CRM, automação com IA e tráfego.',
    defaultCta: 'Chama no direct e pede seu diagnóstico grátis.',
    hashtags: [
      { group: 'Digital', tags: [{ t: '#marketingdigital', on: true }, { t: '#automacao', on: true }, { t: '#crm', on: true }, { t: '#ia', on: true }] },
    ],
    dailyStories: [
      { slot: 'Manhã', title: 'Story Manhã — O Problema Oculto', idea: 'Demorar mais de 5 minutos para responder um lead no WhatsApp derruba sua conversão.', frameText: 'Quantos clientes mandaram mensagem ontem à noite e ficaram esperando?' },
      { slot: 'Tarde', title: 'Story Tarde — Engenharia em Ação', idea: 'Recepcionista de IA e CRM organizando cada cliente em segundos.', frameText: 'Atendimento em 4 segundos + agendamento automático no CRM.' },
      { slot: 'Noite', title: 'Story Noite — Diagnóstico Comercial', idea: 'Quer colocar sua operação para rodar no piloto automático?', frameText: 'Quer automatizar seu atendimento? Toque no link da bio.' },
    ],
    dailyFeed: {
      title: 'Como parar de perder vendas fora do horário comercial',
      idea: 'Empresas que unem site rápido, recepcionista de IA no WhatsApp e CRM convertem clientes 24 horas por dia sem sobrecarregar a equipe.',
    },
  },
  {
    value: 'geral',
    label: 'Outro Negócio',
    hint: 'Serviços gerais, profissionais liberais e empresas locais.',
    defaultCta: 'Fale com a gente pelo link da bio no WhatsApp!',
    hashtags: [
      { group: 'Negócio', tags: [{ t: '#atendimento', on: true }, { t: '#qualidade', on: true }, { t: '#servicos', on: true }] },
    ],
    dailyStories: [
      { slot: 'Manhã', title: 'Story Manhã — Começando o Dia', idea: 'Estamos prontos para atender você com qualidade e rapidez hoje.', frameText: 'Bom dia! Atendimento a todo vapor por aqui.' },
      { slot: 'Tarde', title: 'Story Tarde — Nosso Trabalho', idea: 'Dedicação em cada detalhe para entregar o melhor resultado aos nossos clientes.', frameText: 'Compromisso e qualidade em cada atendimento.' },
      { slot: 'Noite', title: 'Story Noite — Fale Conosco', idea: 'Ficou com alguma dúvida ou quer fazer um orçamento? Chame no WhatsApp.', frameText: 'Precisa de orçamento ou horário? Chama no link da bio!' },
    ],
    dailyFeed: {
      title: 'Por que nossos clientes confiam no nosso atendimento',
      idea: 'Unimos agilidade, atenção aos detalhes e facilidade de contato pelo WhatsApp para resolver o que você precisa sem burocracia.',
    },
  },
];

export function getNichePreset(niche?: BusinessNiche): NichePreset {
  return BUSINESS_NICHES.find((n) => n.value === niche) ?? BUSINESS_NICHES[BUSINESS_NICHES.length - 1];
}

export interface GeneratedDraftInput {
  kind: 'feed' | 'story';
  media_type: 'foto' | 'carrossel' | 'video';
  title: string;
  idea: string;
  caption: string;
  media_urls: string[];
  frames: { text: string; note?: string }[];
  status: PostStatus;
  scheduled_at: string | null;
}

export function generateDailyAutopilotDrafts(settings: MarketingSettings): GeneratedDraftInput[] {
  const preset = getNichePreset(settings.business_niche);
  const businessPrefix = settings.business_name?.trim() ? `[${settings.business_name.trim()}] ` : '';
  const status: PostStatus = settings.require_approval ? 'pending_approval' : 'scheduled';
  const now = new Date();
  const scheduledAt = settings.require_approval ? null : new Date(now.getTime() + 60 * 60 * 1000).toISOString();

  const stories: GeneratedDraftInput[] = preset.dailyStories.map((st) => {
    const idea = `${businessPrefix}${st.idea}`;
    return {
      kind: 'story',
      media_type: 'foto',
      title: st.title,
      idea,
      caption: buildCaption(settings, idea, 'curta'),
      media_urls: [],
      frames: [{ text: st.frameText, note: `Bloco ${st.slot}` }],
      status,
      scheduled_at: scheduledAt,
    };
  });

  const feedIdea = `${businessPrefix}${preset.dailyFeed.idea}`;
  const feedPost: GeneratedDraftInput = {
    kind: 'feed',
    media_type: 'foto',
    title: preset.dailyFeed.title,
    idea: feedIdea,
    caption: buildCaption(settings, feedIdea, settings.caption_size),
    media_urls: [],
    frames: [{ text: preset.dailyFeed.title, note: 'Capa Principal' }],
    status,
    scheduled_at: scheduledAt,
  };

  return [...stories, feedPost];
}

export function buildQuickInputDraft(
  input: { text: string; kind: 'feed' | 'story'; mediaUrl?: string },
  settings: MarketingSettings,
): GeneratedDraftInput {
  const cleanText = input.text.trim();
  const firstLine = cleanText.split(/[.!?\n]/)[0]?.trim() || 'Novidade do Dia';
  const title = firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
  const status: PostStatus = settings.require_approval ? 'pending_approval' : 'scheduled';
  const mediaUrls = input.mediaUrl?.trim() ? [input.mediaUrl.trim()] : [];

  return {
    kind: input.kind,
    media_type: 'foto',
    title,
    idea: cleanText,
    caption: buildCaption(settings, cleanText, input.kind === 'story' ? 'curta' : settings.caption_size),
    media_urls: mediaUrls,
    frames: [{ text: title, note: input.kind === 'story' ? 'Story Rápido' : 'Post Rápido' }],
    status,
    scheduled_at: settings.require_approval ? null : new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  };
}

export function buildWhatsAppApprovalMessage(
  posts: { kind: string; title: string; status: string }[],
  settings: MarketingSettings,
  panelUrl = 'https://crm.conceptdigital.com.br/marketing',
): string {
  const nome = settings.business_name?.trim() || 'seu negócio';
  const storiesCount = posts.filter((p) => p.kind === 'story').length;
  const feedCount = posts.filter((p) => p.kind === 'feed').length;
  const modo = settings.require_approval
    ? '🛡️ *Modo Aprovação:* Nada vai ao ar sem o seu OK.'
    : '🚀 *Piloto Automático Ativo:* Publicação agendada automaticamente.';

  const lista = posts.slice(0, 5).map((p, idx) => `${idx + 1}. [${p.kind === 'story' ? 'Story' : 'Feed'}] ${p.title}`).join('\n');

  return [
    `Olá! A IA preparou as postagens de hoje para *${nome}*:`,
    `📌 *Resumo:* ${storiesCount} Stories e ${feedCount} Post(s) de Feed`,
    '',
    lista,
    '',
    modo,
    `👉 Veja a prévia e aprove em 1 toque: ${panelUrl}`,
  ].join('\n');
}
