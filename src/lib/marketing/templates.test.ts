import { describe, it, expect } from 'vitest';
import {
  MARKETING_TEMPLATES,
  composeTemplatePrompt,
  type TemplateFieldValues,
} from './templates';

describe('Marketing Templates & Prompt Composer', () => {
  it('exposes the 4 standard marketing templates', () => {
    expect(MARKETING_TEMPLATES.length).toBe(4);
    const ids = MARKETING_TEMPLATES.map((t) => t.id);
    expect(ids).toEqual(['discount', 'highlight', 'institutional', 'testimonial']);
  });

  describe('composeTemplatePrompt', () => {
    it('composes a high-converting prompt for discount template', () => {
      const values: TemplateFieldValues = {
        item: 'Corte de Cabelo + Barba',
        price: 'R$ 59,90',
        deadline: 'somente nesta sexta e sábado',
        cta: 'Agende agora pelo WhatsApp',
      };

      const prompt = composeTemplatePrompt('discount', values);
      expect(prompt).toContain('Corte de Cabelo + Barba');
      expect(prompt).toContain('R$ 59,90');
      expect(prompt).toContain('somente nesta sexta e sábado');
      expect(prompt).toContain('Agende agora pelo WhatsApp');
      expect(prompt).toContain('Oferta imperdível');
    });

    it('composes a polished prompt for product/service highlight template', () => {
      const values: TemplateFieldValues = {
        name: 'Tratamento Capilar Intensivo',
        benefit: 'hidratação profunda e restauração total dos fios',
        target: 'quem quer brilho e força imediata',
        cta: 'Consulte os horários disponíveis no WhatsApp',
      };

      const prompt = composeTemplatePrompt('highlight', values);
      expect(prompt).toContain('Tratamento Capilar Intensivo');
      expect(prompt).toContain('hidratação profunda e restauração total dos fios');
      expect(prompt).toContain('Consulte os horários disponíveis no WhatsApp');
    });

    it('composes an inviting prompt for institutional/space template', () => {
      const values: TemplateFieldValues = {
        businessName: 'Barbearia do Alemão',
        highlights: 'ambiente climatizado, café especial e atendimento de primeira',
        location: 'Rua das Palmeiras, 120 - Gonzaga, Santos',
        cta: 'Venha nos visitar',
      };

      const prompt = composeTemplatePrompt('institutional', values);
      expect(prompt).toContain('Barbearia do Alemão');
      expect(prompt).toContain('ambiente climatizado');
      expect(prompt).toContain('Gonzaga, Santos');
    });

    it('composes a credibility prompt for testimonial/social proof template', () => {
      const values: TemplateFieldValues = {
        feedback: 'Melhor atendimento que já tive, profissionais nota 10!',
        clientName: 'Avaliação 5 estrelas de cliente',
        service: 'Design de Barba',
        cta: 'Agende seu horário também',
      };

      const prompt = composeTemplatePrompt('testimonial', values);
      expect(prompt).toContain('Melhor atendimento que já tive');
      expect(prompt).toContain('Design de Barba');
      expect(prompt).toContain('Avaliação 5 estrelas');
    });

    it('gracefully handles missing optional fields', () => {
      const values: TemplateFieldValues = {
        item: 'Pizza Grande em Dobro',
        price: 'R$ 79,90',
      };

      const prompt = composeTemplatePrompt('discount', values);
      expect(prompt).toContain('Pizza Grande em Dobro');
      expect(prompt).toContain('R$ 79,90');
      // Does not contain undefined or empty bracket
      expect(prompt).not.toContain('undefined');
      expect(prompt).not.toContain('null');
    });

    it('returns empty string if all fields are blank', () => {
      const prompt = composeTemplatePrompt('discount', {});
      expect(prompt).toBe('');
    });
  });
});
