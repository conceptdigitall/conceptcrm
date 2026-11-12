import { describe, expect, it, vi } from 'vitest';
import {
  HOOK_QUOTA, hookPromptLines, numbersIn, parseHooks, proofProblem, runHookBank,
  type Hook, type HookKind,
} from './hooks';

const BRIEF = 'Barbearia do Alemão. Mais de 120 cortes por mês e agenda aberta até as 20h.';

const base = (kind: HookKind, i: number, extra: Partial<Hook> = {}): Hook => ({
  kind, firstFrame: `Cadeira vazia girando ${i}`, line: `Três da tarde, nenhum cliente ${'abc'[i]}`,
  promise: 'Mostra como encher a agenda', payoffBeat: 'virada', ...extra,
});

function bank(proof: Partial<Hook> = {}): Hook[] {
  const out: Hook[] = [];
  (Object.keys(HOOK_QUOTA) as HookKind[]).forEach((k) => {
    for (let i = 0; i < HOOK_QUOTA[k]; i++) {
      out.push(k === 'prova'
        ? base(k, i, { line: 'São 120 cortes por mês aqui', evidence: 'Mais de 120 cortes por mês', ...proof })
        : base(k, i));
    }
  });
  return out;
}
const block = (hooks: unknown) => '```json\n' + JSON.stringify({ hooks }) + '\n```';

describe('parseHooks', () => {
  it('aceita 10 ganchos 3/3/3/1 e não descarta nenhum válido', () => {
    const r = parseHooks(block(bank()), BRIEF);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hooks).toHaveLength(10);
      expect(r.hooks.some((h) => h.discarded)).toBe(false);
    }
  });

  it('recusa JSON inválido e cota errada', () => {
    expect(parseHooks('nada de json', BRIEF)).toEqual({ ok: false, errors: ['a resposta não é um JSON válido'] });
    const r = parseHooks(block(bank().slice(1)), BRIEF);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors[0]).toContain('3 ganchos de curiosidade');
  });

  it('recusa fala com mais de 12 palavras', () => {
    const hooks = bank();
    hooks[0].line = 'uma duas três quatro cinco seis sete oito nove dez onze doze treze';
    const r = parseHooks(block(hooks), BRIEF);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toContain('13 palavras');
  });

  it('descarta abertura com frase proibida', () => {
    const hooks = bank();
    hooks[0].line = 'Você não vai acreditar nisso';
    hooks[1].firstFrame = 'Logotipo da empresa aparece';
    const r = parseHooks(block(hooks), BRIEF);
    expect(r.ok && r.hooks[0].discarded).toContain('você não vai acreditar');
    expect(r.ok && r.hooks[1].discarded).toContain('logo');
    expect(r.ok && r.hooks[2].discarded).toBeUndefined();
  });
});

describe('prova sem número real é descartada', () => {
  it('descarta número inventado', () => {
    const r = parseHooks(block(bank({ line: 'São 500 cortes por mês aqui' })), BRIEF);
    expect(r.ok && r.hooks.filter((h) => h.kind === 'prova').every((h) => h.discarded?.includes('500'))).toBe(true);
  });

  it('descarta prova sem número na fala', () => {
    expect(proofProblem(base('prova', 0, { evidence: 'Mais de 120 cortes' }), BRIEF)).toMatch(/sem número/);
  });

  it('descarta evidência que não está no briefing', () => {
    const h = base('prova', 0, { line: 'São 120 cortes por mês', evidence: '120 clientes fiéis' });
    expect(proofProblem(h, BRIEF)).toMatch(/evidência/);
  });

  it('descarta tudo quando o briefing não tem número', () => {
    const r = parseHooks(block(bank()), 'Barbearia do Alemão, corte e barba.');
    expect(r.ok && r.hooks.filter((h) => h.kind === 'prova').every((h) => h.discarded)).toBe(true);
  });

  it('mantém prova com número do briefing, mesmo com milhar formatado', () => {
    const brief = 'Atendemos 1.200 clientes por ano';
    const h = base('prova', 0, { line: 'São 1200 clientes por ano', evidence: 'Atendemos 1.200 clientes' });
    expect(proofProblem(h, brief)).toBeNull();
    expect(numbersIn('R$ 1.200,50 e 3,5')).toEqual(['1200.50', '3.5']);
  });
});

describe('runHookBank', () => {
  it('gera, jura e devolve o escolhido; provas sem dado ficam fora da disputa', async () => {
    const ask = vi.fn(async (role: string, _s: string, user: string) => {
      if (role === 'director') return block(bank({ line: 'São 500 cortes aqui' }));
      expect(user).not.toContain('500 cortes');
      return '```json\n{"choice": 3, "reason": "dor concreta"}\n```';
    });
    const out = await runHookBank({ ask }, BRIEF);
    expect(out.chosenIndex).toBe(3);
    expect(out.hooks).toHaveLength(10);
    expect(out.reason).toBe('dor concreta');
    expect(hookPromptLines(out).join('\n')).toContain('Cadeira vazia girando');
  });

  it('o jurado não pode escolher gancho descartado: cai no primeiro elegível', async () => {
    const ask = vi.fn(async (role: string) => (role === 'director'
      ? block(bank({ line: 'São 500 cortes aqui' }))
      : '```json\n{"choice": 6}\n```')); // índice 6 é prova descartada
    const out = await runHookBank({ ask }, BRIEF);
    expect(out.chosenIndex).toBe(0);
    expect(out.judgeFallback).toBe(true);
  });

  it('tenta de novo com os erros e falha em português depois de duas respostas ruins', async () => {
    const ask = vi.fn().mockResolvedValue('lixo');
    await expect(runHookBank({ ask }, BRIEF)).rejects.toThrow(/Banco de ganchos falhou/);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask.mock.calls[1][2]).toContain('recusada');
  });
});
