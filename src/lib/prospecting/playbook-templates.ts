import { NicheKey } from '../../config/niches';

export interface PlaybookField {
  key: string;
  label: string;
  placeholder: string;
  defaultValue?: string;
  required?: boolean;
}

export interface PlaybookTemplate {
  id: string;
  niche: NicheKey;
  title: string;
  description: string;
  category: string;
  template: string;
  fields: PlaybookField[];
}

export const PLAYBOOK_TEMPLATES: PlaybookTemplate[] = [
  // CONCEPT DIGITAL (AGÊNCIA)
  {
    id: 'concept-diagnostico',
    niche: 'concept',
    title: 'Diagnóstico Digital & IA',
    description: 'Abordagem consultiva para analisar processos e canais digitais da empresa.',
    category: 'Diagnóstico',
    template: 'Olá [Nome], tudo bem? Aqui é o [Remetente] da [Empresa]. Estive analisando o posicionamento digital da sua operação e identifiquei oportunidades para acelerar seu atendimento e captação de clientes com IA. Conseguimos conversar 15 minutos nesta [Condicao]?',
    fields: [
      { key: 'Nome', label: 'Nome do Contato', placeholder: 'Ex: Dr. Roberto', required: true },
      { key: 'Remetente', label: 'Seu Nome', placeholder: 'Ex: João', defaultValue: 'João' },
      { key: 'Empresa', label: 'Sua Empresa', placeholder: 'Ex: Concept Digital', defaultValue: 'Concept Digital' },
      { key: 'Condicao', label: 'Horário / Dia sugerido', placeholder: 'Ex: quinta-feira às 15h', defaultValue: 'quinta-feira às 15h' },
    ],
  },
  {
    id: 'concept-apresentacao',
    niche: 'concept',
    title: 'Apresentação de Solução',
    description: 'Demonstração de produto customizado (CRM, Agente IA ou LP de conversão).',
    category: 'Apresentação',
    template: 'Olá [Nome], preparei uma demonstração personalizada de [Servico] pensada especificamente para o fluxo de atendimento da [Empresa]. Gostaria de te mostrar os bastidores sem compromisso. Podemos agendar para [Condicao]?',
    fields: [
      { key: 'Nome', label: 'Nome do Lead', placeholder: 'Ex: Mariana', required: true },
      { key: 'Servico', label: 'Solução', placeholder: 'Ex: Recepcionista de IA no WhatsApp', defaultValue: 'Recepcionista de IA no WhatsApp' },
      { key: 'Empresa', label: 'Empresa do Lead', placeholder: 'Ex: Clínica Sorrir', defaultValue: 'sua equipe' },
      { key: 'Condicao', label: 'Horário Sugerido', placeholder: 'Ex: amanhã às 11h', defaultValue: 'amanhã às 11h' },
    ],
  },
  {
    id: 'concept-followup',
    niche: 'concept',
    title: 'Follow-up de Proposta',
    description: 'Retomada elegante de proposta comercial enviada.',
    category: 'Follow-up',
    template: 'Olá [Nome], tudo bem? Passando para saber se você conseguiu avaliar a proposta de [Servico] que enviamos. Surgiu alguma dúvida sobre os prazos ou escopo? Fico à disposição para alinharmos.',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Carlos', required: true },
      { key: 'Servico', label: 'Projeto / Proposta', placeholder: 'Ex: modernização do CRM e automações', defaultValue: 'implantação do sistema' },
    ],
  },

  // ADVOGADOS
  {
    id: 'advogado-consulta-preventiva',
    niche: 'advogado',
    title: 'Consulta Jurídica Preventiva',
    description: 'Comunicação informativa para atualização de contratos ou procedimentos legais.',
    category: 'Preventivo',
    template: 'Prezado(a) [Nome], como vai? Notamos que já se passaram alguns meses desde a nossa última consultoria sobre [Servico]. Com recentes atualizações em nossa área, recomendamos uma revisão preventiva. Teríamos disponibilidade para alinhamento em [Condicao]. Um abraço, [Remetente].',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Dr. Marcelo', required: true },
      { key: 'Servico', label: 'Área / Assunto', placeholder: 'Ex: contratos comerciais', defaultValue: 'seus contratos e conformidade' },
      { key: 'Condicao', label: 'Período Disponível', placeholder: 'Ex: meados da próxima semana', defaultValue: 'nesta semana' },
      { key: 'Remetente', label: 'Advogado(a) / Escritório', placeholder: 'Ex: Dr. Roberto', defaultValue: 'Equipe Jurídica' },
    ],
  },
  {
    id: 'advogado-informativo-juris',
    niche: 'advogado',
    title: 'Informativo Jurídico',
    description: 'Envio de atualização de relevância jurídica direta ao cliente.',
    category: 'Informativo',
    template: 'Prezado(a) [Nome], esperamos que esteja bem. Tendo em vista novas diretrizes aplicáveis ao tema de [Servico], preparamos um resumo informativo que pode impactar seus interesses. Estamos à disposição caso deseje esclarecimentos complementares em [Condicao]. Cordialmente, [Remetente].',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Sra. Camila', required: true },
      { key: 'Servico', label: 'Matéria / Tópico', placeholder: 'Ex: planejamento patrimonial', defaultValue: 'planejamento patrimonial' },
      { key: 'Condicao', label: 'Disponibilidade', placeholder: 'Ex: horário comercial', defaultValue: 'nosso horário de atendimento' },
      { key: 'Remetente', label: 'Escritório', placeholder: 'Ex: Advocacia Silva', defaultValue: 'nosso escritório' },
    ],
  },
  {
    id: 'advogado-triagem',
    niche: 'advogado',
    title: 'Triagem de Demanda Contratual',
    description: 'Acompanhamento periódico de demandas em andamento ou novas frentes.',
    category: 'Acompanhamento',
    template: 'Olá [Nome], tudo bem? Estamos realizando um alinhamento trimestral dos clientes atendidos em [Servico]. Caso tenha surgido alguma nova demanda ou dúvida contratual, podemos agendar uma reunião em [Condicao]. Atenciosamente, [Remetente].',
    fields: [
      { key: 'Nome', label: 'Nome do Contato', placeholder: 'Ex: Sr. Eduardo', required: true },
      { key: 'Servico', label: 'Área Atendida', placeholder: 'Ex: direito societário', defaultValue: 'suas demandas' },
      { key: 'Condicao', label: 'Data / Horário', placeholder: 'Ex: terça-feira às 14h', defaultValue: 'nesta semana' },
      { key: 'Remetente', label: 'Advogado Responsável', placeholder: 'Ex: Dr. Vinicius', defaultValue: 'nossa equipe' },
    ],
  },

  // CLÍNICAS & CONSULTÓRIOS
  {
    id: 'clinica-checkup',
    niche: 'clinica',
    title: 'Check-up e Retorno Preventivo',
    description: 'Lembrete humanizado de retorno semestral ou anual para manutenção da saúde.',
    category: 'Recall Preventivo',
    template: 'Olá [Nome], tudo bem com você? Aqui é da [Empresa]. Verificamos que já faz cerca de [Tempo] desde o seu último [Servico]. Para mantermos seus cuidados sempre em dia, temos alguns horários para [Condicao]. Gostaria de reservar para você?',
    fields: [
      { key: 'Nome', label: 'Nome do Paciente', placeholder: 'Ex: Juliana', required: true },
      { key: 'Empresa', label: 'Nome da Clínica', placeholder: 'Ex: Clínica Vitae', defaultValue: 'nossa clínica' },
      { key: 'Tempo', label: 'Tempo Decorrido', placeholder: 'Ex: 6 meses', defaultValue: 'alguns meses' },
      { key: 'Servico', label: 'Procedimento / Avaliação', placeholder: 'Ex: check-up dental', defaultValue: 'atendimento' },
      { key: 'Condicao', label: 'Dias / Período', placeholder: 'Ex: esta semana ou na próxima', defaultValue: 'esta semana' },
    ],
  },
  {
    id: 'clinica-orcamento',
    niche: 'clinica',
    title: 'Resgate de Orçamento',
    description: 'Retomada de plano de tratamento ou orçamento apresentado no passado.',
    category: 'Resgate',
    template: 'Olá [Nome]! Passando para saber como você está e se conseguiu pensar sobre o planejamento de [Servico] que conversamos. Conseguimos condições especiais para início em [Condicao]. Vamos dar sequência ao seu tratamento?',
    fields: [
      { key: 'Nome', label: 'Nome do Paciente', placeholder: 'Ex: Rodrigo', required: true },
      { key: 'Servico', label: 'Tratamento / Procedimento', placeholder: 'Ex: alinhadores invisíveis', defaultValue: 'seu tratamento' },
      { key: 'Condicao', label: 'Período / Condição', placeholder: 'Ex: início deste mês', defaultValue: 'este mês' },
    ],
  },
  {
    id: 'clinica-pos-procedimento',
    niche: 'clinica',
    title: 'Acompanhamento Pós-Procedimento',
    description: 'Cuidado atencioso para verificar recuperação e agendar avaliação de evolução.',
    category: 'Pós-Atendimento',
    template: 'Olá [Nome], tudo bem? Aqui é a equipe da [Empresa]. Gostaríamos de saber como você está se sentindo após o [Servico]. Já estamos com a agenda aberta para sua consulta de revisão em [Condicao]. Como está sua disponibilidade?',
    fields: [
      { key: 'Nome', label: 'Nome do Paciente', placeholder: 'Ex: Beatriz', required: true },
      { key: 'Empresa', label: 'Nome da Clínica', placeholder: 'Ex: Clínica Sorrir', defaultValue: 'clínica' },
      { key: 'Servico', label: 'Procedimento Realizado', placeholder: 'Ex: procedimento estético', defaultValue: 'seu procedimento' },
      { key: 'Condicao', label: 'Data Sugerida', placeholder: 'Ex: sexta-feira à tarde', defaultValue: 'esta semana' },
    ],
  },

  // FOTÓGRAFOS
  {
    id: 'fotografo-ensaio-anual',
    niche: 'fotografo',
    title: 'Sessão Anual / Família',
    description: 'Convite afetivo para registrar nova fase ou aniversário em família.',
    category: 'Afetivo',
    template: 'Olá [Nome], tudo bem? Estava revendo as fotos lindas do seu [Servico] e me lembrei de você! O tempo voa, e já faz um tempo que não nos encontramos. Estamos reservando datas para ensaios em [Condicao]. Bora criar novas memórias lindas juntos?',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Fernanda', required: true },
      { key: 'Servico', label: 'Ensaio Passado', placeholder: 'Ex: ensaio de família', defaultValue: 'ensaio' },
      { key: 'Condicao', label: 'Mês / Período', placeholder: 'Ex: outubro com a luz de fim de tarde', defaultValue: 'este mês' },
    ],
  },
  {
    id: 'fotografo-sazonal',
    niche: 'fotografo',
    title: 'Mini-Sessão Sazonal Especial',
    description: 'Campanha temática (Dia das Mães, Natal, Primavera ou Estúdio).',
    category: 'Sazonal',
    template: 'Oi [Nome]! Abrimos oficialmente as vagas limitadas para a nossa temporada de [Servico] em [Condicao]. Como você já fotografou com a gente, estou te mandando antes para garantir seu horário preferido. Quer que eu te envie os detalhes?',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Luiza', required: true },
      { key: 'Servico', label: 'Tema da Mini-Sessão', placeholder: 'Ex: Mini-Sessão de Natal', defaultValue: 'mini-sessão especial' },
      { key: 'Condicao', label: 'Datas', placeholder: 'Ex: início de novembro', defaultValue: 'as próximas semanas' },
    ],
  },
  {
    id: 'fotografo-evento-familia',
    niche: 'fotografo',
    title: 'Registro de Datas Marcadas',
    description: 'Acompanhamento de aniversários de filhos, bodas ou marcos especiais.',
    category: 'Datas Especiais',
    template: 'Olá [Nome], tudo bem? Sei que em breve vocês têm comemoração especial! Caso estejam planejando registrar [Servico], já estou com a agenda de [Condicao] aberta para fechamento prévio. Me avise para segurarmos o dia!',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Patricia', required: true },
      { key: 'Servico', label: 'Ocasião Especial', placeholder: 'Ex: o aniversário do Pedro', defaultValue: 'a data especial' },
      { key: 'Condicao', label: 'Mês do Evento', placeholder: 'Ex: novembro', defaultValue: 'os próximos meses' },
    ],
  },

  // BARBEIROS
  {
    id: 'barbeiro-regua-fds',
    niche: 'barbeiro',
    title: 'Régua do Fim de Semana',
    description: 'Mensagem descontraída para garantir cadeira antes de esgotar os horários de sexta/sábado.',
    category: 'Fim de Semana',
    template: 'Fala [Nome], beleza? O fim de semana tá chegando e os horários aqui na [Empresa] para [Servico] costumam esgotar rápido. Separei uma vaga em [Condicao]. Quer que eu reserve para você chegar alinhado?',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Matheus', required: true },
      { key: 'Empresa', label: 'Nome da Barbearia', placeholder: 'Ex: Barbearia do Alemão', defaultValue: 'barbearia' },
      { key: 'Servico', label: 'Corte / Barba', placeholder: 'Ex: aquele talento no corte e barba', defaultValue: 'dar aquele talento no visual' },
      { key: 'Condicao', label: 'Dia e Horário', placeholder: 'Ex: sexta às 18h', defaultValue: 'sexta ou sábado' },
    ],
  },
  {
    id: 'barbeiro-resgate',
    niche: 'barbeiro',
    title: 'Resgate de Sumido',
    description: 'Abordagem bem-humorada para clientes que não aparecem há mais de 25 dias.',
    category: 'Resgate',
    template: 'E aí [Nome], sumiu! Já faz um tempinho desde a última vez na cadeira da [Empresa]. A régua já deve estar pedindo socorro! Tenho horário para [Servico] em [Condicao]. Bora renovar?',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Lucas', required: true },
      { key: 'Empresa', label: 'Nome da Barbearia', placeholder: 'Ex: Alemão Barbearia', defaultValue: 'barbearia' },
      { key: 'Servico', label: 'Serviço Sugerido', placeholder: 'Ex: corte e barba', defaultValue: 'alinhar o visual' },
      { key: 'Condicao', label: 'Dia Sugerido', placeholder: 'Ex: hoje às 17h ou amanhã', defaultValue: 'hoje ou amanhã' },
    ],
  },
  {
    id: 'barbeiro-combo',
    niche: 'barbeiro',
    title: 'Combo Especial Corte + Barba',
    description: 'Incentivo para elevar o ticket médio e fechar horários mais tranquilos.',
    category: 'Ticket Médio',
    template: 'Fala [Nome]! Nesta semana estamos com uma condição especial no combo de [Servico] aqui na [Empresa] para atendimentos em [Condicao]. Topa aproveitar e sair 100% alinhado? Só me dar o ok que já travo sua vaga!',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Gabriel', required: true },
      { key: 'Servico', label: 'Combo Promocional', placeholder: 'Ex: Corte + Barboterapia', defaultValue: 'Corte + Barba' },
      { key: 'Empresa', label: 'Nome da Barbearia', placeholder: 'Ex: Barbearia do Alemão', defaultValue: 'barbearia' },
      { key: 'Condicao', label: 'Período', placeholder: 'Ex: terça a quinta', defaultValue: 'meio de semana' },
    ],
  },

  // E-COMMERCE
  {
    id: 'ecommerce-reposicao',
    niche: 'ecommerce',
    title: 'Recompra e Reposição',
    description: 'Lembrete oportuno no momento provável em que o produto anterior está acabando.',
    category: 'Recompra',
    template: 'Olá [Nome], tudo bem? Percebemos que já faz um tempinho desde o seu pedido de [Servico]. Seu estoque pessoal já deve estar no finalzinho! Liberamos frete facilitado para você repor em [Condicao]. Quer garantir o seu?',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Amanda', required: true },
      { key: 'Servico', label: 'Produto Adquirido', placeholder: 'Ex: Kit de Produtos Limpeza', defaultValue: 'seu produto favorito' },
      { key: 'Condicao', label: 'Benefício / Prazo', placeholder: 'Ex: compras até amanhã', defaultValue: 'esta semana' },
    ],
  },
  {
    id: 'ecommerce-vip',
    niche: 'ecommerce',
    title: 'Cupom Exclusivo VIP',
    description: 'Reconhecimento para clientes leais com cupom e validade definida.',
    category: 'Fidelidade',
    template: 'Oi [Nome]! Você é um cliente especial para a [Empresa]. Separamos um benefício exclusivo de [Condicao] para você aproveitar em toda a linha de [Servico]. É só me avisar aqui que já te envio o link direto!',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Paula', required: true },
      { key: 'Empresa', label: 'Nome da Loja', placeholder: 'Ex: Ampère Eletrônicos', defaultValue: 'nossa loja' },
      { key: 'Condicao', label: 'Cupom / Desconto', placeholder: 'Ex: 15% OFF com o cupom VIP15', defaultValue: 'condição exclusiva' },
      { key: 'Servico', label: 'Categoria / Produtos', placeholder: 'Ex: acessórios e utilidades', defaultValue: 'lançamentos' },
    ],
  },
  {
    id: 'ecommerce-carrinho',
    niche: 'ecommerce',
    title: 'Recuperação de Interesse',
    description: 'Retomada para cliente que pesquisou produtos ou demonstrou interesse recente.',
    category: 'Recuperação',
    template: 'Olá [Nome]! Vi que você estava de olho em [Servico] na [Empresa]. Ficou alguma dúvida sobre o produto ou prazo de entrega? Tenho uma unidade separada aqui caso queira fechar em [Condicao]. Posso te ajudar?',
    fields: [
      { key: 'Nome', label: 'Nome do Cliente', placeholder: 'Ex: Felipe', required: true },
      { key: 'Servico', label: 'Produto de Interesse', placeholder: 'Ex: Fone Bluetooth Pro', defaultValue: 'nossos produtos' },
      { key: 'Empresa', label: 'Nome da Loja', placeholder: 'Ex: Koisa Nossa', defaultValue: 'nossa loja' },
      { key: 'Condicao', label: 'Condição Especial', placeholder: 'Ex: 12x sem juros hoje', defaultValue: 'hoje mesmo' },
    ],
  },

  // IMOBILIÁRIAS
  {
    id: 'imobiliaria-perfil',
    niche: 'imobiliaria',
    title: 'Imóvel Compatível com Perfil',
    description: 'Apresentação personalizada de opção que acabou de entrar na carteira.',
    category: 'Oportunidade',
    template: 'Olá [Nome], tudo bem? Acabou de entrar na nossa carteira uma opção de [Servico] exatamente com as características que você buscava em [Condicao]. Pelos detalhes, tenho certeza de que vai gostar. Posso te enviar as fotos e a ficha técnica?',
    fields: [
      { key: 'Nome', label: 'Nome do Interessado', placeholder: 'Ex: Dr. Fernando', required: true },
      { key: 'Servico', label: 'Tipo de Imóvel', placeholder: 'Ex: Apartamento 3 suítes no Gonzaga', defaultValue: 'um imóvel exclusivo' },
      { key: 'Condicao', label: 'Localização / Perfil', placeholder: 'Ex: com varanda gourmet e 2 vagas', defaultValue: 'sua região de preferência' },
    ],
  },
  {
    id: 'imobiliaria-avaliacao',
    niche: 'imobiliaria',
    title: 'Avaliação de Mercado e Retorno',
    description: 'Contato com proprietário para revisão de valor ou posicionamento do anúncio.',
    category: 'Proprietário',
    template: 'Olá [Nome], tudo bem? Estamos com demanda aquecida para [Servico] na sua região. Gostaríamos de atualizar a avaliação de mercado do seu imóvel para acelerar negociações em [Condicao]. Quando podemos conversar rapidamente?',
    fields: [
      { key: 'Nome', label: 'Nome do Proprietário', placeholder: 'Ex: Sr. Antonio', required: true },
      { key: 'Servico', label: 'Perfil do Imóvel', placeholder: 'Ex: imóveis residenciais', defaultValue: 'seu imóvel' },
      { key: 'Condicao', label: 'Período', placeholder: 'Ex: este mês', defaultValue: 'nesta semana' },
    ],
  },
  {
    id: 'imobiliaria-lancamento',
    niche: 'imobiliaria',
    title: 'Lançamento Exclusivo para Investidor',
    description: 'Apresentação prévia de empreendimento com potencial de valorização.',
    category: 'Lançamento',
    template: 'Olá [Nome]! Sei do seu interesse em oportunidades sólidas de investimento. Teremos a abertura de vendas de [Servico] em [Condicao] com tabela especial de primeira fase. Gostaria de receber o material em primeira mão?',
    fields: [
      { key: 'Nome', label: 'Nome do Investidor', placeholder: 'Ex: Roberto', required: true },
      { key: 'Servico', label: 'Nome / Tipo de Empreendimento', placeholder: 'Ex: Studios Alto Padrão no Centro', defaultValue: 'um novo empreendimento' },
      { key: 'Condicao', label: 'Data / Condição', placeholder: 'Ex: condições de pré-lançamento', defaultValue: 'pré-lançamento' },
    ],
  },
];
