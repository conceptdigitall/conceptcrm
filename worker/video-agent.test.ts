import { mkdtemp, readFile, writeFile, chmod } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { runCommand } from './exec';
import { runVideoJob } from './video';
import {
  AGENT_ALLOWED, agentArgs, agentMode, buildAgentPrompt, prepareAgentProject, shouldUseAgent,
} from './video-agent';
import type { MarketingVideo } from '@/types';

describe('quando usar o agente', () => {
  it('padrão: só o estilo cinemático, só no motor CLI, nunca em arte estática', () => {
    const mode = agentMode({});
    expect(mode).toBe('cinematico');
    expect(shouldUseAgent(mode, 'cli', 'cinematico')).toBe(true);
    expect(shouldUseAgent(mode, 'cli', 'kinetic')).toBe(false);
    expect(shouldUseAgent(mode, 'gemini', 'cinematico')).toBe(false);
    expect(shouldUseAgent(mode, 'cli', 'cinematico', true)).toBe(false);
  });
  it('VIDEO_AGENT=all liga para todos os estilos e off desliga', () => {
    expect(shouldUseAgent(agentMode({ VIDEO_AGENT: 'all' }), 'cli', 'kinetic')).toBe(true);
    expect(shouldUseAgent(agentMode({ VIDEO_AGENT: 'off' }), 'cli', 'cinematico')).toBe(false);
    expect(agentMode({ VIDEO_AGENT: 'qualquer' })).toBe('cinematico');
  });
});

describe('permissões do agente', () => {
  it('libera só escrita na pasta e os comandos check/snapshot, negando o resto sem perguntar', () => {
    const args = agentArgs('claude-opus-5-5', 'sys');
    expect(args).toContain('dontAsk');
    expect(args).toContain('--strict-mcp-config');
    expect(AGENT_ALLOWED).toEqual(expect.arrayContaining(['Edit(**)', 'Bash(./hf check)', 'Bash(./hf snapshot:*)']));
    expect(AGENT_ALLOWED.some((r) => r === 'Bash' || r.includes('render'))).toBe(false);
  });
  it('o wrapper repassa check e snapshot (sem Gemini) e recusa render', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hf-agent-'));
    const fakeBin = join(dir, 'fake bin.sh');
    await writeFile(fakeBin, '#!/bin/sh\necho "args: $@"\n');
    await chmod(fakeBin, 0o755);
    await prepareAgentProject(dir, fakeBin);
    const check = await runCommand('./hf', ['check'], { cwd: dir, timeoutMs: 5000 });
    expect(check.stdout.trim()).toBe('args: check');
    const snap = await runCommand('./hf', ['snapshot', '--at', '1,2'], { cwd: dir, timeoutMs: 5000 });
    expect(snap.stdout.trim()).toBe('args: snapshot --describe false --at 1,2');
    const render = await runCommand('./hf', ['render'], { cwd: dir, timeoutMs: 5000 });
    expect(render.code).toBe(2);
    expect(render.stdout).toBe('');
    expect(await readFile(join(dir, 'hf'), 'utf8')).toContain('#!/bin/sh');
  });
});

describe('prompt do agente', () => {
  it('soma o ciclo de revisão ao pedido do vídeo', () => {
    const p = buildAgentPrompt('Vídeo da clínica');
    expect(p.startsWith('Vídeo da clínica')).toBe(true);
    expect(p).toContain('./hf check');
    expect(p).toContain('./hf snapshot --at');
    expect(p).toContain('Não renderize');
  });
  it('na rodada de correção manda a saída do check', () => {
    expect(buildAgentPrompt('x', 'ERRO: clip sem data-start')).toContain('ERRO: clip sem data-start');
  });
});

describe('runVideoJob no estilo cinemático', () => {
  const video = {
    id: 'v-2', account_id: 'acc-1', prompt: 'Clínica sem agenda online', image_paths: [],
    format: 'vertical', tone: 'default', director_input: { style: 'cinematico', duration: 30, target: 'reels' },
  } as unknown as MarketingVideo;

  function fakeDb() {
    const updates: Record<string, unknown>[] = [];
    const db = {
      storage: { from: () => ({ download: async () => ({ data: null, error: null }), upload: async () => ({ error: null }) }) },
      from: () => ({ update: (patch: Record<string, unknown>) => { updates.push(patch); return { eq: async () => ({ error: null }) }; } }),
    };
    return { db: db as never, updates };
  }
  function deps(over: Record<string, unknown> = {}) {
    return {
      compose: vi.fn(),
      agent: vi.fn().mockResolvedValue('Corrigi o texto cortado na cena 3.'),
      script: vi.fn().mockResolvedValue('Sua clínica perde paciente. Agora não mais.'),
      narrate: vi.fn().mockResolvedValue(null),
      hooks: vi.fn().mockResolvedValue(null),
      check: vi.fn().mockResolvedValue({ ok: true, output: '' }),
      render: vi.fn().mockResolvedValue(undefined),
      poster: vi.fn().mockResolvedValue(undefined),
      readFile: vi.fn().mockResolvedValue(Buffer.from('x')),
      ...over,
    };
  }

  it('usa o agente com saída em arquivos e guarda o relatório da revisão', async () => {
    const { db, updates } = fakeDb();
    const d = deps();
    await runVideoJob(db, video, d);
    expect(d.compose).not.toHaveBeenCalled();
    expect(d.agent).toHaveBeenCalledTimes(1);
    const prompt = d.agent.mock.calls[0][1] as string;
    expect(prompt).toContain('CINEMÁTICO 3D');
    expect(prompt).toContain('compositions/');
    expect(prompt).not.toContain('Responda com UM bloco');
    expect(d.render).toHaveBeenCalledTimes(1);
    expect(updates.at(-1)).toMatchObject({ status: 'done', director_output: { review: 'Corrigi o texto cortado na cena 3.' } });
  });

  it('quando o check final falha, chama o agente de novo com a saída do check', async () => {
    const { db, updates } = fakeDb();
    const check = vi.fn()
      .mockResolvedValueOnce({ ok: false, output: 'ERRO overlap no o3' })
      .mockResolvedValueOnce({ ok: true, output: '' });
    const d = deps({ check });
    await runVideoJob(db, video, d);
    expect(d.agent).toHaveBeenCalledTimes(2);
    expect(d.agent.mock.calls[1][1]).toContain('ERRO overlap no o3');
    expect(updates.at(-1)).toMatchObject({ status: 'done' });
  });
});
