import { describe, expect, it } from 'vitest';
import { parsePlaybook, playbookPrompt, type PlaybookRef } from './playbook';
import type { ReferenceAnalysis } from '@/types';

const analise = (tema: string): ReferenceAnalysis => ({
  gancho: { tipo: 'dor', frase: 'Você perde cliente?', primeiroQuadro: 'rosto' },
  duracaoSeg: 20, cortesPorMinuto: 30, formato: 'pessoa_falando', tema,
  promessa: 'P', entrega: 'E', cta: 'C', porQueViralizou: ['a'], comoAdaptar: 'adapte',
});
const ref = (eixo: PlaybookRef['eixo'], tema: string): PlaybookRef => ({
  id: tema, url: `https://x.com/${tema}`, eixo, nicho: null, analise: analise(tema),
});

describe('parsePlaybook', () => {
  it('limita comoFalar a 5 e evitar a 3', () => {
    const p = parsePlaybook(JSON.stringify({
      comoFalar: ['1', '2', '3', '4', '5', '6', '7'], sobreOQue: ['a'], evitar: ['x', 'y', 'z', 'w'],
    }));
    expect(p?.comoFalar).toHaveLength(5);
    expect(p?.evitar).toHaveLength(3);
  });
  it('lista ausente vira []', () => {
    expect(parsePlaybook('{"comoFalar":["a"],"evitar":[]}')).toEqual({ comoFalar: ['a'], sobreOQue: [], evitar: [] });
  });
  it('JSON quebrado: null', () => {
    expect(parsePlaybook('{"comoFalar": [')).toBeNull();
    expect(parsePlaybook('sem json')).toBeNull();
  });
});

describe('playbookPrompt', () => {
  it('separa os eixos, cita cada tema e delimita os dados', () => {
    const p = playbookPrompt([ref('como_falar', 'TemaA'), ref('sobre_o_que', 'TemaB')]);
    const [antes, depois] = p.split('EIXO "sobre o quê"');
    expect(antes).toContain('TemaA');
    expect(antes).not.toContain('TemaB');
    expect(depois).toContain('TemaB');
    expect(p).toMatch(/<referencias>[\s\S]*<\/referencias>/);
  });
});
