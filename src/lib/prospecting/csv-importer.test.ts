import { describe, it, expect } from 'vitest';
import {
  parseAndSanitizeCsv,
  sanitizeBrazilianPhone,
  detectCsvDelimiter,
} from './csv-importer';

describe('csv importer and phone sanitizer', () => {
  describe('detectCsvDelimiter', () => {
    it('detects comma delimiter', () => {
      expect(detectCsvDelimiter('nome,telefone,email\nAna,13999991111,ana@test.com')).toBe(',');
    });

    it('detects semicolon delimiter', () => {
      expect(detectCsvDelimiter('nome;telefone;cidade\nBruno;13999992222;Santos')).toBe(';');
    });

    it('detects tab delimiter', () => {
      expect(detectCsvDelimiter('nome\ttelefone\nCarla\t13999993333')).toBe('\t');
    });
  });

  describe('sanitizeBrazilianPhone (Socratic Gate A1)', () => {
    it('normalizes clean 11-digit mobile phone to E.164 with +55', () => {
      const res = sanitizeBrazilianPhone('13988887777');
      expect(res.valid).toBe(true);
      expect(res.hasWhatsApp).toBe(true);
      expect(res.formatted).toBe('5513988887777');
    });

    it('auto-inserts 9th digit for legacy 8-digit mobile numbers with valid DDD', () => {
      // DDD 13, starts with 8 or 9 -> mobile number missing the 9th digit
      const res = sanitizeBrazilianPhone('(13) 8888-7777');
      expect(res.valid).toBe(true);
      expect(res.hasWhatsApp).toBe(true);
      expect(res.formatted).toBe('5513988887777');
    });

    it('identifies landline / fixed numbers and marks hasWhatsApp as false', () => {
      // Starts with 3 (fixed line)
      const res = sanitizeBrazilianPhone('(13) 3232-1111');
      expect(res.valid).toBe(true);
      expect(res.hasWhatsApp).toBe(false);
      expect(res.reason).toContain('fixo');
    });

    it('rejects numbers with invalid lengths or invalid DDD', () => {
      const invalidDdd = sanitizeBrazilianPhone('(00) 99999-9999');
      expect(invalidDdd.valid).toBe(false);

      const tooShort = sanitizeBrazilianPhone('12345');
      expect(tooShort.valid).toBe(false);
    });

    it('handles phones that already have country code 55', () => {
      const res = sanitizeBrazilianPhone('+55 (13) 98888-7777');
      expect(res.valid).toBe(true);
      expect(res.hasWhatsApp).toBe(true);
      expect(res.formatted).toBe('5513988887777');
    });
  });

  describe('parseAndSanitizeCsv', () => {
    it('parses comma-separated CSV with auto-header mapping', () => {
      const csv = `Nome,WhatsApp,Serviço,Data
Lucas Silva,13 98888-1111,Corte e Barba,2026-08-10
Mariana Costa,(13) 97777-2222,Coloração,2026-09-01`;

      const summary = parseAndSanitizeCsv(csv);

      expect(summary.totalRows).toBe(2);
      expect(summary.validContacts).toHaveLength(2);
      expect(summary.validContacts[0].name).toBe('Lucas Silva');
      expect(summary.validContacts[0].phone).toBe('5513988881111');
      expect(summary.validContacts[0].service).toBe('Corte e Barba');
      expect(summary.validContacts[0].lastDate).toBe('2026-08-10');
    });

    it('parses semicolon-separated CSV used commonly by Brazilian Excel', () => {
      const csv = `Cliente;Telefone;Observacao
Carlos Santos;13988883333;Cliente VIP
Fernanda Lima;13988884444;Gosta de agendar aos sábados`;

      const summary = parseAndSanitizeCsv(csv);

      expect(summary.totalRows).toBe(2);
      expect(summary.validContacts).toHaveLength(2);
      expect(summary.validContacts[0].name).toBe('Carlos Santos');
      expect(summary.validContacts[1].name).toBe('Fernanda Lima');
    });

    it('deduplicates against existing phone numbers', () => {
      const csv = `Nome,Telefone
Ana Souza,13988881111
Beatriz Lima,13988882222
Claudio Rocha,13988883333`;

      const existing = ['5513988881111', '+55 (13) 98888-3333'];
      const summary = parseAndSanitizeCsv(csv, { existingPhones: existing });

      expect(summary.validContacts).toHaveLength(1);
      expect(summary.validContacts[0].name).toBe('Beatriz Lima');
      expect(summary.duplicateCount).toBe(2);
    });

    it('reports fixed lines and invalid lines in the summary', () => {
      const csv = `Nome,Telefone
Barbearia Escritório,1332321111
Contato Quebrado,999`;

      const summary = parseAndSanitizeCsv(csv);

      expect(summary.validContacts).toHaveLength(0);
      expect(summary.fixedLineCount).toBe(1);
      expect(summary.invalidRows).toHaveLength(2);
    });
  });
});
