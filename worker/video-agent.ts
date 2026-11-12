import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runCommand } from './exec';
import type { VideoStyle } from '@/lib/marketing/video-options';

// Composição em modo agente: o Claude Code roda dentro da pasta do projeto do vídeo,
// escreve index.html + compositions/, roda o check, tira snapshots, olha os quadros e
// corrige — o mesmo ciclo que fez o vídeo da barbearia. O modo de chamada única
// (um bloco HTML na resposta) continua para os outros estilos e motores.

export type AgentMode = 'off' | 'cinematico' | 'all';

/** VIDEO_AGENT=off|cinematico|all (padrão: só o estilo cinemático, que precisa de vários arquivos). */
export function agentMode(env: Record<string, string | undefined>): AgentMode {
  const v = env.VIDEO_AGENT;
  return v === 'off' || v === 'all' ? v : 'cinematico';
}

/** Só o motor CLI tem ferramentas; arte estática não precisa de revisão por quadros. */
export function shouldUseAgent(mode: AgentMode, engine: string, style: VideoStyle, still?: boolean): boolean {
  if (engine !== 'cli' || still || mode === 'off') return false;
  return mode === 'all' || style === 'cinematico';
}

// Único comando de shell que o agente pode rodar. O wrapper aceita só `check` e
// `snapshot` (nada de render/publish) e desliga a descrição por Gemini, que mandaria
// os quadros do cliente para fora e custaria uma chamada a mais.
export const HF_WRAPPER = 'hf';
export function wrapperScript(hyperframesBin: string): string {
  const bin = `'${hyperframesBin.replace(/'/g, `'\\''`)}'`;
  return [
    '#!/bin/sh',
    'case "$1" in',
    `  check) exec ${bin} check ;;`,
    `  snapshot) shift; exec ${bin} snapshot --describe false "$@" ;;`,
    '  *) echo "Só ./hf check e ./hf snapshot --at ... são permitidos." >&2; exit 2 ;;',
    'esac',
    '',
  ].join('\n');
}

export const AGENT_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'Bash'];
export const AGENT_ALLOWED = [
  'Read', 'Glob', 'Grep',
  // Regras Edit valem para todas as ferramentas que escrevem (Write incluído); `Write(...)` é
  // ignorado e `Edit(./**)` não casou no teste real. `Edit(**)` libera só a pasta do projeto (cwd).
  'Edit(**)',
  `Bash(./${HF_WRAPPER} check)`, `Bash(./${HF_WRAPPER} snapshot:*)`,
];

export function agentArgs(model: string, system: string): string[] {
  return [
    '-p', '--model', model, ...(model.includes('haiku') ? [] : ['--effort', 'high']),
    '--system-prompt', system,
    '--tools', AGENT_TOOLS.join(','),
    '--allowedTools', ...AGENT_ALLOWED,
    // Tudo fora da lista é negado sem perguntar (não há ninguém para responder).
    '--permission-mode', 'dontAsk',
    '--strict-mcp-config', '--setting-sources', '',
    '--disable-slash-commands', '--no-session-persistence', '--output-format', 'json',
  ];
}

export const MAX_REVIEW_ROUNDS = 3;

/** Instruções do ciclo escrever → check → snapshot → olhar → corrigir, somadas ao pedido do vídeo. */
export function buildAgentPrompt(videoPrompt: string, fix?: string): string {
  if (fix) {
    return [
      'O check final do worker ainda falhou com a saída abaixo. Corrija os arquivos do projeto,',
      `rode \`./${HF_WRAPPER} check\` até passar e confira de novo os quadros das cenas que mexeu.`,
      '', '```', fix.slice(-6000), '```',
    ].join('\n');
  }
  return [
    videoPrompt,
    '',
    '# Como trabalhar (modo agente)',
    'Você está dentro da pasta do projeto HyperFrames. `assets/` já tem as fotos, a trilha, a narração e os kits listados.',
    '1. Escreva `index.html` e as sub-composições em `compositions/` com a ferramenta Write.',
    `2. Rode \`./${HF_WRAPPER} check\` e corrija todos os erros. Avisos: pese cada um.`,
    `3. Rode \`./${HF_WRAPPER} snapshot --at t1,t2,...\` com um tempo no meio de cada cena (e um logo depois de cada virada).`,
    '   Os PNGs saem em `snapshots/<id>/`; abra cada um com Read e olhe de verdade.',
    '4. Procure: texto cortado ou fora da faixa segura, elemento cobrindo rosto ou texto, contraste fraco,',
    '   quadro vazio ou preto, cena 3D sem personagem visível, legenda fora do tempo da fala, sorriso escondido.',
    `5. Corrija o que achar e repita os passos 2–4. No máximo ${MAX_REVIEW_ROUNDS} rodadas de snapshot.`,
    `6. Termine só quando \`./${HF_WRAPPER} check\` passar. Não renderize: o worker faz isso.`,
    'Responda no fim com 3 a 6 linhas: o que corrigiu na revisão e o que ficou como está.',
  ].join('\n');
}

export async function prepareAgentProject(dir: string, hyperframesBin: string): Promise<void> {
  const p = join(dir, HF_WRAPPER);
  await writeFile(p, wrapperScript(hyperframesBin));
  await chmod(p, 0o755);
}

/** Roda o agente na pasta do projeto e devolve o relatório final dele. */
export async function composeWithAgent(
  dir: string, prompt: string, opts: { bin: string; model: string; system: string; timeoutMs?: number },
): Promise<string> {
  // Sem chave de API no ambiente, o CLI usa o login do plano em vez de cobrar no Console.
  const { ANTHROPIC_API_KEY: _k, ANTHROPIC_AUTH_TOKEN: _t, GEMINI_API_KEY: _g, ...env } = process.env;
  const r = await runCommand(opts.bin, agentArgs(opts.model, opts.system), {
    cwd: dir, env, input: prompt, timeoutMs: opts.timeoutMs ?? 40 * 60 * 1000,
  });
  let out: { is_error?: boolean; result?: string };
  try { out = JSON.parse(r.stdout); } catch { throw new Error(`Agente do vídeo falhou: ${(r.stderr || r.stdout).slice(-400)}`); }
  if (out.is_error || r.code !== 0) throw new Error(`Agente do vídeo falhou: ${(out.result ?? r.stderr).slice(0, 400)}`);
  return out.result ?? '';
}
