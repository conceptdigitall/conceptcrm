import { describe, expect, it } from 'vitest';
import {
  autopilotConfigFromEnv,
  autopilotPrompt,
  dueCount,
  nextSlot,
  parseAutopilotIdea,
  weekStart,
} from './autopilot';
import { DEFAULT_SETTINGS } from './content';

// Quarta 15/10/2026 12:00 em Brasília = 15:00 UTC.
const WED = new Date('2026-10-15T15:00:00Z');
const MON = new Date('2026-10-12T15:00:00Z');
const cfg = { feedPerWeek: 3, storiesPerWeek: 5 };

describe('weekStart', () => {
  it('é a segunda 00:00 de Brasília', () => {
    expect(weekStart(WED).toISOString()).toBe('2026-10-12T03:00:00.000Z');
  });
  it('domingo à noite ainda é a semana que começou na segunda anterior', () => {
    expect(weekStart(new Date('2026-10-19T02:30:00Z')).toISOString()).toBe('2026-10-12T03:00:00.000Z');
  });
  it('segunda 00:30 de Brasília já é semana nova', () => {
    expect(weekStart(new Date('2026-10-19T03:30:00Z')).toISOString()).toBe('2026-10-19T03:00:00.000Z');
  });
});

describe('dueCount', () => {
  it('espalha a meta pelos dias', () => {
    expect(dueCount(5, new Date('2026-10-12T04:00:00Z'))).toBe(1); // segunda
    expect(dueCount(5, WED)).toBe(3); // quarta
    expect(dueCount(3, new Date('2026-10-18T20:00:00Z'))).toBe(3); // domingo
  });
});

describe('nextSlot', () => {
  it('começa pelo Reel do feed e alterna com arte estática', () => {
    expect(nextSlot(cfg, { feed: 0, story: 0 }, MON)).toMatchObject({ kind: 'feed', mediaType: 'video', options: { duration: 30 } });
    expect(nextSlot(cfg, { feed: 1, story: 3 }, WED)).toMatchObject({ kind: 'feed', mediaType: 'foto', format: 'square', options: { still: true } });
  });
  it('prioriza o que está mais atrasado', () => {
    expect(nextSlot(cfg, { feed: 0, story: 0 }, WED)?.kind).toBe('story');
  });
  it('cria story 9:16 quando o feed está em dia', () => {
    expect(nextSlot(cfg, { feed: 2, story: 0 }, WED)).toMatchObject({ kind: 'story', format: 'vertical', options: { target: 'story', autopilot: true } });
  });
  it('null quando a semana está em dia', () => {
    expect(nextSlot(cfg, { feed: 2, story: 3 }, WED)).toBeNull();
  });
});

describe('autopilotConfigFromEnv', () => {
  it('desligado sem MARKETING_AUTOPILOT=1', () => {
    expect(autopilotConfigFromEnv({})).toBeNull();
  });
  it('usa padrões e aceita override válido', () => {
    expect(autopilotConfigFromEnv({ MARKETING_AUTOPILOT: '1' })).toEqual(cfg);
    expect(autopilotConfigFromEnv({ MARKETING_AUTOPILOT: '1', AUTOPILOT_STORIES_PER_WEEK: '7', AUTOPILOT_FEED_PER_WEEK: 'x' }))
      .toEqual({ feedPerWeek: 3, storiesPerWeek: 7 });
  });
});

describe('autopilotPrompt / parseAutopilotIdea', () => {
  it('pede JSON e cita temas recentes', () => {
    const slot = nextSlot(cfg, { feed: 0, story: 0 }, MON)!;
    const p = autopilotPrompt({
      slot, settings: { ...DEFAULT_SETTINGS, instagram_username: 'conceptdigita.l' }, projects: ['Barbearia (landing)'], recentTitles: ['3 erros no WhatsApp'],
    });
    expect(p).toContain('Reel de 30 s');
    expect(p).toContain('3 erros no WhatsApp');
    expect(p).toContain('"caption"');
  });
  it('lê JSON com cerca e rejeita campo faltando', () => {
    expect(parseAutopilotIdea('```json\n{"title":"T","brief":"B","caption":"C"}\n```')).toEqual({ title: 'T', brief: 'B', caption: 'C' });
    expect(parseAutopilotIdea('{"title":"T","brief":""}')).toBeNull();
    expect(parseAutopilotIdea('sem json')).toBeNull();
  });
});
