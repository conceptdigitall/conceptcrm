# Planilha Preditiva (parte A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na aba Prospecção, o João cria uma coluna escrevendo só o título e o Laya (rodando no Mac) preenche a coluna para os 500 leads mais recentes, com correção manual por célula.

**Architecture:** A coluna é um job na fila do Supabase (`lead_columns`, mesmo padrão de `lead_searches`). O worker local pega o job, monta um texto por lead, chama `laya-serve` em `127.0.0.1:8765` em lotes de 32 e grava `lead_column_values`. A tela lê as duas tabelas por polling; correções vão por uma rota que valida o valor.

**Tech Stack:** Next.js 16 (App Router), Supabase (Postgres + RLS), Vitest, worker Node rodando com tsx, Python 3.12 + `laya[serve]==0.3.22` via uv.

**Spec:** `docs/superpowers/specs/2026-09-30-planilha-preditiva-design.md` (inclui a seção "Contrato do Laya").

## Global Constraints

- Repositório `wacrm`, branch `feat/planilha-preditiva` (criada de `feat/prospeccao-marketing`). Leia `AGENTS.md`: Next 16 tem mudanças incompatíveis; `params` de rota é `Promise`.
- Há mudanças não commitadas que não são deste trabalho (`src/app/(dashboard)/dashboard/page.tsx`, `src/components/dashboard/portfolio-analytics.tsx`, `src/lib/dashboard/portfolio-queries.ts`, `supabase/migrations/20260925_portfolio_analytics.sql`). Nunca faça `git add -A`/`git add .`; adicione arquivos pelo nome.
- Tudo que o usuário lê é em português do Brasil.
- Acesso: toda rota nova usa `requireRole('agent')` e depois `isInternalAccount(ctx.accountId)` → 403 `{ error: 'Recurso interno da Concept Digital' }`. O worker só processa contas de `NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS`.
- Título: 1–120 caracteres. `?` no fim → `noul`; `Tema: a, b, c` → `choice` com 2–8 opções distintas (sem acento/caixa), cada uma com até 40 caracteres; qualquer outro → `score` com níveis `baixo`, `médio`, `alto`.
- Limites: 10 colunas por conta; preenchimento dos 500 leads mais recentes; lotes de 32 (o servidor aceita até 64).
- Laya: `laya[serve]==0.3.22`, ambiente em `worker/laya/.venv`, servidor em `127.0.0.1:8765`, checkpoint `multilingual`. `LAYA_URL=http://127.0.0.1:8765`.
- Confiança abaixo de 0,6 aparece acinzentada. Célula corrigida mostra lápis e conta como 100%.
- O worker nunca escreve `corrected_value` nem sobrescreve linhas que já têm `value` ou `corrected_value`.
- Testes: `npx vitest run <arquivo>`. Suíte completa sem os 4 arquivos que já falham no `main`:
  `npx vitest run --exclude src/app/api/whatsapp/send/route.test.ts --exclude src/i18n/messages.test.ts --exclude src/lib/dashboard/date-utils.test.ts --exclude src/lib/whatsapp/meta-api.typing.test.ts`
- Commits em português, terminando com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Lead quase vazio** (só nome, sem categoria, nota, site nem `raw`): o texto enviado ao Laya continua válido e curto, sem "undefined" nem linhas vazias. Teste em Task 3.
2. **Título digitado "torto"** (`Nicho:saúde,beleza`, espaços duplos, `Tem site??`, `Nicho: saúde, Saude`): funciona ou recusa com mensagem clara; opções repetidas só por acento são recusadas. Teste em Task 2.
3. **Coluna excluída enquanto o worker preenche**: o job termina quieto (sem marcar `failed` numa coluna que não existe mais). Teste em Task 5.
4. **Correção com caixa/acento diferente** (`BELEZA`, `nao`): gravada na forma canônica (`beleza`, `não`), não recusada. Teste em Task 7.
5. **Laya devolve menos respostas que linhas enviadas**: o lote falha com mensagem, nunca grava respostas no lead errado. Teste em Task 4.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/045_lead_columns.sql` (novo) | tabelas, RLS, trigger que amarra valor ↔ coluna ↔ lead na mesma conta |
| `src/types/index.ts` (mod) | `ColumnKind`, `LeadColumn`, `LeadColumnValue`, `Lead.raw` |
| `src/lib/prospecting/columns.ts` (novo) | funções puras: título → coluna, lead → texto, resposta do Laya → célula, valores válidos, ordenação |
| `worker/laya-client.ts` (novo) | chamada HTTP ao `laya-serve` com retry de 503 |
| `worker/columns.ts` (novo) | job `runColumnJob` e `requeueColumnsForAccount` |
| `worker/queue.ts`, `worker/index.ts` (mod) | fila aceita `lead_columns`; ordem buscas → colunas → vídeos |
| `worker/laya/requirements.txt` (novo) | versão fixada do Laya |
| `src/app/api/prospecting/columns/**` (novo) | criar, tentar de novo, excluir, corrigir |
| `src/components/prospecting/ai-columns.tsx` (novo) | cabeçalho, célula, campo "Nova coluna IA…", quadro de ajuda |
| `src/app/(dashboard)/prospeccao/page.tsx` (mod) | integra as colunas na tabela |
| `worker/scripts/compare-column.ts` (novo) | medição Laya × Claude para a parte B |

---

### Task 1: Migration 045 e tipos

**Files:**
- Create: `supabase/migrations/045_lead_columns.sql`
- Modify: `src/types/index.ts` (interface `Lead` e fim do arquivo)

**Interfaces:**
- Produces: tabelas `lead_columns` e `lead_column_values`; tipos `ColumnKind`, `LeadColumn`, `LeadColumnValue`; campo opcional `Lead.raw`.

- [x] **Step 1: Escrever a migration**

```sql
-- ============================================================
-- 045_lead_columns.sql — Planilha Preditiva: colunas de IA sobre os
-- leads da Prospecção, preenchidas pelo worker local com o Laya.
-- Ferramenta interna da Concept. Aditiva e idempotente.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  kind TEXT NOT NULL CHECK (kind IN ('noul','choice','score')),
  options TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(options) <= 8),
  instructions TEXT NOT NULL CHECK (char_length(instructions) BETWEEN 1 AND 120),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  error TEXT,
  model TEXT,
  filled_count INTEGER,
  duration_ms INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_columns_queue ON lead_columns(status, created_at);
CREATE INDEX IF NOT EXISTS idx_lead_columns_account ON lead_columns(account_id, created_at);

CREATE TABLE IF NOT EXISTS lead_column_values (
  column_id UUID NOT NULL REFERENCES lead_columns(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  value TEXT,
  confidence NUMERIC(4,3) CHECK (confidence BETWEEN 0 AND 1),
  corrected_value TEXT,
  corrected_by UUID,
  corrected_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (column_id, lead_id)
);
CREATE INDEX IF NOT EXISTS idx_lead_column_values_lead ON lead_column_values(lead_id);

-- The value's account always comes from its column, and the lead must belong
-- to that same account. Runs before RLS WITH CHECK, so an agent of account A
-- cannot attach rows to account B's column or leads.
CREATE OR REPLACE FUNCTION lead_column_values_same_account() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  SELECT account_id INTO NEW.account_id FROM lead_columns WHERE id = NEW.column_id;
  IF NEW.account_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM leads WHERE id = NEW.lead_id AND account_id = NEW.account_id) THEN
    RAISE EXCEPTION 'lead_column_values: coluna e lead precisam ser da mesma conta'
      USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lead_column_values_same_account ON lead_column_values;
CREATE TRIGGER trg_lead_column_values_same_account
  BEFORE INSERT OR UPDATE ON lead_column_values
  FOR EACH ROW EXECUTE FUNCTION lead_column_values_same_account();

ALTER TABLE lead_columns ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_column_values ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['lead_columns','lead_column_values'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %1$s_select ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_select ON %1$s FOR SELECT USING (is_account_member(account_id))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_insert ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_insert ON %1$s FOR INSERT WITH CHECK (is_account_member(account_id, ''agent''))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_update ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_update ON %1$s FOR UPDATE USING (is_account_member(account_id, ''agent'')) WITH CHECK (is_account_member(account_id, ''agent''))', t);
    EXECUTE format('DROP POLICY IF EXISTS %1$s_delete ON %1$s', t);
    EXECUTE format('CREATE POLICY %1$s_delete ON %1$s FOR DELETE USING (is_account_member(account_id, ''agent''))', t);
  END LOOP;
END $$;
```

- [x] **Step 2: Adicionar os tipos**

Em `src/types/index.ts`, dentro de `interface Lead`, logo depois de `maps_url: string | null;`:

```ts
  /** Full Google Maps entry from the scraper (description, about, complete_address…). */
  raw?: Record<string, unknown> | null;
```

No fim do arquivo:

```ts
export type ColumnKind = 'noul' | 'choice' | 'score';

export interface LeadColumn {
  id: string;
  account_id: string;
  created_by: string | null;
  title: string;
  kind: ColumnKind;
  options: string[];
  instructions: string;
  status: JobStatus;
  error: string | null;
  model: string | null;
  filled_count: number | null;
  duration_ms: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface LeadColumnValue {
  column_id: string;
  lead_id: string;
  account_id: string;
  value: string | null;
  confidence: number | null;
  corrected_value: string | null;
  corrected_by: string | null;
  corrected_at: string | null;
  updated_at: string;
}
```

- [x] **Step 3: Checar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [x] **Step 4: Aplicar no Supabase da Concept (projeto `pkvlnhfzhjjsblotzoxn`)**

Use a ferramenta `apply_migration` do Supabase MCP com `name: "045_lead_columns"` e o SQL do Step 1. Depois:
- `execute_sql`: `select count(*) from lead_columns; select count(*) from lead_column_values;` → `0` e `0`.
- `get_advisors` (type `security`): nenhum aviso novo sobre `lead_columns`, `lead_column_values` ou `lead_column_values_same_account`.

- [x] **Step 5: Commit**

```bash
git add supabase/migrations/045_lead_columns.sql src/types/index.ts
git commit -m "feat(db): tabelas da Planilha Preditiva com RLS e trava de conta

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Título → coluna (`parseColumnTitle`)

**Files:**
- Create: `src/lib/prospecting/columns.ts`
- Test: `src/lib/prospecting/columns.test.ts`

**Interfaces:**
- Consumes: `ColumnKind` de `@/types`.
- Produces:
  - `SCORE_LEVELS: readonly ['baixo','médio','alto']`, `NOUL_VALUES: readonly ['sim','não']`, `MAX_TITLE = 120`, `MAX_COLUMNS = 10`
  - `normalizeLabel(s: string): string`
  - `interface ParsedColumn { title: string; kind: ColumnKind; options: string[]; instructions: string }`
  - `type ParseResult = { ok: true; value: ParsedColumn } | { ok: false; error: string }`
  - `parseColumnTitle(input: unknown): ParseResult`

- [x] **Step 1: Escrever os testes**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeLabel, parseColumnTitle } from './columns';

describe('normalizeLabel', () => {
  it('ignores accents, case and surrounding spaces', () => {
    expect(normalizeLabel('  Saúde ')).toBe('saude');
    expect(normalizeLabel('NÃO')).toBe('nao');
  });
});

describe('parseColumnTitle', () => {
  it('a title ending in ? is a yes/no column', () => {
    expect(parseColumnTitle('Tem site?')).toEqual({
      ok: true, value: { title: 'Tem site?', kind: 'noul', options: [], instructions: 'Tem site?' },
    });
  });
  it('"Tema: a, b, c" is a choice column with trimmed options', () => {
    expect(parseColumnTitle('Nicho: saúde, beleza , alimentação')).toEqual({
      ok: true,
      value: {
        title: 'Nicho: saúde, beleza , alimentação', kind: 'choice',
        options: ['saúde', 'beleza', 'alimentação'], instructions: 'Nicho',
      },
    });
  });
  it('accepts options without spaces and collapses repeated spaces', () => {
    const r = parseColumnTitle('Nicho:saúde,beleza');
    expect(r.ok && r.value.options).toEqual(['saúde', 'beleza']);
    const s = parseColumnTitle('Tem   site??');
    expect(s.ok && s.value).toMatchObject({ kind: 'noul', title: 'Tem site??' });
  });
  it('a question wins over a colon', () => {
    const r = parseColumnTitle('Obs: tem site?');
    expect(r.ok && r.value.kind).toBe('noul');
  });
  it('any other title is a score column with fixed levels', () => {
    expect(parseColumnTitle('Parece ter dinheiro')).toEqual({
      ok: true,
      value: { title: 'Parece ter dinheiro', kind: 'score', options: ['baixo', 'médio', 'alto'], instructions: 'Parece ter dinheiro' },
    });
  });
  it('refuses empty, non-string and too-long titles', () => {
    expect(parseColumnTitle('   ')).toEqual({ ok: false, error: 'Escreva o título da coluna' });
    expect(parseColumnTitle(undefined)).toEqual({ ok: false, error: 'Escreva o título da coluna' });
    expect(parseColumnTitle('a'.repeat(121))).toEqual({ ok: false, error: 'Título com no máximo 120 caracteres' });
  });
  it('refuses choice titles with a bad option list', () => {
    expect(parseColumnTitle(': a, b')).toEqual({ ok: false, error: 'Escreva o tema antes dos dois-pontos (ex.: Nicho: saúde, beleza)' });
    expect(parseColumnTitle('Nicho: saúde')).toEqual({ ok: false, error: 'Use pelo menos 2 opções separadas por vírgula' });
    expect(parseColumnTitle('N: a, b, c, d, e, f, g, h, i')).toEqual({ ok: false, error: 'No máximo 8 opções' });
    expect(parseColumnTitle('Nicho: saúde, Saude')).toEqual({ ok: false, error: 'Opção repetida: Saude' });
    expect(parseColumnTitle(`Nicho: a, ${'b'.repeat(41)}`)).toEqual({ ok: false, error: 'Cada opção com no máximo 40 caracteres' });
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/prospecting/columns.test.ts`
Expected: FAIL com "Cannot find module './columns'".

- [x] **Step 3: Implementar**

```ts
import type { ColumnKind } from '@/types';

export const SCORE_LEVELS = ['baixo', 'médio', 'alto'] as const;
export const NOUL_VALUES = ['sim', 'não'] as const;
export const MAX_TITLE = 120;
export const MAX_COLUMNS = 10;
const MAX_OPTIONS = 8;
const MAX_OPTION_CHARS = 40;

export interface ParsedColumn {
  title: string;
  kind: ColumnKind;
  options: string[];
  instructions: string;
}

export type ParseResult = { ok: true; value: ParsedColumn } | { ok: false; error: string };

export function normalizeLabel(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

// The title is the only thing João types: its shape decides the column type.
export function parseColumnTitle(input: unknown): ParseResult {
  if (typeof input !== 'string') return { ok: false, error: 'Escreva o título da coluna' };
  const title = input.replace(/\s+/g, ' ').trim();
  if (!title) return { ok: false, error: 'Escreva o título da coluna' };
  if (title.length > MAX_TITLE) return { ok: false, error: `Título com no máximo ${MAX_TITLE} caracteres` };

  if (title.endsWith('?')) {
    return { ok: true, value: { title, kind: 'noul', options: [], instructions: title } };
  }

  const colon = title.indexOf(':');
  if (colon !== -1) {
    const theme = title.slice(0, colon).trim();
    if (!theme) return { ok: false, error: 'Escreva o tema antes dos dois-pontos (ex.: Nicho: saúde, beleza)' };
    const options = title.slice(colon + 1).split(',').map((o) => o.trim()).filter(Boolean);
    if (options.length < 2) return { ok: false, error: 'Use pelo menos 2 opções separadas por vírgula' };
    if (options.length > MAX_OPTIONS) return { ok: false, error: `No máximo ${MAX_OPTIONS} opções` };
    if (options.some((o) => o.length > MAX_OPTION_CHARS)) {
      return { ok: false, error: `Cada opção com no máximo ${MAX_OPTION_CHARS} caracteres` };
    }
    const seen = new Set<string>();
    for (const option of options) {
      const key = normalizeLabel(option);
      if (seen.has(key)) return { ok: false, error: `Opção repetida: ${option}` };
      seen.add(key);
    }
    return { ok: true, value: { title, kind: 'choice', options, instructions: theme } };
  }

  return { ok: true, value: { title, kind: 'score', options: [...SCORE_LEVELS], instructions: title } };
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/prospecting/columns.test.ts`
Expected: PASS (7 testes).

- [x] **Step 5: Commit**

```bash
git add src/lib/prospecting/columns.ts src/lib/prospecting/columns.test.ts
git commit -m "feat(prospecting): título da coluna vira sim/não, categorias ou nota

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Lead → texto, resposta do Laya → célula

**Files:**
- Modify: `src/lib/prospecting/columns.ts`
- Test: `src/lib/prospecting/columns.test.ts`

**Interfaces:**
- Consumes: `ParsedColumn`, `SCORE_LEVELS`, `NOUL_VALUES`, `normalizeLabel` (Task 2); `Lead` de `@/types`.
- Produces:
  - `MAX_STATE_CHARS = 1500`
  - `type LeadStateInput = Pick<Lead, 'name' | 'category' | 'rating' | 'review_count' | 'website' | 'phone' | 'is_mobile'> & { raw?: Record<string, unknown> | null }`
  - `buildLeadState(lead: LeadStateInput): string`
  - `interface LayaQuestion { type: ColumnKind; instructions: string; criteria?: Record<string, string> | string[] }`
  - `toLayaQuestion(c: Pick<ParsedColumn, 'kind' | 'options' | 'instructions'>): LayaQuestion`
  - `interface LayaAnswer { noul?: number; choice?: string; score?: number; probabilities?: Record<string, number>; answer_confidence?: number }`
  - `mapLayaAnswer(kind: ColumnKind, options: string[], answer: LayaAnswer | undefined): { value: string; confidence: number }`
  - `allowedValues(kind: ColumnKind, options: string[]): string[]`
  - `canonicalValue(kind: ColumnKind, options: string[], input: unknown): string | null`

- [x] **Step 1: Escrever os testes (acrescentar ao arquivo)**

Atualize o import no topo:

```ts
import {
  allowedValues, buildLeadState, canonicalValue, mapLayaAnswer, normalizeLabel, parseColumnTitle, toLayaQuestion,
} from './columns';
```

E acrescente:

```ts
const baseLead = {
  name: 'Barbearia Navalha', category: 'Barbearia', rating: 4.8, review_count: 320,
  website: 'https://navalha.com.br', phone: '5513991234567', is_mobile: true,
};

describe('buildLeadState', () => {
  it('writes one fact per line in Portuguese', () => {
    expect(buildLeadState(baseLead)).toBe([
      'Nome: Barbearia Navalha', 'Categoria: Barbearia', 'Nota no Google: 4.8 (320 avaliações)',
      'Tem site', 'Tem celular',
    ].join('\n'));
  });
  it('adds place, extra categories, description and enabled "Sobre" items from raw', () => {
    const text = buildLeadState({
      ...baseLead,
      raw: {
        categories: ['Barbearia', 'Salão de beleza'],
        complete_address: { borough: 'Gonzaga', city: 'Santos' },
        description: 'Cortes clássicos e barba.',
        about: [
          { name: 'Serviços', options: [{ name: 'Aceita cartão', enabled: true }, { name: 'Wi-Fi', enabled: false }] },
          { name: 'Acessibilidade', options: [{ name: 'Entrada acessível', enabled: true }] },
        ],
      },
    });
    expect(text).toContain('Outras categorias: Salão de beleza');
    expect(text).toContain('Local: Gonzaga, Santos');
    expect(text).toContain('Descrição: Cortes clássicos e barba.');
    expect(text).toContain('Sobre: Aceita cartão, Entrada acessível');
    expect(text).not.toContain('Wi-Fi');
  });
  it('keeps an almost empty lead short and clean', () => {
    const text = buildLeadState({
      name: 'Loja X', category: null, rating: null, review_count: null, website: null, phone: null, is_mobile: false, raw: null,
    });
    expect(text).toBe('Nome: Loja X\nSem site');
    expect(text).not.toMatch(/undefined|null/);
  });
  it('says "Só telefone fixo" for landlines and caps the text at 1500 characters', () => {
    expect(buildLeadState({ ...baseLead, is_mobile: false })).toContain('Só telefone fixo');
    expect(buildLeadState({ ...baseLead, raw: { description: 'x'.repeat(3000) } }).length).toBe(1500);
  });
});

describe('toLayaQuestion', () => {
  it('builds the question each Laya type expects', () => {
    expect(toLayaQuestion({ kind: 'noul', options: [], instructions: 'Tem site?' }))
      .toEqual({ type: 'noul', instructions: 'Tem site?' });
    expect(toLayaQuestion({ kind: 'choice', options: ['saúde', 'beleza'], instructions: 'Nicho' }))
      .toEqual({ type: 'choice', instructions: 'Nicho', criteria: { saúde: 'saúde', beleza: 'beleza' } });
    expect(toLayaQuestion({ kind: 'score', options: ['baixo', 'médio', 'alto'], instructions: 'Dinheiro' }))
      .toEqual({ type: 'score', instructions: 'Dinheiro', criteria: ['baixo', 'médio', 'alto'] });
  });
});

describe('mapLayaAnswer', () => {
  it('noul: sim at 0.5 or more, confidence of the chosen side', () => {
    expect(mapLayaAnswer('noul', [], { noul: 0.88 })).toEqual({ value: 'sim', confidence: 0.88 });
    expect(mapLayaAnswer('noul', [], { noul: 0.2 })).toEqual({ value: 'não', confidence: 0.8 });
    expect(mapLayaAnswer('noul', [], { noul: 0.5 })).toEqual({ value: 'sim', confidence: 0.5 });
  });
  it('choice: the chosen option and its probability', () => {
    expect(mapLayaAnswer('choice', ['saúde', 'beleza'], {
      choice: 'beleza', probabilities: { saúde: 0.3, beleza: 0.7 }, answer_confidence: 0.7,
    })).toEqual({ value: 'beleza', confidence: 0.7 });
  });
  it('choice: an option outside the list is an error', () => {
    expect(() => mapLayaAnswer('choice', ['saúde'], { choice: 'esporte' }))
      .toThrow('Laya respondeu uma opção fora da lista: esporte');
  });
  it('score: the most probable level, not the rounded expected index', () => {
    expect(mapLayaAnswer('score', ['baixo', 'médio', 'alto'], {
      score: 1.345, probabilities: { 0: 0.1043, 1: 0.4464, 2: 0.4493 },
    })).toEqual({ value: 'alto', confidence: 0.449 });
  });
  it('missing answer or missing fields are errors', () => {
    expect(() => mapLayaAnswer('noul', [], undefined)).toThrow('Resposta do Laya sem a coluna');
    expect(() => mapLayaAnswer('noul', [], {})).toThrow('Resposta do Laya sem probabilidade de sim');
    expect(() => mapLayaAnswer('score', ['baixo'], {})).toThrow('Resposta do Laya sem probabilidades da nota');
  });
});

describe('allowedValues / canonicalValue', () => {
  it('lists valid values per kind', () => {
    expect(allowedValues('noul', [])).toEqual(['sim', 'não']);
    expect(allowedValues('score', [])).toEqual(['baixo', 'médio', 'alto']);
    expect(allowedValues('choice', ['a', 'b'])).toEqual(['a', 'b']);
  });
  it('maps any case/accent spelling to the canonical value, or null', () => {
    expect(canonicalValue('noul', [], 'NAO')).toBe('não');
    expect(canonicalValue('choice', ['saúde', 'beleza'], ' Beleza ')).toBe('beleza');
    expect(canonicalValue('score', [], 'medio')).toBe('médio');
    expect(canonicalValue('choice', ['saúde'], 'esporte')).toBeNull();
    expect(canonicalValue('noul', [], 42)).toBeNull();
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `npx vitest run src/lib/prospecting/columns.test.ts`
Expected: FAIL com "buildLeadState is not a function" (e as outras novas).

- [x] **Step 3: Implementar (acrescentar a `columns.ts`)**

Troque o import do topo por:

```ts
import type { ColumnKind, Lead } from '@/types';
```

E acrescente no fim:

```ts
export const MAX_STATE_CHARS = 1500;

export type LeadStateInput = Pick<Lead, 'name' | 'category' | 'rating' | 'review_count' | 'website' | 'phone' | 'is_mobile'> & {
  raw?: Record<string, unknown> | null;
};

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function enabledAboutItems(about: unknown): string[] {
  if (!Array.isArray(about)) return [];
  return about.flatMap((section) => {
    const options = (section as { options?: unknown })?.options;
    if (!Array.isArray(options)) return [];
    return options.flatMap((o) => {
      const item = o as { name?: unknown; enabled?: unknown };
      return item?.enabled === true && text(item.name) ? [text(item.name) as string] : [];
    });
  });
}

// What Laya reads about one lead: short, one fact per line, nothing empty.
export function buildLeadState(lead: LeadStateInput): string {
  const raw = lead.raw ?? {};
  const lines = [`Nome: ${lead.name}`];
  if (lead.category) lines.push(`Categoria: ${lead.category}`);
  const extra = Array.isArray(raw.categories)
    ? raw.categories.filter((c): c is string => typeof c === 'string' && c !== lead.category)
    : [];
  if (extra.length > 0) lines.push(`Outras categorias: ${extra.join(', ')}`);
  const address = (raw.complete_address ?? {}) as Record<string, unknown>;
  const place = [text(address.borough), text(address.city)].filter(Boolean).join(', ');
  if (place) lines.push(`Local: ${place}`);
  if (lead.rating != null) lines.push(`Nota no Google: ${lead.rating} (${lead.review_count ?? 0} avaliações)`);
  lines.push(lead.website ? 'Tem site' : 'Sem site');
  if (lead.phone) lines.push(lead.is_mobile ? 'Tem celular' : 'Só telefone fixo');
  const description = text(raw.description);
  if (description) lines.push(`Descrição: ${description}`);
  const about = enabledAboutItems(raw.about);
  if (about.length > 0) lines.push(`Sobre: ${about.join(', ')}`);
  return lines.join('\n').slice(0, MAX_STATE_CHARS);
}

export interface LayaQuestion {
  type: ColumnKind;
  instructions: string;
  criteria?: Record<string, string> | string[];
}

export function toLayaQuestion(c: Pick<ParsedColumn, 'kind' | 'options' | 'instructions'>): LayaQuestion {
  if (c.kind === 'noul') return { type: 'noul', instructions: c.instructions };
  if (c.kind === 'choice') {
    return { type: 'choice', instructions: c.instructions, criteria: Object.fromEntries(c.options.map((o) => [o, o])) };
  }
  return { type: 'score', instructions: c.instructions, criteria: [...c.options] };
}

export interface LayaAnswer {
  noul?: number;
  choice?: string;
  score?: number;
  probabilities?: Record<string, number>;
  answer_confidence?: number;
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function mapLayaAnswer(
  kind: ColumnKind, options: string[], answer: LayaAnswer | undefined,
): { value: string; confidence: number } {
  if (!answer) throw new Error('Resposta do Laya sem a coluna');
  if (kind === 'noul') {
    if (typeof answer.noul !== 'number') throw new Error('Resposta do Laya sem probabilidade de sim');
    const yes = answer.noul >= 0.5;
    return { value: yes ? 'sim' : 'não', confidence: round3(yes ? answer.noul : 1 - answer.noul) };
  }
  const probabilities = answer.probabilities ?? {};
  if (kind === 'choice') {
    const value = options.find((o) => o === answer.choice);
    if (!value) throw new Error(`Laya respondeu uma opção fora da lista: ${String(answer.choice)}`);
    return { value, confidence: round3(probabilities[value] ?? answer.answer_confidence ?? 0) };
  }
  // score: `score` is the expected index (a float); use the most probable level instead.
  let best = -1;
  let bestP = -1;
  for (const [key, p] of Object.entries(probabilities)) {
    const i = Number(key);
    if (Number.isInteger(i) && i >= 0 && i < options.length && p > bestP) {
      best = i;
      bestP = p;
    }
  }
  if (best < 0) throw new Error('Resposta do Laya sem probabilidades da nota');
  return { value: options[best], confidence: round3(bestP) };
}

export function allowedValues(kind: ColumnKind, options: string[]): string[] {
  if (kind === 'noul') return [...NOUL_VALUES];
  if (kind === 'score') return [...SCORE_LEVELS];
  return options;
}

export function canonicalValue(kind: ColumnKind, options: string[], input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const key = normalizeLabel(input);
  return allowedValues(kind, options).find((v) => normalizeLabel(v) === key) ?? null;
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `npx vitest run src/lib/prospecting/columns.test.ts && npx tsc --noEmit`
Expected: PASS; sem erros de tipo.

- [x] **Step 5: Commit**

```bash
git add src/lib/prospecting/columns.ts src/lib/prospecting/columns.test.ts
git commit -m "feat(prospecting): texto do lead para o Laya e conversão das respostas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Cliente HTTP do Laya

**Files:**
- Create: `worker/laya-client.ts`
- Test: `worker/laya-client.test.ts`

**Interfaces:**
- Consumes: `LayaQuestion`, `LayaAnswer` (Task 3).
- Produces:
  - `LAYA_MODEL = 'multilingual'`
  - `interface LayaClientDeps { fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; maxAttempts?: number }`
  - `layaBatch(baseUrl: string, states: string[], question: LayaQuestion, deps?: LayaClientDeps): Promise<LayaAnswer[]>` — uma resposta por estado, na mesma ordem.

- [x] **Step 1: Escrever os testes**

```ts
import { describe, expect, it, vi } from 'vitest';
import { layaBatch } from './laya-client';

const question = { type: 'noul' as const, instructions: 'Tem site?' };
const ok = (answers: unknown[]) =>
  new Response(JSON.stringify({ results: answers.map((a) => ({ answers: { col: a } })) }), { status: 200 });

describe('layaBatch', () => {
  it('posts states and the question to /v1/systemone/batch and returns answers in order', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([{ noul: 0.9 }, { noul: 0.1 }]));
    const answers = await layaBatch('http://127.0.0.1:8765/', ['a', 'b'], question, { fetchImpl });
    expect(answers).toEqual([{ noul: 0.9 }, { noul: 0.1 }]);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8765/v1/systemone/batch');
    expect(JSON.parse(init.body)).toEqual({ states: ['a', 'b'], questions: { col: question }, model: 'multilingual' });
  });
  it('says Laya is off when the connection is refused', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('fetch failed'));
    await expect(layaBatch('http://x', ['a'], question, { fetchImpl })).rejects.toThrow('Laya desligado: rode npm run laya');
  });
  it('waits Retry-After seconds on 503 and tries again', async () => {
    const busy = new Response('busy', { status: 503, headers: { 'Retry-After': '2' } });
    const fetchImpl = vi.fn().mockResolvedValueOnce(busy).mockResolvedValueOnce(ok([{ noul: 0.7 }]));
    const sleep = vi.fn().mockResolvedValue(undefined);
    expect(await layaBatch('http://x', ['a'], question, { fetchImpl, sleep })).toEqual([{ noul: 0.7 }]);
    expect(sleep).toHaveBeenCalledWith(2000);
  });
  it('gives up after 3 busy answers', async () => {
    const fetchImpl = vi.fn().mockImplementation(async () => new Response('busy', { status: 503 }));
    const sleep = vi.fn().mockResolvedValue(undefined);
    await expect(layaBatch('http://x', ['a'], question, { fetchImpl, sleep }))
      .rejects.toThrow('Laya ocupado: tente de novo em instantes');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
  it('reports other HTTP errors with the status', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('too many states', { status: 413 }));
    await expect(layaBatch('http://x', ['a'], question, { fetchImpl })).rejects.toThrow('Laya respondeu 413: too many states');
  });
  it('refuses a reply with fewer answers than states', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(ok([{ noul: 0.9 }]));
    await expect(layaBatch('http://x', ['a', 'b'], question, { fetchImpl }))
      .rejects.toThrow('Laya devolveu 1 respostas para 2 linhas');
  });
  it('refuses a result without the column', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ results: [{ answers: {} }] })));
    await expect(layaBatch('http://x', ['a'], question, { fetchImpl })).rejects.toThrow('Resposta do Laya sem a coluna');
  });
});
```

- [x] **Step 2: Rodar e ver falhar**

Run: `npx vitest run worker/laya-client.test.ts`
Expected: FAIL com "Cannot find module './laya-client'".

- [x] **Step 3: Implementar**

```ts
import type { LayaAnswer, LayaQuestion } from '@/lib/prospecting/columns';

export const LAYA_MODEL = 'multilingual';
const QUESTION_KEY = 'col';

export interface LayaClientDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

// One call to laya-serve for a batch of lead texts and a single question.
export async function layaBatch(
  baseUrl: string, states: string[], question: LayaQuestion, deps: LayaClientDeps = {},
): Promise<LayaAnswer[]> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxAttempts = deps.maxAttempts ?? 3;
  const url = `${baseUrl.replace(/\/+$/, '')}/v1/systemone/batch`;
  const body = JSON.stringify({ states, questions: { [QUESTION_KEY]: question }, model: LAYA_MODEL });

  for (let attempt = 1; ; attempt++) {
    let res: Response;
    try {
      res = await fetchImpl(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    } catch {
      throw new Error('Laya desligado: rode npm run laya');
    }
    if (res.status === 503) {
      if (attempt >= maxAttempts) throw new Error('Laya ocupado: tente de novo em instantes');
      const seconds = Number(res.headers.get('Retry-After'));
      await sleep((Number.isFinite(seconds) && seconds > 0 ? seconds : 1) * 1000);
      continue;
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Laya respondeu ${res.status}: ${detail.slice(0, 300)}`);
    }
    const json = (await res.json()) as { results?: { answers?: Record<string, LayaAnswer> }[] };
    const results = json.results ?? [];
    if (results.length !== states.length) {
      throw new Error(`Laya devolveu ${results.length} respostas para ${states.length} linhas`);
    }
    return results.map((r) => {
      const answer = r.answers?.[QUESTION_KEY];
      if (!answer) throw new Error('Resposta do Laya sem a coluna');
      return answer;
    });
  }
}
```

- [x] **Step 4: Rodar e ver passar**

Run: `npx vitest run worker/laya-client.test.ts`
Expected: PASS (7 testes).

- [x] **Step 5: Commit**

```bash
git add worker/laya-client.ts worker/laya-client.test.ts
git commit -m "feat(worker): cliente do laya-serve com retry quando está ocupado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Job de preenchimento (`runColumnJob`)

**Files:**
- Create: `worker/columns.ts`
- Test: `worker/columns.test.ts`
- Modify: `worker/queue.ts:3` (tipo `JobTable`)

**Interfaces:**
- Consumes: `parseColumnTitle`, `buildLeadState`, `toLayaQuestion`, `mapLayaAnswer`, `LayaQuestion`, `LayaAnswer` (Tasks 2–3); `LAYA_MODEL` (Task 4); `failJob`, `finishJob` de `worker/queue.ts`; `Lead`, `LeadColumn` de `@/types`.
- Produces:
  - `FILL_LIMIT = 500`, `BATCH_SIZE = 32`
  - `type LayaFn = (states: string[], question: LayaQuestion) => Promise<LayaAnswer[]>`
  - `runColumnJob(db: SupabaseClient, column: LeadColumn, deps: { laya: LayaFn; now?: () => number }): Promise<void>`
  - `requeueColumnsForAccount(db: SupabaseClient, accountId: string): Promise<void>`
  - `JobTable` passa a incluir `'lead_columns'`.

- [x] **Step 1: Estender o tipo da fila**

Em `worker/queue.ts`, troque a linha 3 por:

```ts
export type JobTable = 'lead_searches' | 'marketing_videos' | 'lead_columns';
```

- [x] **Step 2: Escrever os testes**

```ts
import { describe, expect, it, vi } from 'vitest';
import type { LeadColumn } from '@/types';
import { BATCH_SIZE, requeueColumnsForAccount, runColumnJob } from './columns';

type Row = Record<string, unknown>;

const column = {
  id: 'col-1', account_id: 'acc-1', title: 'Tem site?', kind: 'noul', options: [], status: 'running',
} as unknown as LeadColumn;

const lead = (i: number): Row => ({
  id: `l${i}`, account_id: 'acc-1', name: `Negócio ${i}`, category: 'Barbearia',
  rating: 4.5, review_count: 10, website: null, phone: null, is_mobile: false,
});

function fakeDb(opts: {
  leads: Row[];
  values?: Row[];
  upsertError?: (call: number) => { code?: string; message: string } | null;
}) {
  const calls = { upserts: [] as Row[][], updates: [] as Row[], filters: [] as [string, string, unknown][] };
  let upsertCall = 0;
  const db = {
    from(table: string) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const query: any = {
        select: () => query,
        order: () => query,
        eq: (col: string, v: unknown) => { calls.filters.push([table, col, v]); return query; },
        limit: async () => ({ data: opts.leads, error: null }),
        then: (resolve: (r: unknown) => void) => resolve({ data: opts.values ?? [], error: null }),
        upsert: async (rows: Row[]) => {
          calls.upserts.push(rows);
          return { error: opts.upsertError?.(upsertCall++) ?? null };
        },
        update: (patch: Row) => {
          calls.updates.push({ table, ...patch });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const chain: any = { eq: () => chain, then: (r: (v: unknown) => void) => r({ error: null }) };
          return chain;
        },
      };
      return query;
    },
  };
  return { db: db as never, calls };
}

const yes = () => vi.fn(async (states: string[]) => states.map(() => ({ noul: 0.9 })));

describe('runColumnJob', () => {
  it('fills only leads without a value or correction, in batches of 32, and finishes with the count', async () => {
    const leads = Array.from({ length: 40 }, (_, i) => lead(i));
    const { db, calls } = fakeDb({
      leads,
      values: [
        { lead_id: 'l0', value: 'sim', corrected_value: null },
        { lead_id: 'l1', value: null, corrected_value: 'não' },
      ],
    });
    const laya = yes();
    await runColumnJob(db, column, { laya, now: () => 1000 });

    expect(laya.mock.calls.map(([states]) => states.length)).toEqual([BATCH_SIZE, 6]);
    const written = calls.upserts.flat().map((r) => r.lead_id);
    expect(written).toHaveLength(38);
    expect(written).not.toContain('l0');
    expect(written).not.toContain('l1');
    expect(calls.upserts[0][0]).toMatchObject({ column_id: 'col-1', account_id: 'acc-1', value: 'sim', confidence: 0.9 });
    expect(calls.updates.at(-1)).toMatchObject({ table: 'lead_columns', status: 'done', filled_count: 40, model: 'multilingual' });
  });

  it('sends the lead text and the question derived from the title, only for the column account', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)] });
    const laya = yes();
    await runColumnJob(db, column, { laya });
    const [states, question] = laya.mock.calls[0];
    expect(states[0]).toContain('Nome: Negócio 0');
    expect(question).toEqual({ type: 'noul', instructions: 'Tem site?' });
    expect(calls.filters).toContainEqual(['leads', 'account_id', 'acc-1']);
    expect(calls.filters).toContainEqual(['lead_column_values', 'column_id', 'col-1']);
  });

  it('finishes without calling Laya when every lead is already filled', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)], values: [{ lead_id: 'l0', value: 'não', corrected_value: null }] });
    const laya = yes();
    await runColumnJob(db, column, { laya });
    expect(laya).not.toHaveBeenCalled();
    expect(calls.updates.at(-1)).toMatchObject({ status: 'done', filled_count: 1 });
  });

  it('fails with the Laya message when Laya is off', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)] });
    const laya = vi.fn().mockRejectedValue(new Error('Laya desligado: rode npm run laya'));
    await runColumnJob(db, column, { laya });
    expect(calls.upserts).toHaveLength(0);
    expect(calls.updates.at(-1)).toMatchObject({ status: 'failed', error: 'Laya desligado: rode npm run laya' });
  });

  it('keeps batches already saved when a later batch fails', async () => {
    const { db, calls } = fakeDb({ leads: Array.from({ length: 40 }, (_, i) => lead(i)) });
    const laya = vi.fn()
      .mockImplementationOnce(async (s: string[]) => s.map(() => ({ noul: 0.9 })))
      .mockRejectedValueOnce(new Error('Laya ocupado: tente de novo em instantes'));
    await runColumnJob(db, column, { laya });
    expect(calls.upserts).toHaveLength(1);
    expect(calls.updates.at(-1)).toMatchObject({ status: 'failed', error: 'Laya ocupado: tente de novo em instantes' });
  });

  it('fails when Laya answers an option outside the list', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)] });
    const choiceColumn = { ...column, title: 'Nicho: saúde, beleza', kind: 'choice', options: ['saúde', 'beleza'] } as LeadColumn;
    await runColumnJob(db, choiceColumn, { laya: vi.fn().mockResolvedValue([{ choice: 'esporte' }]) });
    expect(calls.updates.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('fora da lista') });
  });

  it('refuses a title written around the API without calling Laya', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)] });
    const laya = yes();
    await runColumnJob(db, { ...column, title: '' }, { laya });
    expect(laya).not.toHaveBeenCalled();
    expect(calls.updates.at(-1)).toMatchObject({ status: 'failed', error: 'Escreva o título da coluna' });
  });

  it('stops quietly when the column was deleted while filling', async () => {
    const { db, calls } = fakeDb({ leads: [lead(0)], upsertError: () => ({ code: '23503', message: 'fk' }) });
    await runColumnJob(db, column, { laya: yes() });
    expect(calls.updates.filter((u) => u.status === 'failed' || u.status === 'done')).toHaveLength(0);
  });
});

describe('requeueColumnsForAccount', () => {
  it('puts the account done columns back in the queue', async () => {
    const { db, calls } = fakeDb({ leads: [] });
    await requeueColumnsForAccount(db, 'acc-1');
    expect(calls.updates[0]).toMatchObject({ table: 'lead_columns', status: 'pending', error: null });
  });
});
```

- [x] **Step 3: Rodar e ver falhar**

Run: `npx vitest run worker/columns.test.ts`
Expected: FAIL com "Cannot find module './columns'".

- [x] **Step 4: Implementar**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  buildLeadState, mapLayaAnswer, parseColumnTitle, toLayaQuestion,
  type LayaAnswer, type LayaQuestion,
} from '@/lib/prospecting/columns';
import type { Lead, LeadColumn } from '@/types';
import { LAYA_MODEL } from './laya-client';
import { failJob, finishJob } from './queue';

export const FILL_LIMIT = 500;
export const BATCH_SIZE = 32;
const FK_VIOLATION = '23503';

export type LayaFn = (states: string[], question: LayaQuestion) => Promise<LayaAnswer[]>;

export async function runColumnJob(
  db: SupabaseClient, column: LeadColumn, deps: { laya: LayaFn; now?: () => number },
): Promise<void> {
  const now = deps.now ?? Date.now;
  const started = now();
  // RLS lets agents write rows directly: the title, not the stored kind/options, is the truth.
  const parsed = parseColumnTitle(column.title);
  if (!parsed.ok) {
    await failJob(db, 'lead_columns', column.id, parsed.error);
    return;
  }
  const { kind, options } = parsed.value;

  try {
    const { data: leads, error: leadsError } = await db
      .from('leads').select('*').eq('account_id', column.account_id)
      .order('created_at', { ascending: false }).limit(FILL_LIMIT);
    if (leadsError) throw new Error(`Falha ao ler leads: ${leadsError.message}`);
    const { data: existing, error: valuesError } = await db
      .from('lead_column_values').select('lead_id, value, corrected_value').eq('column_id', column.id);
    if (valuesError) throw new Error(`Falha ao ler valores: ${valuesError.message}`);

    const rows = (leads ?? []) as Lead[];
    const filled = new Set(
      (existing ?? [])
        .filter((v) => v.value !== null || v.corrected_value !== null)
        .map((v) => v.lead_id as string),
    );
    const missing = rows.filter((l) => !filled.has(l.id));
    const question = toLayaQuestion(parsed.value);

    let written = 0;
    for (let i = 0; i < missing.length; i += BATCH_SIZE) {
      const chunk = missing.slice(i, i + BATCH_SIZE);
      const answers = await deps.laya(chunk.map(buildLeadState), question);
      const updatedAt = new Date(now()).toISOString();
      const batch = chunk.map((lead, j) => ({
        column_id: column.id,
        lead_id: lead.id,
        account_id: column.account_id,
        ...mapLayaAnswer(kind, options, answers[j]),
        updated_at: updatedAt,
      }));
      const { error } = await db.from('lead_column_values').upsert(batch, { onConflict: 'column_id,lead_id' });
      if (error) {
        // Column (or lead) deleted while we were filling: nothing left to report on.
        if (error.code === FK_VIOLATION) return;
        throw new Error(`Falha ao salvar valores: ${error.message}`);
      }
      written += batch.length;
    }

    await finishJob(db, 'lead_columns', column.id, {
      filled_count: rows.length - missing.length + written,
      duration_ms: now() - started,
      model: LAYA_MODEL,
    });
  } catch (err) {
    await failJob(db, 'lead_columns', column.id, err instanceof Error ? err.message : String(err));
  }
}

// After a search adds leads, done columns go back to the queue; runColumnJob
// then fills only the new leads.
export async function requeueColumnsForAccount(db: SupabaseClient, accountId: string): Promise<void> {
  await db.from('lead_columns')
    .update({ status: 'pending', error: null, started_at: null })
    .eq('account_id', accountId)
    .eq('status', 'done');
}
```

- [x] **Step 5: Rodar e ver passar**

Run: `npx vitest run worker && npx tsc --noEmit`
Expected: PASS em todos os testes de `worker/`; sem erros de tipo.

- [x] **Step 6: Commit**

```bash
git add worker/columns.ts worker/columns.test.ts worker/queue.ts
git commit -m "feat(worker): job que preenche colunas da Planilha Preditiva com o Laya

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Laya no Mac e worker ligado às colunas

**Files:**
- Create: `worker/laya/requirements.txt`
- Modify: `worker/index.ts`, `package.json` (bloco `scripts`), `.gitignore`, `.env.local.example`, `docs/worker.md`

**Interfaces:**
- Consumes: `runColumnJob`, `requeueColumnsForAccount` (Task 5); `layaBatch` (Task 4); `claimNext`, `requeueOrphaned` de `worker/queue.ts`.
- Produces: comando `npm run laya`; worker que processa `lead_columns` entre buscas e vídeos quando `LAYA_URL` existe.

- [x] **Step 1: Ambiente Python do Laya**

`worker/laya/requirements.txt`:

```
laya[serve]==0.3.22
```

Acrescente ao `.gitignore`:

```
# Laya (Planilha Preditiva) — ambiente Python local
worker/laya/.venv/
```

Crie o ambiente (precisa de `uv`: `brew install uv`):

```bash
uv venv --python 3.12 worker/laya/.venv
uv pip install --python worker/laya/.venv/bin/python -r worker/laya/requirements.txt
worker/laya/.venv/bin/python -c "import laya; print(laya.__version__)"
```

Expected: `0.3.22`.

- [x] **Step 2: Script `npm run laya`**

Em `package.json`, dentro de `"scripts"`, logo depois da linha do `"worker"`:

```json
"laya": "LAYA_HOST=127.0.0.1 LAYA_PORT=8765 LAYA_MODELS=multilingual LAYA_PRELOAD=1 worker/laya/.venv/bin/laya-serve",
```

Verifique (em outro terminal, ou em background):

```bash
npm run laya
curl -s http://127.0.0.1:8765/health
curl -s -X POST http://127.0.0.1:8765/v1/systemone/batch -H 'Content-Type: application/json' \
  -d '{"states":["Nome: Barbearia Navalha\nTem site"],"questions":{"col":{"type":"noul","instructions":"Tem site?"}},"model":"multilingual"}'
```

Expected: `/health` responde JSON; o batch devolve `{"results":[{"answers":{"col":{"type":"noul","noul":...}}}], ...}`. Confirme que `curl http://<IP da rede do Mac>:8765/health` **não** responde (servidor preso em 127.0.0.1).

- [x] **Step 3: Ligar as colunas no worker**

Substitua `worker/index.ts` inteiro por:

```ts
import { createClient } from '@supabase/supabase-js';
import type { LeadColumn, LeadSearch, MarketingVideo } from '@/types';
import { internalAccountIds } from '@/lib/internal-accounts';
import { claimNext, requeueOrphaned } from './queue';
import { runProspectingJob } from './prospecting';
import { runVideoJob } from './video';
import { requeueColumnsForAccount, runColumnJob } from './columns';
import { layaBatch } from './laya-client';

const POLL_MS = 5000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} no .env.local`);
  return v;
}

requireEnv('ANTHROPIC_API_KEY');
const accountIds = internalAccountIds();
if (accountIds.length === 0) {
  throw new Error('Falta NEXT_PUBLIC_INTERNAL_ACCOUNT_IDS no .env.local (contas que o worker atende)');
}
const layaUrl = process.env.LAYA_URL;
if (!layaUrl) {
  console.warn('LAYA_URL não definida: colunas da Planilha Preditiva ficam na fila (veja docs/worker.md)');
}

const db = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

let stopping = false;
process.on('SIGINT', () => { stopping = true; console.log('\nParando depois do job atual…'); });

// Order: searches, then columns (fast, João is watching), then videos.
async function tick(): Promise<boolean> {
  const search = await claimNext<LeadSearch>(db, 'lead_searches', accountIds);
  if (search) {
    console.log(`[prospecção] ${search.query} em ${search.location}`);
    await runProspectingJob(db, search);
    await requeueColumnsForAccount(db, search.account_id);
    return true;
  }
  if (layaUrl) {
    const column = await claimNext<LeadColumn>(db, 'lead_columns', accountIds);
    if (column) {
      console.log(`[planilha] ${column.title}`);
      await runColumnJob(db, column, { laya: (states, question) => layaBatch(layaUrl, states, question) });
      return true;
    }
  }
  const video = await claimNext<MarketingVideo>(db, 'marketing_videos', accountIds);
  if (video) {
    console.log(`[marketing] ${video.prompt.slice(0, 60)}`);
    await runVideoJob(db, video);
    return true;
  }
  return false;
}

async function main() {
  const a = await requeueOrphaned(db, 'lead_searches');
  const b = await requeueOrphaned(db, 'marketing_videos');
  const c = await requeueOrphaned(db, 'lead_columns');
  if (a + b + c > 0) console.log(`Devolvidos à fila: ${a + b + c} job(s) travados`);
  console.log('Worker rodando. Ctrl+C para parar.');
  while (!stopping) {
    try {
      const worked = await tick();
      if (!worked) await new Promise((r) => setTimeout(r, POLL_MS));
    } catch (err) {
      console.error('[worker] erro no ciclo:', err);
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }
}

void main();
```

- [x] **Step 4: Variável e documentação**

Acrescente ao `.env.local.example`:

```
# ------------------------------------------------------------------
# Planilha Preditiva (Laya local) — see docs/worker.md
# ------------------------------------------------------------------
# Where the worker reaches laya-serve. Unset = AI columns stay queued.
# LAYA_URL=http://127.0.0.1:8765
```

Acrescente `LAYA_URL=http://127.0.0.1:8765` ao `.env.local` local (não vai para o git).

Acrescente ao fim de `docs/worker.md`:

```markdown
## Planilha Preditiva (Laya)

As colunas de IA da aba Prospecção são preenchidas pelo Laya, um modelo que roda no Mac.

Uma vez só:

    brew install uv
    uv venv --python 3.12 worker/laya/.venv
    uv pip install --python worker/laya/.venv/bin/python -r worker/laya/requirements.txt

No `.env.local`: `LAYA_URL=http://127.0.0.1:8765`.

Para usar, dois terminais na pasta do CRM:

    npm run laya     # carrega o modelo (~1–2 GB de memória) e fica ouvindo só no próprio Mac
    npm run worker

Sem o `npm run laya`, a coluna falha com "Laya desligado: rode npm run laya"; ligue e clique
em "Tentar de novo". Quando uma busca nova termina, as colunas prontas voltam para a fila e
só os leads novos são preenchidos. Correções feitas à mão nunca são sobrescritas.
```

- [x] **Step 5: Verificar o worker de ponta a ponta com o Supabase real**

Com `npm run laya` rodando e sem nenhum lead ainda, rode `npm run worker` por ~15 s e pare com Ctrl+C.
Expected: "Worker rodando. Ctrl+C para parar." sem o aviso de `LAYA_URL` e sem erros.

Rode `npx tsc --noEmit` e `npm run lint`.
Expected: 0 erros (os avisos antigos continuam).

- [x] **Step 6: Commit**

```bash
git add worker/laya/requirements.txt worker/index.ts package.json .gitignore .env.local.example docs/worker.md
git commit -m "feat(worker): npm run laya e fila de colunas da Planilha Preditiva

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Rotas (criar, tentar de novo, excluir, corrigir)

**Files:**
- Create: `src/app/api/prospecting/columns/route.ts`, `src/app/api/prospecting/columns/route.test.ts`
- Create: `src/app/api/prospecting/columns/[id]/route.ts` (DELETE)
- Create: `src/app/api/prospecting/columns/[id]/retry/route.ts`
- Create: `src/app/api/prospecting/columns/[id]/values/[leadId]/route.ts`, `.../[leadId]/route.test.ts`
- Test: `src/app/api/prospecting/columns/[id]/route.test.ts` (DELETE e retry juntos)

**Interfaces:**
- Consumes: `parseColumnTitle`, `MAX_COLUMNS`, `allowedValues`, `canonicalValue` (Tasks 2–3); `requireRole`, `toErrorResponse` de `@/lib/auth/account`; `isInternalAccount` de `@/lib/internal-accounts`.
- Produces (usado pela tela na Task 8):
  - `POST /api/prospecting/columns` `{ title }` → 201 `{ column }` | 400 `{ error }` | 403
  - `POST /api/prospecting/columns/:id/retry` → 200 `{ column }` | 404 | 409
  - `DELETE /api/prospecting/columns/:id` → 200 `{ ok: true }` | 404
  - `PATCH /api/prospecting/columns/:id/values/:leadId` `{ value: string | null }` → 200 `{ value: LeadColumnValue }` | 400 | 404

- [x] **Step 1: Testes de criar**

`src/app/api/prospecting/columns/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), insert: vi.fn(), count: 0 }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { POST } from './route';

function ctx(accountId = 'acc-1') {
  return {
    accountId,
    userId: 'user-1',
    supabase: {
      from: () => ({
        select: () => ({ eq: async () => ({ count: mocks.count, error: null }) }),
        insert: (row: unknown) => {
          mocks.insert(row);
          return { select: () => ({ single: async () => ({ data: { id: 'col-1', ...(row as object) }, error: null }) }) };
        },
      }),
    },
  };
}

const req = (body: unknown) =>
  new Request('http://localhost/api/prospecting/columns', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.count = 0;
  mocks.insert.mockReset();
  mocks.requireRole.mockResolvedValue(ctx());
});

describe('POST /api/prospecting/columns', () => {
  it('parses the title and inserts a pending column', async () => {
    const res = await POST(req({ title: 'Nicho: saúde, beleza' }));
    expect(res.status).toBe(201);
    expect(mocks.requireRole).toHaveBeenCalledWith('agent');
    expect(mocks.insert).toHaveBeenCalledWith({
      account_id: 'acc-1', created_by: 'user-1', title: 'Nicho: saúde, beleza',
      kind: 'choice', options: ['saúde', 'beleza'], instructions: 'Nicho', status: 'pending',
    });
  });
  it('returns 400 with the parser message on an invalid title', async () => {
    const res = await POST(req({ title: 'Nicho: saúde' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Use pelo menos 2 opções separadas por vírgula' });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('refuses an 11th column', async () => {
    mocks.count = 10;
    const res = await POST(req({ title: 'Tem site?' }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Limite de 10 colunas. Exclua uma para criar outra.' });
  });
  it('403s for an account that is not internal', async () => {
    mocks.requireRole.mockResolvedValue(ctx('outsider'));
    const res = await POST(req({ title: 'Tem site?' }));
    expect(res.status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
```

Run: `npx vitest run src/app/api/prospecting/columns/route.test.ts` → FAIL ("Cannot find module './route'").

- [x] **Step 2: Implementar criar**

`src/app/api/prospecting/columns/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';
import { MAX_COLUMNS, parseColumnTitle } from '@/lib/prospecting/columns';

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  if (!isInternalAccount(ctx.accountId)) {
    return NextResponse.json({ error: 'Recurso interno da Concept Digital' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { title?: unknown } | null;
  const parsed = parseColumnTitle(body?.title);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { count } = await ctx.supabase
    .from('lead_columns')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', ctx.accountId);
  if ((count ?? 0) >= MAX_COLUMNS) {
    return NextResponse.json({ error: `Limite de ${MAX_COLUMNS} colunas. Exclua uma para criar outra.` }, { status: 400 });
  }

  const { data, error } = await ctx.supabase
    .from('lead_columns')
    .insert({
      account_id: ctx.accountId,
      created_by: ctx.userId,
      title: parsed.value.title,
      kind: parsed.value.kind,
      options: parsed.value.options,
      instructions: parsed.value.instructions,
      status: 'pending',
    })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ column: data }, { status: 201 });
}
```

Run: `npx vitest run src/app/api/prospecting/columns/route.test.ts` → PASS (4).

- [x] **Step 3: Testes de tentar de novo e excluir**

`src/app/api/prospecting/columns/[id]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), current: null as null | { id: string; status: string }, deleted: [] as unknown[], update: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { DELETE } from './route';
import { POST as RETRY } from './retry/route';

function ctx(accountId = 'acc-1') {
  return {
    accountId,
    userId: 'user-1',
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.current, error: null }) }) }),
        update: (patch: unknown) => {
          mocks.update(patch);
          return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: 'col-1', ...(patch as object) }, error: null }) }) }) };
        },
        delete: () => ({ eq: () => ({ select: async () => ({ data: mocks.deleted, error: null }) }) }),
      }),
    },
  };
}

const params = { params: Promise.resolve({ id: 'col-1' }) };
const req = new Request('http://localhost/api/prospecting/columns/col-1', { method: 'POST' });

beforeEach(() => {
  mocks.update.mockReset();
  mocks.current = null;
  mocks.deleted = [];
  mocks.requireRole.mockResolvedValue(ctx());
});

describe('POST /api/prospecting/columns/:id/retry', () => {
  it('puts a failed column back in the queue', async () => {
    mocks.current = { id: 'col-1', status: 'failed' };
    const res = await RETRY(req, params);
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({ status: 'pending', error: null, started_at: null, finished_at: null });
  });
  it('409s for a column that did not fail', async () => {
    mocks.current = { id: 'col-1', status: 'done' };
    expect((await RETRY(req, params)).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it('404s for an unknown column', async () => {
    expect((await RETRY(req, params)).status).toBe(404);
  });
});

describe('DELETE /api/prospecting/columns/:id', () => {
  it('deletes the column', async () => {
    mocks.deleted = [{ id: 'col-1' }];
    const res = await DELETE(req, params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
  it('404s when nothing was deleted', async () => {
    expect((await DELETE(req, params)).status).toBe(404);
  });
  it('403s for an account that is not internal', async () => {
    mocks.requireRole.mockResolvedValue(ctx('outsider'));
    expect((await DELETE(req, params)).status).toBe(403);
  });
});
```

Run: `npx vitest run "src/app/api/prospecting/columns/[id]/route.test.ts"` → FAIL.

- [x] **Step 4: Implementar tentar de novo e excluir**

`src/app/api/prospecting/columns/[id]/retry/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  if (!isInternalAccount(ctx.accountId)) {
    return NextResponse.json({ error: 'Recurso interno da Concept Digital' }, { status: 403 });
  }
  const { id } = await params;

  const { data: current } = await ctx.supabase
    .from('lead_columns')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Coluna não encontrada' }, { status: 404 });
  if (current.status !== 'failed') {
    return NextResponse.json({ error: 'Só dá pra tentar de novo uma coluna com erro' }, { status: 409 });
  }

  const { data, error } = await ctx.supabase
    .from('lead_columns')
    .update({ status: 'pending', error: null, started_at: null, finished_at: null })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ column: data });
}
```

`src/app/api/prospecting/columns/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  if (!isInternalAccount(ctx.accountId)) {
    return NextResponse.json({ error: 'Recurso interno da Concept Digital' }, { status: 403 });
  }
  const { id } = await params;

  const { data, error } = await ctx.supabase.from('lead_columns').delete().eq('id', id).select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Coluna não encontrada' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
```

Run: `npx vitest run "src/app/api/prospecting/columns/[id]/route.test.ts"` → PASS (6).

- [x] **Step 5: Testes de correção**

`src/app/api/prospecting/columns/[id]/values/[leadId]/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(), upsert: vi.fn(),
  column: null as null | { id: string; kind: string; options: string[] },
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { PATCH } from './route';

function ctx(accountId = 'acc-1') {
  return {
    accountId,
    userId: 'user-1',
    supabase: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.column, error: null }) }) }),
        upsert: (row: unknown, opts: unknown) => {
          mocks.upsert(row, opts);
          return { select: () => ({ single: async () => ({ data: row, error: null }) }) };
        },
      }),
    },
  };
}

const params = { params: Promise.resolve({ id: 'col-1', leadId: 'lead-1' }) };
const req = (body: unknown) =>
  new Request('http://localhost/api/prospecting/columns/col-1/values/lead-1', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.upsert.mockReset();
  mocks.column = { id: 'col-1', kind: 'choice', options: ['saúde', 'beleza'] };
  mocks.requireRole.mockResolvedValue(ctx());
});

describe('PATCH /api/prospecting/columns/:id/values/:leadId', () => {
  it('stores the correction in its canonical spelling', async () => {
    const res = await PATCH(req({ value: 'BELEZA' }), params);
    expect(res.status).toBe(200);
    const [row, opts] = mocks.upsert.mock.calls[0];
    expect(row).toMatchObject({
      column_id: 'col-1', lead_id: 'lead-1', account_id: 'acc-1', corrected_value: 'beleza', corrected_by: 'user-1',
    });
    expect(row.corrected_at).toEqual(expect.any(String));
    expect(opts).toEqual({ onConflict: 'column_id,lead_id' });
  });
  it('accepts "nao" for a yes/no column', async () => {
    mocks.column = { id: 'col-1', kind: 'noul', options: [] };
    await PATCH(req({ value: 'nao' }), params);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ corrected_value: 'não' });
  });
  it('null clears the correction', async () => {
    await PATCH(req({ value: null }), params);
    expect(mocks.upsert.mock.calls[0][0]).toMatchObject({ corrected_value: null, corrected_by: null, corrected_at: null });
  });
  it('refuses a value outside the column options', async () => {
    const res = await PATCH(req({ value: 'esporte' }), params);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Valor inválido. Use: saúde, beleza' });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
  it('404s for an unknown column', async () => {
    mocks.column = null;
    expect((await PATCH(req({ value: 'beleza' }), params)).status).toBe(404);
  });
});
```

Run: `npx vitest run "src/app/api/prospecting/columns/[id]/values"` → FAIL.

- [x] **Step 6: Implementar correção**

`src/app/api/prospecting/columns/[id]/values/[leadId]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { isInternalAccount } from '@/lib/internal-accounts';
import { allowedValues, canonicalValue } from '@/lib/prospecting/columns';
import type { ColumnKind } from '@/types';

export async function PATCH(
  request: Request, { params }: { params: Promise<{ id: string; leadId: string }> },
) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  if (!isInternalAccount(ctx.accountId)) {
    return NextResponse.json({ error: 'Recurso interno da Concept Digital' }, { status: 403 });
  }
  const { id, leadId } = await params;
  const body = (await request.json().catch(() => null)) as { value?: unknown } | null;

  const { data: column } = await ctx.supabase
    .from('lead_columns')
    .select('id, kind, options')
    .eq('id', id)
    .maybeSingle();
  if (!column) return NextResponse.json({ error: 'Coluna não encontrada' }, { status: 404 });
  const kind = column.kind as ColumnKind;
  const options = (column.options ?? []) as string[];

  let corrected: string | null = null;
  if (body?.value !== null) {
    corrected = canonicalValue(kind, options, body?.value);
    if (!corrected) {
      return NextResponse.json({ error: `Valor inválido. Use: ${allowedValues(kind, options).join(', ')}` }, { status: 400 });
    }
  }

  const now = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from('lead_column_values')
    .upsert({
      column_id: id,
      lead_id: leadId,
      account_id: ctx.accountId,
      corrected_value: corrected,
      corrected_by: corrected ? ctx.userId : null,
      corrected_at: corrected ? now : null,
      updated_at: now,
    }, { onConflict: 'column_id,lead_id' })
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ value: data });
}
```

Run: `npx vitest run src/app/api/prospecting/columns` → PASS (15).

- [x] **Step 7: Commit**

```bash
git add src/app/api/prospecting/columns
git commit -m "feat(prospecting): rotas para criar, repetir, excluir e corrigir colunas de IA

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Tela — colunas de IA na tabela da Prospecção

**Files:**
- Modify: `src/lib/prospecting/columns.ts`, `src/lib/prospecting/columns.test.ts` (funções de exibição/ordenação)
- Create: `src/components/prospecting/ai-columns.tsx`
- Modify: `src/app/(dashboard)/prospeccao/page.tsx`

**Interfaces:**
- Consumes: rotas da Task 7; `LeadColumn`, `LeadColumnValue` (Task 1); `allowedValues` (Task 3).
- Produces:
  - `LOW_CONFIDENCE = 0.6`
  - `type CellLike = Pick<LeadColumnValue, 'value' | 'confidence' | 'corrected_value'>`
  - `displayedCell(cell: CellLike | undefined): { value: string; confidence: number; corrected: boolean } | null`
  - `sortScore(kind: ColumnKind, options: string[], cell: CellLike | undefined): number` (maior = mais para cima; célula vazia = -1)
  - Componentes `AiColumnHeader`, `AiCell`, `NewColumnInput`, `TitleHelp`, função `fetchAllColumnValues(supabase)`

- [x] **Step 1: Testes de exibição e ordenação (acrescentar a `columns.test.ts`)**

Acrescente `displayedCell, sortScore` ao import e:

```ts
describe('displayedCell', () => {
  it('prefers the correction, shown as 100%', () => {
    expect(displayedCell({ value: 'sim', confidence: 0.7, corrected_value: 'não' }))
      .toEqual({ value: 'não', confidence: 1, corrected: true });
  });
  it('shows the model value with its confidence, or null when empty', () => {
    expect(displayedCell({ value: 'sim', confidence: 0.7, corrected_value: null }))
      .toEqual({ value: 'sim', confidence: 0.7, corrected: false });
    expect(displayedCell({ value: null, confidence: null, corrected_value: null })).toBeNull();
    expect(displayedCell(undefined)).toBeNull();
  });
});

describe('sortScore', () => {
  const cell = (value: string, confidence: number) => ({ value, confidence, corrected_value: null });
  it('yes/no: most likely "sim" first', () => {
    const scores = [cell('sim', 0.9), cell('não', 0.9), cell('sim', 0.6)].map((c) => sortScore('noul', [], c));
    expect(scores[0]).toBeGreaterThan(scores[2]);
    expect(scores[2]).toBeGreaterThan(scores[1]);
  });
  it('score: higher level first, then confidence', () => {
    const opts = ['baixo', 'médio', 'alto'];
    expect(sortScore('score', opts, cell('alto', 0.4))).toBeGreaterThan(sortScore('score', opts, cell('médio', 0.99)));
  });
  it('choice: list order first; empty cells last', () => {
    const opts = ['saúde', 'beleza'];
    expect(sortScore('choice', opts, cell('saúde', 0.3))).toBeGreaterThan(sortScore('choice', opts, cell('beleza', 0.99)));
    expect(sortScore('choice', opts, undefined)).toBe(-1);
  });
});
```

Run: `npx vitest run src/lib/prospecting/columns.test.ts` → FAIL ("displayedCell is not a function").

- [x] **Step 2: Implementar (acrescentar a `columns.ts`)**

Troque o import do topo por `import type { ColumnKind, Lead, LeadColumnValue } from '@/types';` e acrescente:

```ts
export const LOW_CONFIDENCE = 0.6;

export type CellLike = Pick<LeadColumnValue, 'value' | 'confidence' | 'corrected_value'>;

export function displayedCell(
  cell: CellLike | undefined,
): { value: string; confidence: number; corrected: boolean } | null {
  if (!cell) return null;
  if (cell.corrected_value) return { value: cell.corrected_value, confidence: 1, corrected: true };
  if (cell.value) return { value: cell.value, confidence: Number(cell.confidence ?? 0), corrected: false };
  return null;
}

// Bigger = higher in the table. Levels/options dominate, confidence breaks ties.
export function sortScore(kind: ColumnKind, options: string[], cell: CellLike | undefined): number {
  const shown = displayedCell(cell);
  if (!shown) return -1;
  if (kind === 'noul') return shown.value === 'sim' ? shown.confidence : 1 - shown.confidence;
  const values = allowedValues(kind, options);
  const index = values.indexOf(shown.value);
  const rank = kind === 'score' ? index : values.length - 1 - index;
  return rank * 2 + shown.confidence;
}
```

Run: `npx vitest run src/lib/prospecting/columns.test.ts` → PASS.

- [x] **Step 3: Componentes**

`src/components/prospecting/ai-columns.tsx`:

```tsx
'use client';

import { useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowDownWideNarrow, Loader2, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { LOW_CONFIDENCE, allowedValues, displayedCell } from '@/lib/prospecting/columns';
import type { ColumnKind, LeadColumn, LeadColumnValue } from '@/types';
import { Input } from '@/components/ui/input';

const KIND_LABEL: Record<ColumnKind, string> = { noul: 'sim/não', choice: 'categorias', score: 'nota' };
const PAGE = 1000;

// PostgREST caps a response at 1000 rows; 10 columns × 500 leads needs paging.
export async function fetchAllColumnValues(supabase: SupabaseClient): Promise<LeadColumnValue[]> {
  const out: LeadColumnValue[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase.from('lead_column_values').select('*').range(from, from + PAGE - 1);
    out.push(...((data ?? []) as LeadColumnValue[]));
    if (!data || data.length < PAGE) return out;
  }
}

export function TitleHelp() {
  return (
    <div className="rounded-md border p-3 text-xs">
      <div className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">Como escrever o título</div>
      <ul className="space-y-0.5">
        <li><code>Quer comprar?</code> termina com ? → sim/não</li>
        <li><code>Nicho: saúde, beleza</code> tema e opções → categorias</li>
        <li><code>Parece ter dinheiro</code> outro título → nota (baixo, médio, alto)</li>
      </ul>
    </div>
  );
}

export function NewColumnInput({ disabled, onCreate }: {
  disabled: boolean;
  onCreate: (title: string) => Promise<boolean>;
}) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!title.trim()) return;
        setBusy(true);
        const ok = await onCreate(title);
        setBusy(false);
        if (ok) setTitle('');
      }}
    >
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nova coluna IA…"
        aria-label="Nova coluna IA"
        maxLength={120}
        disabled={disabled || busy}
        className="h-8 min-w-48 text-sm"
      />
    </form>
  );
}

export function AiColumnHeader({ column, sorted, filterValue, canEdit, onSort, onFilter, onRetry, onDelete }: {
  column: LeadColumn;
  sorted: boolean;
  filterValue: string | null;
  canEdit: boolean;
  onSort: () => void;
  onFilter: (value: string | null) => void;
  onRetry: () => void;
  onDelete: () => void;
}) {
  const working = column.status === 'pending' || column.status === 'running';
  const status = column.status === 'failed' ? 'falhou' : column.status === 'done' ? 'pronta' : 'processando…';
  return (
    <div className="min-w-40 space-y-1 py-1">
      <div className="font-medium leading-tight">{column.title}</div>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {KIND_LABEL[column.kind]} · {status}
        {working && <Loader2 className="h-3 w-3 animate-spin" />}
      </div>
      {column.status === 'failed' && (
        <button type="button" title={column.error ?? ''} onClick={onRetry} disabled={!canEdit} className="text-xs underline">
          <RotateCcw className="inline h-3 w-3" /> Tentar de novo
        </button>
      )}
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onSort}
          title="Ordenar: mais prováveis primeiro"
          aria-pressed={sorted}
          className={`rounded p-0.5 ${sorted ? 'bg-muted' : ''}`}
        >
          <ArrowDownWideNarrow className="h-3.5 w-3.5" />
        </button>
        <select
          className="h-6 rounded border bg-background px-1 text-xs"
          value={filterValue ?? ''}
          onChange={(e) => onFilter(e.target.value || null)}
          aria-label={`Filtrar ${column.title}`}
        >
          <option value="">Todos</option>
          {allowedValues(column.kind, column.options).map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        {canEdit && (
          <button type="button" onClick={onDelete} title="Excluir coluna" className="rounded p-0.5">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export function AiCell({ column, cell, disabled, onCorrect }: {
  column: LeadColumn;
  cell: LeadColumnValue | undefined;
  disabled: boolean;
  onCorrect: (value: string) => void;
}) {
  const shown = displayedCell(cell);
  const working = column.status === 'pending' || column.status === 'running';
  if (!shown && working) return <span className="text-xs text-muted-foreground">…</span>;
  const faded = shown && !shown.corrected && shown.confidence < LOW_CONFIDENCE;
  return (
    <div className={`flex items-center gap-1 text-sm ${faded ? 'opacity-50' : ''}`}>
      <select
        className="h-7 rounded border bg-background px-1 text-sm"
        value={shown?.value ?? ''}
        disabled={disabled}
        onChange={(e) => e.target.value && onCorrect(e.target.value)}
        aria-label={`Corrigir ${column.title}`}
      >
        {!shown && <option value="">—</option>}
        {allowedValues(column.kind, column.options).map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      {shown && (shown.corrected
        ? <Pencil className="h-3 w-3" aria-label="corrigido à mão" />
        : <span className="text-xs tabular-nums text-muted-foreground">{Math.round(shown.confidence * 100)}%</span>)}
    </div>
  );
}
```

- [x] **Step 4: Integrar na página**

Em `src/app/(dashboard)/prospeccao/page.tsx`:

1. Imports — troque a linha 11 e acrescente:

```tsx
import type { Lead, LeadColumn, LeadColumnValue, LeadSearch, LeadStatus } from '@/types';
import { displayedCell, sortScore } from '@/lib/prospecting/columns';
import { AiCell, AiColumnHeader, NewColumnInput, TitleHelp, fetchAllColumnValues } from '@/components/prospecting/ai-columns';
```

2. Estado — depois de `const [now, setNow] = useState(() => Date.now());`:

```tsx
  const [columns, setColumns] = useState<LeadColumn[]>([]);
  const [values, setValues] = useState<LeadColumnValue[]>([]);
  const [sortBy, setSortBy] = useState<string | null>(null);
  const [valueFilter, setValueFilter] = useState<{ columnId: string; value: string } | null>(null);
```

3. `fetchData` — substitua o corpo por:

```tsx
    const [s, l, c, v] = await Promise.all([
      supabase.from('lead_searches').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('leads').select('*').order('score', { ascending: false }).limit(500),
      supabase.from('lead_columns').select('*').order('created_at', { ascending: true }),
      fetchAllColumnValues(supabase),
    ]);
    return {
      searches: (s.data ?? []) as LeadSearch[],
      leads: (l.data ?? []) as Lead[],
      columns: (c.data ?? []) as LeadColumn[],
      values: v,
    };
```

4. Nos dois lugares que aplicam o resultado (`load` e o `useEffect` inicial), depois de `setLeads(d.leads);` acrescente:

```tsx
      setColumns(d.columns);
      setValues(d.values);
```

5. Polling — troque a linha `const busy = …` por:

```tsx
  const busy = searches.some((s) => s.status === 'pending' || s.status === 'running')
    || columns.some((c) => c.status === 'pending' || c.status === 'running');
```

6. Handlers — depois de `setStatus`:

```tsx
  async function createColumn(title: string): Promise<boolean> {
    const res = await fetch('/api/prospecting/columns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(json.error ?? 'Não foi possível criar a coluna');
      return false;
    }
    toast.success('Coluna na fila. O Laya preenche com o worker e o npm run laya rodando.');
    load();
    return true;
  }

  async function retryColumn(id: string) {
    const res = await fetch(`/api/prospecting/columns/${id}/retry`, { method: 'POST' });
    if (!res.ok) return toast.error('Não foi possível tentar de novo');
    load();
  }

  async function deleteColumn(column: LeadColumn) {
    if (!window.confirm(`Excluir a coluna "${column.title}"? As correções dela também somem.`)) return;
    const res = await fetch(`/api/prospecting/columns/${column.id}`, { method: 'DELETE' });
    if (!res.ok) return toast.error('Não foi possível excluir a coluna');
    if (sortBy === column.id) setSortBy(null);
    if (valueFilter?.columnId === column.id) setValueFilter(null);
    load();
  }

  async function correct(column: LeadColumn, lead: Lead, value: string) {
    const res = await fetch(`/api/prospecting/columns/${column.id}/values/${lead.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.error ?? 'Não foi possível corrigir');
    const row = json.value as LeadColumnValue;
    setValues((prev) => [
      ...prev.filter((v) => !(v.column_id === row.column_id && v.lead_id === row.lead_id)),
      row,
    ]);
  }
```

7. Filtro e ordenação — substitua o bloco `const visible = leads.filter(…);` por:

```tsx
  const cells = useMemo(
    () => new Map(values.map((v) => [`${v.column_id}:${v.lead_id}`, v])),
    [values],
  );
  const cellOf = (columnId: string, leadId: string) => cells.get(`${columnId}:${leadId}`);

  const filtered = leads.filter((l) =>
    (statusFilter === 'todos' || l.status === statusFilter) &&
    (!text || `${l.name} ${l.address ?? ''} ${l.category ?? ''}`.toLowerCase().includes(text.toLowerCase())) &&
    (!valueFilter || displayedCell(cellOf(valueFilter.columnId, l.id))?.value === valueFilter.value),
  );
  const sortColumn = columns.find((c) => c.id === sortBy);
  const visible = sortColumn
    ? [...filtered].sort((a, b) =>
        sortScore(sortColumn.kind, sortColumn.options, cellOf(sortColumn.id, b.id))
        - sortScore(sortColumn.kind, sortColumn.options, cellOf(sortColumn.id, a.id)))
    : filtered;

  const lastDone = columns
    .filter((c) => c.status === 'done' && c.finished_at)
    .sort((a, b) => ((a.finished_at ?? '') < (b.finished_at ?? '') ? 1 : -1))[0];
```

8. Ajuda e resumo — logo depois do `<div>` do filtro (o que termina com `{visible.length} leads</span>`), antes de `<Table>`:

```tsx
      <div className="flex flex-wrap items-start gap-4">
        <TitleHelp />
        {lastDone && (
          <p className="text-sm text-muted-foreground">
            “{lastDone.title}”: {lastDone.filled_count ?? 0} linhas preenchidas em{' '}
            {((lastDone.duration_ms ?? 0) / 1000).toFixed(1).replace('.', ',')} s
          </p>
        )}
      </div>
```

9. Cabeçalho da tabela — substitua `<TableHead />` (o último, das ações) por:

```tsx
            <TableHead />
            {columns.map((c) => (
              <TableHead key={c.id} className="align-top">
                <AiColumnHeader
                  column={c}
                  sorted={sortBy === c.id}
                  filterValue={valueFilter?.columnId === c.id ? valueFilter.value : null}
                  canEdit={canEdit}
                  onSort={() => setSortBy((cur) => (cur === c.id ? null : c.id))}
                  onFilter={(value) => setValueFilter(value ? { columnId: c.id, value } : null)}
                  onRetry={() => retryColumn(c.id)}
                  onDelete={() => deleteColumn(c)}
                />
              </TableHead>
            ))}
            <TableHead className="align-top">
              <NewColumnInput disabled={!canEdit} onCreate={createColumn} />
            </TableHead>
```

10. Linhas — logo depois da última `</TableCell>` de cada linha (a das ações), antes de `</TableRow>`:

```tsx
              {columns.map((c) => (
                <TableCell key={c.id}>
                  <AiCell
                    column={c}
                    cell={cellOf(c.id, l.id)}
                    disabled={!canEdit}
                    onCorrect={(value) => correct(c, l, value)}
                  />
                </TableCell>
              ))}
              <TableCell />
```

- [x] **Step 5: Tipos, lint e testes**

Run: `npx tsc --noEmit && npx eslint "src/app/(dashboard)/prospeccao" src/components/prospecting src/lib/prospecting && npx vitest run src/lib/prospecting`
Expected: sem erros; testes PASS.

- [x] **Step 6: Ver no navegador**

Suba o app (preview do projeto ou `npm run dev`), faça login com a conta da Concept e abra `/prospeccao`. Confira: quadro "Como escrever o título"; campo "Nova coluna IA…" como último cabeçalho; criar `Tem site?` mostra "processando…". Sem leads ainda, a tabela fica vazia; o preenchimento real é na Task 9. Leia o console do navegador: sem erros.

- [x] **Step 7: Commit**

```bash
git add src/lib/prospecting/columns.ts src/lib/prospecting/columns.test.ts src/components/prospecting/ai-columns.tsx "src/app/(dashboard)/prospeccao/page.tsx"
git commit -m "feat(prospecting): colunas de IA na tabela, com correção, ordenação e filtro

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Rodada real e medição inicial para a parte B

**Files:**
- Create: `worker/scripts/compare-column.ts`
- Create: `docs/planilha-preditiva/medicao-inicial.md`

**Interfaces:**
- Consumes: tudo acima; `buildLeadState`, `canonicalValue`, `allowedValues`, `displayedCell`, `parseColumnTitle` (Tasks 2, 3, 8).
- Produces: números de tempo e concordância Laya × Claude, que a parte B precisa superar.

- [ ] **Step 1: Leads reais**

Pré-requisitos: Docker aberto, ≥ 5 GB livres. Com `npm run worker` rodando, crie na aba Prospecção uma busca real (ex.: `barbearia` em `Santos, SP`, 100 resultados) e espere ficar "Concluída". Confira no Supabase: `select count(*) from leads;` > 0. Confira também que `raw` tem `web_site`, `description` ou `about` em pelo menos alguns leads.

- [ ] **Step 2: Três colunas reais e o tempo**

Com `npm run laya` e `npm run worker` rodando, crie: `Tem site?`, `Nicho: beleza, saúde, alimentação, serviços, outros` e `Parece ter dinheiro`. Anote o `duration_ms` e o `filled_count` de cada uma (`select title, filled_count, duration_ms from lead_columns;`) e o tempo total entre criar e ver "pronta" na tela. Critério: menos de 30 s para até 500 leads. Corrija 2 células à mão e confirme que, depois de "Tentar de novo"/nova busca, elas continuam corrigidas.

- [ ] **Step 3: Script de comparação**

`worker/scripts/compare-column.ts`:

```ts
// Compara o que o Laya respondeu numa coluna com o que a Claude responde para os mesmos leads.
// Uso: node --env-file=.env.local --import tsx worker/scripts/compare-column.ts <column-id> [n=50]
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';
import {
  allowedValues, buildLeadState, canonicalValue, displayedCell, parseColumnTitle,
} from '@/lib/prospecting/columns';
import type { Lead, LeadColumnValue } from '@/types';

const MODEL = 'claude-sonnet-5-5';

async function main() {
  const [columnId, nArg] = process.argv.slice(2);
  if (!columnId) throw new Error('Uso: compare-column.ts <column-id> [n=50]');
  const n = Number(nArg ?? 50);

  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  });
  const anthropic = new Anthropic();

  const { data: column } = await db.from('lead_columns').select('*').eq('id', columnId).single();
  if (!column) throw new Error('Coluna não encontrada');
  const parsed = parseColumnTitle(column.title);
  if (!parsed.ok) throw new Error(parsed.error);
  const { kind, options } = parsed.value;
  const allowed = allowedValues(kind, options);

  const { data: values } = await db.from('lead_column_values').select('*').eq('column_id', columnId).limit(n);
  let agree = 0;
  let total = 0;
  for (const v of (values ?? []) as LeadColumnValue[]) {
    const laya = displayedCell({ ...v, corrected_value: null })?.value;
    if (!laya) continue;
    const { data: lead } = await db.from('leads').select('*').eq('id', v.lead_id).single();
    if (!lead) continue;
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 20,
      messages: [{
        role: 'user',
        content: `${buildLeadState(lead as Lead)}\n\nPergunta: ${column.title}\n`
          + `Responda só com uma destas opções, sem mais nada: ${allowed.join(' | ')}`,
      }],
    });
    const reply = msg.content.find((b) => b.type === 'text')?.text ?? '';
    const claude = canonicalValue(kind, options, reply.trim().replace(/[.!]$/, ''));
    total += 1;
    if (claude === laya) agree += 1;
    console.log(`${claude === laya ? '✓' : '✗'} laya=${laya} claude=${claude ?? reply.trim()} | ${(lead as Lead).name}`);
  }
  const pct = total ? Math.round((agree / total) * 100) : 0;
  console.log(`\n"${column.title}": ${agree}/${total} iguais (${pct}%)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 4: Medir as três colunas**

Para cada coluna do Step 2: `node --env-file=.env.local --import tsx worker/scripts/compare-column.ts <id> 50`.
Custo: ~150 chamadas curtas à Claude (centavos).

- [ ] **Step 5: Registrar**

`docs/planilha-preditiva/medicao-inicial.md` com: data, número de leads, para cada coluna o título, `filled_count`, `duration_ms`, tempo até "pronta" na tela e a concordância Laya × Claude (`x/50`, `%`), mais 2–3 exemplos de erro do Laya copiados da saída. Esse é o ponto de partida da parte B.

- [ ] **Step 6: Commit**

```bash
git add worker/scripts/compare-column.ts docs/planilha-preditiva/medicao-inicial.md
git commit -m "docs: medição inicial da Planilha Preditiva (Laya base vs Claude)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
