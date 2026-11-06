import { describe, expect, it } from 'vitest';
import {
  REFERENCE_MAX_SECONDS,
  REFERENCE_UPLOAD_MAX_BYTES,
  normalizeReferenceUrl,
  parseReferenceAnalysis,
  referenceAnalysisPrompt,
  validateReferenceInput,
  validateReferenceMeta,
} from './references';

describe('normalizeReferenceUrl', () => {
  it('unifica reels/reel do Instagram', () => {
    const a = normalizeReferenceUrl('https://www.instagram.com/reels/ABC123/?igsh=xyz');
    const b = normalizeReferenceUrl('https://instagram.com/reel/ABC123');
    expect(a?.normalized).toBe('https://www.instagram.com/reel/ABC123');
    expect(b?.normalized).toBe('https://www.instagram.com/reel/ABC123');
    expect(a?.platform).toBe('instagram');
  });
  it('aceita /p/', () => {
    expect(normalizeReferenceUrl('https://instagram.com/p/XYZ/')?.normalized).toBe('https://www.instagram.com/p/XYZ');
  });
  it('rejeita perfil, http e hosts de fora', () => {
    expect(normalizeReferenceUrl('https://instagram.com/conceptdigita.l')).toBeNull();
    expect(normalizeReferenceUrl('http://instagram.com/reel/ABC')).toBeNull();
    expect(normalizeReferenceUrl('https://evil.com/reel/x')).toBeNull();
    expect(normalizeReferenceUrl('https://instagram.com.evil.com/reel/x')).toBeNull();
    expect(normalizeReferenceUrl('https://169.254.169.254/')).toBeNull();
    expect(normalizeReferenceUrl('não é url')).toBeNull();
  });
  it('TikTok sem query e link curto', () => {
    const t = normalizeReferenceUrl('https://www.tiktok.com/@user/video/123?is_from_webapp=1');
    expect(t).toMatchObject({ normalized: 'https://www.tiktok.com/@user/video/123', platform: 'tiktok' });
    expect(normalizeReferenceUrl('https://vm.tiktok.com/ZM123/')?.platform).toBe('tiktok');
  });
  it('TikTok m.tiktok.com normaliza como www; vt.tiktok.com aceito', () => {
    expect(normalizeReferenceUrl('https://m.tiktok.com/@user/video/123?x=1')?.normalized).toBe('https://www.tiktok.com/@user/video/123');
    expect(normalizeReferenceUrl('https://vt.tiktok.com/ZS123/')).toMatchObject({ normalized: 'https://vt.tiktok.com/ZS123', platform: 'tiktok' });
  });
  it('rejeita credenciais, porta e host parecido', () => {
    expect(normalizeReferenceUrl('https://instagram.com@evil.com/reel/x')).toBeNull();
    expect(normalizeReferenceUrl('https://instagram.com:8443/reel/x')).toBeNull();
    expect(normalizeReferenceUrl('https://evil-instagram.com/reel/x')).toBeNull();
  });
});

describe('validateReferenceMeta / validateReferenceInput', () => {
  const url = 'https://instagram.com/reel/ABC';
  it('eixo inválido', () => {
    expect(validateReferenceMeta({ eixo: 'x' }).ok).toBe(false);
    expect(validateReferenceInput({ url, eixo: 'x' }).ok).toBe(false);
  });
  it('sobre_o_que exige nicho válido', () => {
    expect(validateReferenceInput({ url, eixo: 'sobre_o_que' }).ok).toBe(false);
    expect(validateReferenceInput({ url, eixo: 'sobre_o_que', nicho: 'xx' }).ok).toBe(false);
    const r = validateReferenceInput({ url, eixo: 'sobre_o_que', nicho: 'barbearia' });
    expect(r.ok && r.value.nicho).toBe('barbearia');
  });
  it('como_falar ignora nicho', () => {
    const r = validateReferenceInput({ url, eixo: 'como_falar', nicho: 'barbearia' });
    expect(r.ok && r.value.nicho).toBeNull();
  });
  it('views', () => {
    expect(validateReferenceInput({ url, eixo: 'como_falar', views: -1 }).ok).toBe(false);
    expect(validateReferenceInput({ url, eixo: 'como_falar', views: 1.5 }).ok).toBe(false);
    const r = validateReferenceInput({ url, eixo: 'como_falar', views: 1000 });
    expect(r.ok && r.value.views).toBe(1000);
    const n = validateReferenceInput({ url, eixo: 'como_falar' });
    expect(n.ok && n.value.views).toBeNull();
  });
  it('url inválida e corpo inválido', () => {
    expect(validateReferenceInput({ url: 'https://evil.com/x', eixo: 'como_falar' }).ok).toBe(false);
    expect(validateReferenceInput(null).ok).toBe(false);
    expect(validateReferenceMeta('x').ok).toBe(false);
  });
  it('meta sem url', () => {
    expect(validateReferenceMeta({ eixo: 'como_falar' })).toEqual({ ok: true, value: { eixo: 'como_falar', nicho: null, views: null } });
  });
});

const valid = {
  gancho: { tipo: 'dor', frase: 'Perdendo cliente?', primeiroQuadro: 'Close no rosto' },
  duracaoSeg: 30,
  cortesPorMinuto: 20,
  formato: 'pessoa_falando',
  tema: 'Atendimento',
  promessa: 'Vender mais',
  entrega: 'Mostra o método',
  cta: 'Siga',
  porQueViralizou: ['a', 'b', 'c'],
  comoAdaptar: 'Fazer igual',
};

describe('parseReferenceAnalysis', () => {
  it('lê JSON válido, com texto em volta', () => {
    expect(parseReferenceAnalysis(JSON.stringify(valid))).toEqual(valid);
    expect(parseReferenceAnalysis(`Aqui:\n${JSON.stringify(valid)}\nfim`)).toEqual(valid);
  });
  it('exige exatamente 3 motivos', () => {
    expect(parseReferenceAnalysis(JSON.stringify({ ...valid, porQueViralizou: ['a', 'b'] }))).toBeNull();
    expect(parseReferenceAnalysis(JSON.stringify({ ...valid, porQueViralizou: ['a', 'b', 'c', 'd'] }))).toBeNull();
  });
  it('tipos fechados', () => {
    expect(parseReferenceAnalysis(JSON.stringify({ ...valid, gancho: { ...valid.gancho, tipo: 'humor' } }))).toBeNull();
    expect(parseReferenceAnalysis(JSON.stringify({ ...valid, formato: 'outro' }))).toBeNull();
  });
  it('corta tema em 80', () => {
    const r = parseReferenceAnalysis(JSON.stringify({ ...valid, tema: 'x'.repeat(200) }));
    expect(r?.tema).toHaveLength(80);
  });
  it('lixo vira null', () => {
    expect(parseReferenceAnalysis('nada')).toBeNull();
    expect(parseReferenceAnalysis(JSON.stringify({ ...valid, duracaoSeg: 'a' }))).toBeNull();
  });
});

describe('referenceAnalysisPrompt', () => {
  it('cita todas as chaves e o negócio', () => {
    const p = referenceAnalysisPrompt({ eixo: 'como_falar', nicho: null, businessName: 'Concept Digital' });
    for (const k of ['gancho', 'tipo', 'frase', 'primeiroQuadro', 'duracaoSeg', 'cortesPorMinuto', 'formato', 'tema', 'promessa', 'entrega', 'cta', 'porQueViralizou', 'comoAdaptar']) {
      expect(p).toContain(k);
    }
    expect(p).toContain('Concept Digital');
  });
  it('constantes', () => {
    expect(REFERENCE_MAX_SECONDS).toBe(180);
    expect(REFERENCE_UPLOAD_MAX_BYTES).toBe(100 * 1024 * 1024);
  });
});
