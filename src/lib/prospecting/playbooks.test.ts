import { describe, it, expect } from 'vitest';
import {
  getPlaybooksByNiche,
  getPlaybookById,
  generatePlaybookCopy,
  generateWhatsAppLink,
  ALL_PLAYBOOKS,
} from './playbooks';
import { NicheKey } from '../../config/niches';

describe('playbooks module', () => {
  it('exports ALL_PLAYBOOKS correctly', () => {
    expect(ALL_PLAYBOOKS.length).toBeGreaterThanOrEqual(21);
  });

  const niches: NicheKey[] = [
    'concept',
    'advogado',
    'clinica',
    'fotografo',
    'barbeiro',
    'ecommerce',
    'imobiliaria',
  ];

  it('provides at least 3 templates for each supported niche', () => {
    for (const niche of niches) {
      const templates = getPlaybooksByNiche(niche);
      expect(templates.length).toBeGreaterThanOrEqual(3);
      for (const t of templates) {
        expect(t.id).toBeTruthy();
        expect(t.title).toBeTruthy();
        expect(t.template).toContain('[Nome]');
        expect(t.fields.length).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('finds playbook by id accurately', () => {
    const barberPlaybooks = getPlaybooksByNiche('barbeiro');
    const firstId = barberPlaybooks[0].id;
    const found = getPlaybookById(firstId, 'barbeiro');
    expect(found).toBeDefined();
    expect(found?.id).toBe(firstId);
  });

  it('replaces variables deterministically without ghost placeholders', () => {
    const copy = generatePlaybookCopy(
      'barbeiro-regua-fds',
      {
        Nome: 'Carlos',
        Servico: 'Corte e Barba',
        Condicao: 'Sexta às 18h',
        Empresa: 'Barbearia do Alemão',
      },
      'barbeiro'
    );

    expect(copy).toContain('Carlos');
    expect(copy).toContain('Corte e Barba');
    expect(copy).toContain('Sexta às 18h');
    expect(copy).toContain('Barbearia do Alemão');
    expect(copy).not.toContain('[Nome]');
    expect(copy).not.toContain('[Servico]');
    expect(copy).not.toContain('[Condicao]');
  });

  it('handles missing variables with graceful fallbacks', () => {
    const copy = generatePlaybookCopy(
      'barbeiro-regua-fds',
      {
        Nome: 'João',
      },
      'barbeiro'
    );

    expect(copy).toContain('João');
    expect(copy).not.toContain('[Nome]');
    // Should not leave raw brackets for unsupplied variables
    expect(copy).not.toMatch(/\[[A-Za-z]+\]/);
  });

  it('generates universal wa.me link with encoded text and clean phone', () => {
    const rawPhone = '+55 (13) 98888-7777';
    const text = 'Olá Carlos, tudo bem?';
    const link = generateWhatsAppLink(rawPhone, text);

    expect(link).toBe('https://wa.me/5513988887777?text=Ol%C3%A1%20Carlos%2C%20tudo%20bem%3F');
  });

  it('advogado templates respect OAB formal and ethical tone', () => {
    const lawTemplates = getPlaybooksByNiche('advogado');
    for (const t of lawTemplates) {
      expect(t.template.toLowerCase()).not.toContain('desconto');
      expect(t.template.toLowerCase()).not.toContain('promoção');
    }
  });
});
