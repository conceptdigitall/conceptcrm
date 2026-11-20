import { describe, it, expect } from 'vitest';
import { generateContractDraft, formatBRL } from './minuta-generator';

describe('minuta-generator', () => {
  it('formats currency correctly in BRL', () => {
    expect(formatBRL(1500)).toContain('1.500');
    expect(formatBRL(0)).toContain('0,00');
  });

  it('generates a closed contract draft without monthly fees', () => {
    const draft = generateContractDraft(
      { name: 'Leonardo', company: 'Essence Wear', phone: '+5513999999999' },
      {
        title: 'Loja Streetwear & CRM',
        type: 'avulso',
        status: 'rascunho',
        setup_price: 2000,
        monthly_price: 0,
        notes: 'Implantação completa da loja e CRM dedicado.',
      }
    );

    expect(draft).toContain('Essence Wear');
    expect(draft).toContain('Projeto Fechado (Sem mensalidade recorrente)');
    expect(draft).toContain('2.000,00');
    expect(draft).toContain('Garantia Técnica');
  });

  it('generates a recurrent contract draft with monthly maintenance', () => {
    const draft = generateContractDraft(
      { name: 'Dono Celeiro', company: 'Celeiro Bull Riders', phone: '+5543999999999' },
      {
        title: 'Vitrine Western Heritage',
        type: 'recorrente',
        status: 'enviado',
        setup_price: 1800,
        monthly_price: 197,
        billing_day: 15,
        notes: 'Inclusão de até 8 peças por mês no catálogo.',
      }
    );

    expect(draft).toContain('Celeiro Bull Riders');
    expect(draft).toContain('Plano de Hospedagem & Manutenção Gerenciada');
    expect(draft).toContain('197,00');
    expect(draft).toContain('todo dia 15');
  });
});
