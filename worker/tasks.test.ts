import { describe, expect, it } from 'vitest';
import { WORKER_TASKS, ownedTables, workerTasksFromEnv } from './tasks';

describe('workerTasksFromEnv', () => {
  it('sem variável atende tudo (comportamento antigo)', () => {
    expect([...workerTasksFromEnv(undefined)]).toEqual([...WORKER_TASKS]);
    expect([...workerTasksFromEnv(' , ')]).toEqual([...WORKER_TASKS]);
  });

  it('aceita lista com espaços e maiúsculas', () => {
    expect([...workerTasksFromEnv(' Video, pauta ,PILOTO')]).toEqual(['video', 'pauta', 'piloto']);
  });

  it('recusa valor desconhecido em vez de ignorar', () => {
    expect(() => workerTasksFromEnv('video,videos')).toThrow(/videos/);
  });
});

describe('ownedTables', () => {
  it('Railway só devolve à fila as tabelas dele', () => {
    expect(ownedTables(workerTasksFromEnv('video,referencias,pauta,piloto')))
      .toEqual(['marketing_videos', 'marketing_references']);
  });

  it('Mac fica com prospecção e planilha', () => {
    expect(ownedTables(workerTasksFromEnv('prospeccao,planilha'))).toEqual(['lead_searches', 'lead_columns']);
  });
});
