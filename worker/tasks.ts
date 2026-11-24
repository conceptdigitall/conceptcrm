// Quais filas este worker atende (WORKER_TASKS, separado por vírgula).
// Sem a variável, atende tudo, como sempre foi. Serve para dividir o trabalho
// entre duas máquinas sem uma pegar o job da outra: no Railway (sem Docker nem
// Laya) roda `video,referencias,pauta,piloto`; no Mac, `prospeccao,planilha`.
import type { JobTable } from './queue';

export const WORKER_TASKS = ['prospeccao', 'planilha', 'video', 'referencias', 'pauta', 'piloto'] as const;
export type WorkerTask = (typeof WORKER_TASKS)[number];

export function workerTasksFromEnv(raw: string | undefined): Set<WorkerTask> {
  const list = (raw ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return new Set(WORKER_TASKS);
  const unknown = list.filter((t) => !(WORKER_TASKS as readonly string[]).includes(t));
  if (unknown.length > 0) {
    throw new Error(`WORKER_TASKS com valor desconhecido: ${unknown.join(', ')} (use ${WORKER_TASKS.join(', ')})`);
  }
  return new Set(list as WorkerTask[]);
}

// A fila de cada tarefa. Pauta e piloto não têm fila própria: criam pedidos em
// marketing_videos, que quem tem `video` renderiza.
const TABLE_OF: Partial<Record<WorkerTask, JobTable>> = {
  prospeccao: 'lead_searches',
  planilha: 'lead_columns',
  video: 'marketing_videos',
  referencias: 'marketing_references',
};

/** Tabelas cujos jobs "running" este worker pode devolver à fila ao iniciar (só as dele). */
export function ownedTables(tasks: Set<WorkerTask>): JobTable[] {
  return [...tasks].map((t) => TABLE_OF[t]).filter((t): t is JobTable => Boolean(t));
}
