import type { ContractFormData } from '@/types/contracts';

interface ContactInfo {
  name?: string | null;
  company?: string | null;
  phone?: string | null;
  email?: string | null;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value || 0);
}

export function generateContractDraft(
  contact: ContactInfo,
  contract: ContractFormData
): string {
  const clientName = contact.name || 'Cliente';
  const clientCompany = contact.company ? ` (${contact.company})` : '';
  const clientPhone = contact.phone || 'Não informado';
  const clientEmail = contact.email || 'Não informado';
  const isRecurrent = contract.type === 'recorrente';

  const setupFormatted = formatBRL(contract.setup_price);
  const monthlyFormatted = formatBRL(contract.monthly_price);
  const billingDay = contract.billing_day || 10;

  return `# CONTRATO DE PRESTAÇÃO DE SERVIÇOS DIGITAIS E DESENVOLVIMENTO

**CONTRATADA:** Concept Digital
**CONTRATANTE:** ${clientName}${clientCompany}
- Telefone / WhatsApp: ${clientPhone}
- E-mail: ${clientEmail}

---

## 1. OBJETO E ESCOPO
O presente instrumento tem por objeto: **${contract.title}**, com escopo técnico e entregas acordadas entre as partes.
${contract.notes ? `\n**Detalhamento de Escopo:**\n${contract.notes}\n` : ''}

Qualquer funcionalidade ou serviço adicional não descrito neste escopo será considerado fora de escopo e dependerá de novo orçamento.

---

## 2. MODALIDADE FINANCEIRA E PAGAMENTO
- **Taxa de Desenvolvimento / Setup:** ${setupFormatted} (pagamento dividido em 50% de entrada na assinatura e 50% na conclusão/homologação).
${
  isRecurrent
    ? `- **Plano de Hospedagem & Manutenção Gerenciada:** ${monthlyFormatted} / mês (com primeiro vencimento em 30 dias após a entrega e vencimento recorrente todo dia ${billingDay}).
- **Serviços Inclusos na Mensalidade:** Monitoramento de estabilidade, hospedagem gerenciada, certificados de segurança e atualizações simples de conteúdo/catálogo mensal.`
    : `- **Modalidade:** Projeto Fechado (Sem mensalidade recorrente).
- **Garantia Técnica:** 30 (trinta) dias a partir da entrega para correção de bugs ou inconsistências no código entregue.`
}

---

## 3. APROVAÇÃO TÁCITA E PRAZOS
Enviado o link de visualização/homologação pela CONTRATADA, a CONTRATANTE terá até **5 (cinco) dias úteis** para manifestar eventuais ajustes (limitados a até 2 rodadas consolidadas de revisão). Decorrido esse prazo sem manifestação, o projeto é considerado **100% aprovado e aceito**.

---

## 4. PROPRIEDADE INTELECTUAL
A titularidade do código e dos arquivos do projeto é transferida à CONTRATANTE exclusivamente após a quitação integral de todos os valores contratados.

---

Data de emissão: ${new Date().toLocaleDateString('pt-BR')}

_________________________________________
**Concept Digital**

_________________________________________
**${clientName}**
`;
}
