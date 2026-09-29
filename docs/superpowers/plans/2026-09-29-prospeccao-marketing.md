# Prospecção e Marketing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Prospecção" tab (Google Maps leads via `gosom/google-maps-scraper`) and a "Marketing" tab (AI promo videos via Claude + HyperFrames) to the Concept Digital CRM, both fed by a local worker that drains a job queue in Supabase.

**Architecture:** The Next.js app (Vercel) only writes job rows (`lead_searches`, `marketing_videos`) and reads results, all under RLS. A Node worker (`worker/`, run on João's Mac with `tsx`) polls those tables with the service-role key, runs the scraper in Docker or Claude + `hyperframes` CLI, and writes results back (`leads` rows, MP4s in the private `marketing` bucket). Pure logic (scoring, mapping, validation, prompt building) lives in `src/lib/**` so both sides share it and Vitest covers it.

**Tech Stack:** Next.js 16 (App Router — read `node_modules/next/dist/docs/` before touching routing APIs, per `AGENTS.md`), Supabase (Postgres + Storage, project `pkvlnhfzhjjsblotzoxn`), Vitest, `@anthropic-ai/sdk` (already a dependency), `tsx` (new devDependency), `hyperframes` CLI (new devDependency), Docker image `gosom/google-maps-scraper`, FFmpeg.

**Spec:** `docs/superpowers/specs/2026-09-28-prospeccao-marketing-design.md` (v2)

## Global Constraints

- Internal use by Concept Digital only. The worker **never** sends messages to leads; the UI only offers a manual `wa.me` link.
- Every new table has `account_id UUID REFERENCES accounts(id) ON DELETE CASCADE` and RLS using `is_account_member(account_id)` for reads and `is_account_member(account_id, 'agent')` for writes, same as `043_appointments.sql`.
- The worker is the only code that uses `SUPABASE_SERVICE_ROLE_KEY`, Docker, `hyperframes` or `ANTHROPIC_API_KEY`. The Next.js routes never call them.
- Job status values: `pending | running | done | failed`. Lead status values: `novo | contatado | qualificado | descartado`.
- `lead_searches.max_results`: default 50, min 1, max 200.
- Videos: 15–25 s, formats `vertical` (1080×1920, default), `square` (1080×1080), `landscape` (1920×1080); tones `default | polished | app-store | cinematic`; at most 4 images, each ≤ 5 MB, `image/jpeg|png|webp`.
- A job stuck in `running` for more than 30 minutes is returned to `pending` when the worker starts.
- Check/fix loop for video: at most 2 correction rounds after the first attempt, then `failed`.
- UI copy is Brazilian Portuguese, hardcoded in the page (same as `appointments/page.tsx`); nav labels go in all four `messages/*.json`.
- Commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never stage the pre-existing unrelated changes (`src/app/(dashboard)/dashboard/page.tsx`, `src/components/dashboard/portfolio-analytics.tsx`, `src/lib/dashboard/portfolio-queries.ts`, `supabase/migrations/20260925_portfolio_analytics.sql`) — stage files by name.

## Review Focus

1. **Promoting a lead whose phone already exists as a contact** (e.g. a barbearia that already messaged on WhatsApp): expect the lead to link to the existing contact, not a 500 from the `(account_id, phone_normalized)` unique index. Test in Task 3.
2. **Scraper returns the same business across two searches**: expect no duplicate lead rows (unique `(account_id, place_id)`), and `result_count` reflecting only new rows. Test in Task 6.
3. **Brazilian phone formats from Maps** (`(13) 99123-4567`, `+55 13 3222-1111`, `0800 …`, empty): expect normalization to `55` + DDD + number for landlines/mobiles, `null` for unusable ones, and mobile detection only for 9-digit numbers starting with 9. Test in Task 2.
4. **Worker killed mid-job** (Mac sleeps): expect the job to go back to `pending` on next start, not stay `running` forever. Test in Task 6.
5. **Claude returns HTML without a fenced block, or `hyperframes check` keeps failing**: expect a clear `failed` with the last check output as `error`, never a crash of the worker loop. Test in Task 7.

---

## File Structure

```
supabase/migrations/044_prospecting_marketing.sql   tables, RLS, bucket, policies
src/types/index.ts                                   + LeadSearch, Lead, MarketingVideo types
src/lib/prospecting/phone.ts (+test)                 BR phone normalize / mobile detection
src/lib/prospecting/score.ts (+test)                 opportunity score
src/lib/prospecting/map-scraper.ts (+test)           scraper JSON → lead insert rows
src/lib/prospecting/validate.ts (+test)              search form validation
src/lib/jobs/stale.ts (+test)                        "worker offline?" + stale-running helpers
src/lib/marketing/validate.ts (+test)                video form validation
src/lib/marketing/prompt.ts (+test)                  Claude prompt + HTML extraction
src/app/api/prospecting/searches/route.ts (+test)    POST create search
src/app/api/prospecting/searches/[id]/retry/route.ts (+test)
src/app/api/prospecting/leads/[id]/promote/route.ts (+test)
src/app/api/marketing/videos/route.ts (+test)        POST create video job
src/app/api/marketing/videos/[id]/retry/route.ts (+test)
src/app/(dashboard)/prospeccao/page.tsx              Prospecção UI
src/app/(dashboard)/marketing/page.tsx               Marketing UI
src/components/layout/sidebar.tsx, header.tsx        nav entries
messages/{pt,en,es,ko}.json                          nav labels
worker/index.ts                                      loop entry point
worker/queue.ts (+test)                              claim / requeue / finish helpers
worker/prospecting.ts (+test)                        run scraper, insert leads
worker/video.ts (+test)                              Claude → check/fix → render → upload
worker/exec.ts                                       spawn wrapper with timeout
worker/prompts/                                      vendored HyperFrames + Brag guidance
worker/video-scaffold/                               files `hyperframes init` produces
docs/worker.md                                       how to run the worker
vitest.config.ts                                     include worker/**/*.test.ts
package.json                                         tsx, hyperframes devDeps; "worker" script
```

---

### Task 1: Database — tables, RLS, storage bucket, types

**Files:**
- Create: `supabase/migrations/044_prospecting_marketing.sql`
- Modify: `src/types/index.ts` (append at end)

**Interfaces:**
- Produces: tables `lead_searches`, `leads`, `marketing_videos`; bucket `marketing` (private); TS types `LeadSearch`, `Lead`, `LeadStatus`, `JobStatus`, `MarketingVideo`, `VideoFormat`, `VideoTone`.

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 044_prospecting_marketing.sql — Prospecção (Google Maps leads)
-- and Marketing (AI video) job queues. Internal Concept tooling.
-- Additive and idempotent.
-- ============================================================

CREATE TABLE IF NOT EXISTS lead_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  query TEXT NOT NULL,
  location TEXT NOT NULL,
  max_results INTEGER NOT NULL DEFAULT 50 CHECK (max_results BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  error TEXT,
  result_count INTEGER,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lead_searches_account ON lead_searches(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_searches_status ON lead_searches(status, created_at);

CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  search_id UUID REFERENCES lead_searches(id) ON DELETE SET NULL,
  place_id TEXT,
  name TEXT NOT NULL,
  category TEXT,
  address TEXT,
  phone TEXT,
  is_mobile BOOLEAN NOT NULL DEFAULT FALSE,
  website TEXT,
  email TEXT,
  rating NUMERIC(2,1),
  review_count INTEGER,
  maps_url TEXT,
  raw JSONB,
  score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 100),
  score_reasons TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','contatado','qualificado','descartado')),
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL place_ids never collide (Postgres treats NULLs as distinct).
  CONSTRAINT leads_account_place_unique UNIQUE (account_id, place_id)
);
CREATE INDEX IF NOT EXISTS idx_leads_account_score ON leads(account_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_search ON leads(search_id);

CREATE TABLE IF NOT EXISTS marketing_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  prompt TEXT NOT NULL,
  image_paths TEXT[] NOT NULL DEFAULT '{}',
  format TEXT NOT NULL DEFAULT 'vertical' CHECK (format IN ('vertical','square','landscape')),
  tone TEXT NOT NULL DEFAULT 'default' CHECK (tone IN ('default','polished','app-store','cinematic')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed')),
  error TEXT,
  video_path TEXT,
  poster_path TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_videos_account ON marketing_videos(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketing_videos_status ON marketing_videos(status, created_at);

ALTER TABLE lead_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_videos ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['lead_searches','leads','marketing_videos'] LOOP
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

-- Private bucket: uploaded photos and rendered videos. The worker
-- writes with the service role; members read via signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('marketing', 'marketing', FALSE, 104857600,
        ARRAY['image/jpeg','image/png','image/webp','video/mp4'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Members can read marketing media" ON storage.objects;
CREATE POLICY "Members can read marketing media"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'marketing'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can upload marketing media" ON storage.objects;
CREATE POLICY "Members can upload marketing media"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'marketing'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "Members can delete marketing media" ON storage.objects;
CREATE POLICY "Members can delete marketing media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'marketing'
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
        AND ('account-' || p.account_id::text) = (storage.foldername(name))[1]
    )
  );
```

- [ ] **Step 2: Apply to the live project**

Apply with the Supabase MCP `apply_migration` (project `pkvlnhfzhjjsblotzoxn`, name `044_prospecting_marketing`, query = file contents). The migration is additive; no existing row changes.

- [ ] **Step 3: Verify**

Run with `execute_sql`:

```sql
select
  (select count(*) from information_schema.tables where table_schema='public'
     and table_name in ('lead_searches','leads','marketing_videos')) as tables,
  (select count(*) from pg_policies where tablename in ('lead_searches','leads','marketing_videos')) as table_policies,
  (select public from storage.buckets where id='marketing') as bucket_public,
  (select count(*) from pg_policies where tablename='objects' and policyname like '%marketing media%') as storage_policies;
```

Expected: `tables=3, table_policies=12, bucket_public=false, storage_policies=3`. Also run Supabase `get_advisors` (security) and confirm no new warnings mention these tables.

- [ ] **Step 4: Add types** — append to `src/types/index.ts`:

```ts
export type JobStatus = 'pending' | 'running' | 'done' | 'failed';
export type LeadStatus = 'novo' | 'contatado' | 'qualificado' | 'descartado';
export type VideoFormat = 'vertical' | 'square' | 'landscape';
export type VideoTone = 'default' | 'polished' | 'app-store' | 'cinematic';

export interface LeadSearch {
  id: string;
  account_id: string;
  created_by: string | null;
  query: string;
  location: string;
  max_results: number;
  status: JobStatus;
  error: string | null;
  result_count: number | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}

export interface Lead {
  id: string;
  account_id: string;
  search_id: string | null;
  place_id: string | null;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  is_mobile: boolean;
  website: string | null;
  email: string | null;
  rating: number | null;
  review_count: number | null;
  maps_url: string | null;
  score: number;
  score_reasons: string[];
  status: LeadStatus;
  contact_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MarketingVideo {
  id: string;
  account_id: string;
  created_by: string | null;
  prompt: string;
  image_paths: string[];
  format: VideoFormat;
  tone: VideoTone;
  status: JobStatus;
  error: string | null;
  video_path: string | null;
  poster_path: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
}
```

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` — Expected: no new errors.

```bash
git add supabase/migrations/044_prospecting_marketing.sql src/types/index.ts
git commit -m "feat(db): tabelas de prospecção e marketing com RLS e bucket privado

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Pure prospecting logic — phone, score, scraper mapping, validation

**Files:**
- Create: `src/lib/prospecting/phone.ts`, `src/lib/prospecting/phone.test.ts`
- Create: `src/lib/prospecting/score.ts`, `src/lib/prospecting/score.test.ts`
- Create: `src/lib/prospecting/map-scraper.ts`, `src/lib/prospecting/map-scraper.test.ts`
- Create: `src/lib/prospecting/validate.ts`, `src/lib/prospecting/validate.test.ts`
- Create: `src/lib/prospecting/__fixtures__/scraper-sample.json`

**Interfaces:**
- Produces:
  - `normalizeBrPhone(raw: string | null | undefined): string | null` — digits with `55` prefix, or `null`
  - `isBrMobile(normalized: string | null): boolean`
  - `scoreLead(input: { website: string | null; rating: number | null; reviewCount: number | null; isMobile: boolean }): { score: number; reasons: string[] }`
  - `parseScraperOutput(text: string): ScraperPlace[]` (accepts JSON array or NDJSON)
  - `mapPlaceToLead(place: ScraperPlace, ctx: { accountId: string; searchId: string }): LeadInsert`
  - `type LeadInsert` = columns of `leads` minus `id/created_at/updated_at/status/contact_id`
  - `validateSearchInput(body: unknown): { ok: true; value: { query: string; location: string; maxResults: number } } | { ok: false; error: string }`

- [ ] **Step 1: Capture a real scraper fixture** (also proves Docker works on this Mac — the scraper README warns macOS Docker may need its `MacOS instructions.md`; follow it if the command fails)

```bash
mkdir -p /tmp/gmaps-probe && printf 'barbearia em Santos, SP\n' > /tmp/gmaps-probe/queries.txt
docker run --rm -v gmaps-playwright-cache:/opt -v /tmp/gmaps-probe:/work \
  gosom/google-maps-scraper -input /work/queries.txt -results /work/results.json \
  -json -depth 1 -lang pt -exit-on-inactivity 2m
head -c 1500 /tmp/gmaps-probe/results.json
```

Expected: a JSON file with business objects containing `title`, `phone`, `website`, `review_rating`, `review_count`, `place_id`, `link`. Note whether it is a JSON array or one object per line. Copy **5 entries** into `src/lib/prospecting/__fixtures__/scraper-sample.json` as a JSON array, replacing real phone numbers with `(13) 99999-000N` and real emails with `contato@exemploN.com.br` (the fixture is committed). Keep at least one entry with an empty `website`. If the real field names differ from `title/category/address/phone/website/review_rating/review_count/place_id/link/emails`, use the real names in `ScraperPlace` below and in the tests.

- [ ] **Step 2: Write failing tests for phone**

`src/lib/prospecting/phone.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { isBrMobile, normalizeBrPhone } from './phone';

describe('normalizeBrPhone', () => {
  it('adds 55 to a formatted mobile', () => {
    expect(normalizeBrPhone('(13) 99123-4567')).toBe('5513991234567');
  });
  it('keeps an existing 55 prefix', () => {
    expect(normalizeBrPhone('+55 13 3222-1111')).toBe('551332221111');
  });
  it('drops a leading trunk zero', () => {
    expect(normalizeBrPhone('013 99123-4567')).toBe('5513991234567');
  });
  it('rejects 0800 and short or empty numbers', () => {
    expect(normalizeBrPhone('0800 123 4567')).toBeNull();
    expect(normalizeBrPhone('1234')).toBeNull();
    expect(normalizeBrPhone('')).toBeNull();
    expect(normalizeBrPhone(null)).toBeNull();
  });
});

describe('isBrMobile', () => {
  it('is true for 9-digit numbers starting with 9', () => {
    expect(isBrMobile('5513991234567')).toBe(true);
  });
  it('is false for landlines and null', () => {
    expect(isBrMobile('551332221111')).toBe(false);
    expect(isBrMobile(null)).toBe(false);
  });
});
```

- [ ] **Step 3: Run and see it fail**

Run: `npx vitest run src/lib/prospecting/phone.test.ts` — Expected: FAIL, cannot find `./phone`.

- [ ] **Step 4: Implement `phone.ts`**

```ts
// Brazilian phone normalization for Google Maps listings. Output matches
// how WhatsApp contacts are stored (digits, country code first), so the
// contacts (account_id, phone_normalized) unique index dedupes promoted
// leads against people who already messaged us.

export function normalizeBrPhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, '');
  if (digits.startsWith('0800') || digits.startsWith('800')) return null;
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    return digits;
  }
  if (digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return null;
}

export function isBrMobile(normalized: string | null): boolean {
  if (!normalized) return false;
  const local = normalized.slice(4); // after 55 + DDD
  return local.length === 9 && local.startsWith('9');
}
```

- [ ] **Step 5: Run phone tests** — `npx vitest run src/lib/prospecting/phone.test.ts` — Expected: PASS.

- [ ] **Step 6: Write failing tests for score**

`src/lib/prospecting/score.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { scoreLead } from './score';

describe('scoreLead', () => {
  it('scores the best opportunity at 100 with all reasons', () => {
    const r = scoreLead({ website: null, rating: 3.9, reviewCount: 12, isMobile: true });
    expect(r.score).toBe(100);
    expect(r.reasons).toEqual([
      'Sem site',
      'Nota baixa (3,9)',
      'Poucas avaliações (12)',
      'Tem celular (WhatsApp)',
    ]);
  });
  it('scores an established business at 0', () => {
    const r = scoreLead({ website: 'https://x.com.br', rating: 4.8, reviewCount: 320, isMobile: false });
    expect(r).toEqual({ score: 0, reasons: [] });
  });
  it('treats missing rating as no reviews, not low rating', () => {
    const r = scoreLead({ website: 'https://x.com.br', rating: null, reviewCount: null, isMobile: false });
    expect(r).toEqual({ score: 20, reasons: ['Sem avaliações'] });
  });
  it('treats a blank website string as no site', () => {
    expect(scoreLead({ website: '  ', rating: 4.8, reviewCount: 300, isMobile: false }).reasons)
      .toEqual(['Sem site']);
  });
});
```

- [ ] **Step 7: Run and see it fail** — `npx vitest run src/lib/prospecting/score.test.ts` — Expected: FAIL.

- [ ] **Step 8: Implement `score.ts`**

```ts
export interface ScoreInput {
  website: string | null;
  rating: number | null;
  reviewCount: number | null;
  isMobile: boolean;
}

// Higher = better target for selling a site/CRM/IA receptionist.
export function scoreLead(input: ScoreInput): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (!input.website || !input.website.trim()) {
    score += 35;
    reasons.push('Sem site');
  }
  if (input.rating !== null && input.rating < 4.3) {
    score += 20;
    reasons.push(`Nota baixa (${input.rating.toFixed(1).replace('.', ',')})`);
  }
  if (input.reviewCount === null || input.reviewCount === 0) {
    score += 20;
    reasons.push('Sem avaliações');
  } else if (input.reviewCount < 30) {
    score += 20;
    reasons.push(`Poucas avaliações (${input.reviewCount})`);
  }
  if (input.isMobile) {
    score += 25;
    reasons.push('Tem celular (WhatsApp)');
  }
  return { score: Math.min(score, 100), reasons };
}
```

- [ ] **Step 9: Run score tests** — Expected: PASS.

- [ ] **Step 10: Write failing tests for mapping**

`src/lib/prospecting/map-scraper.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapPlaceToLead, parseScraperOutput } from './map-scraper';

const fixture = readFileSync(join(__dirname, '__fixtures__/scraper-sample.json'), 'utf8');
const ctx = { accountId: 'acc-1', searchId: 'search-1' };

describe('parseScraperOutput', () => {
  it('parses a JSON array', () => {
    expect(parseScraperOutput(fixture)).toHaveLength(5);
  });
  it('parses NDJSON and skips blank or broken lines', () => {
    const nd = '{"title":"A"}\n\n{"title":"B"}\nnot json\n';
    expect(parseScraperOutput(nd).map((p) => p.title)).toEqual(['A', 'B']);
  });
  it('returns [] for empty output', () => {
    expect(parseScraperOutput('')).toEqual([]);
  });
});

describe('mapPlaceToLead', () => {
  it('maps fields, normalizes phone and scores', () => {
    const lead = mapPlaceToLead(
      {
        title: 'Barbearia Teste',
        category: 'Barbearia',
        address: 'Rua X, 10 - Santos',
        phone: '(13) 99123-4567',
        website: '',
        review_rating: 4.1,
        review_count: 8,
        place_id: 'ChIJ123',
        link: 'https://maps.google.com/?cid=1',
        emails: ['dono@barbearia.com.br'],
      },
      ctx,
    );
    expect(lead).toMatchObject({
      account_id: 'acc-1',
      search_id: 'search-1',
      place_id: 'ChIJ123',
      name: 'Barbearia Teste',
      phone: '5513991234567',
      is_mobile: true,
      website: null,
      email: 'dono@barbearia.com.br',
      rating: 4.1,
      review_count: 8,
      maps_url: 'https://maps.google.com/?cid=1',
      score: 100,
    });
  });
  it('maps every fixture entry without throwing', () => {
    for (const p of parseScraperOutput(fixture)) {
      expect(mapPlaceToLead(p, ctx).name.length).toBeGreaterThan(0);
    }
  });
  it('falls back to "Sem nome" and nulls for a sparse place', () => {
    const lead = mapPlaceToLead({}, ctx);
    expect(lead.name).toBe('Sem nome');
    expect(lead.phone).toBeNull();
    expect(lead.place_id).toBeNull();
  });
});
```

- [ ] **Step 11: Run and see it fail** — Expected: FAIL.

- [ ] **Step 12: Implement `map-scraper.ts`**

```ts
import { isBrMobile, normalizeBrPhone } from './phone';
import { scoreLead } from './score';

export interface ScraperPlace {
  title?: string;
  category?: string;
  address?: string;
  complete_address?: unknown;
  phone?: string;
  website?: string;
  review_rating?: number | string | null;
  review_count?: number | string | null;
  place_id?: string;
  link?: string;
  emails?: string[] | null;
  [key: string]: unknown;
}

export interface LeadInsert {
  account_id: string;
  search_id: string;
  place_id: string | null;
  name: string;
  category: string | null;
  address: string | null;
  phone: string | null;
  is_mobile: boolean;
  website: string | null;
  email: string | null;
  rating: number | null;
  review_count: number | null;
  maps_url: string | null;
  raw: ScraperPlace;
  score: number;
  score_reasons: string[];
}

export function parseScraperOutput(text: string): ScraperPlace[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  }
  const out: ScraperPlace[] = [];
  for (const line of trimmed.split('\n')) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch {
      // The scraper can flush a partial last line when killed; skip it.
    }
  }
  return out;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.replace(',', '.')) : v;
  return typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null;
}

export function mapPlaceToLead(
  place: ScraperPlace,
  ctx: { accountId: string; searchId: string },
): LeadInsert {
  const phone = normalizeBrPhone(str(place.phone));
  const isMobile = isBrMobile(phone);
  const website = str(place.website);
  const rating = num(place.review_rating);
  const reviewCount = num(place.review_count);
  const { score, reasons } = scoreLead({ website, rating, reviewCount, isMobile });
  const email = Array.isArray(place.emails) ? str(place.emails[0]) : null;

  return {
    account_id: ctx.accountId,
    search_id: ctx.searchId,
    place_id: str(place.place_id),
    name: str(place.title) ?? 'Sem nome',
    category: str(place.category),
    address: str(place.address),
    phone,
    is_mobile: isMobile,
    website,
    email,
    rating: rating === null ? null : Math.round(rating * 10) / 10,
    review_count: reviewCount === null ? null : Math.round(reviewCount),
    maps_url: str(place.link),
    raw: place,
    score,
    score_reasons: reasons,
  };
}
```

- [ ] **Step 13: Run mapping tests** — Expected: PASS.

- [ ] **Step 14: Write failing tests for validation**

`src/lib/prospecting/validate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validateSearchInput } from './validate';

describe('validateSearchInput', () => {
  it('accepts a valid search and trims', () => {
    expect(validateSearchInput({ query: ' barbearia ', location: ' Santos, SP ', maxResults: 30 }))
      .toEqual({ ok: true, value: { query: 'barbearia', location: 'Santos, SP', maxResults: 30 } });
  });
  it('defaults maxResults to 50', () => {
    const r = validateSearchInput({ query: 'imobiliária', location: 'Santos' });
    expect(r.ok && r.value.maxResults).toBe(50);
  });
  it('clamps maxResults into 1..200', () => {
    const hi = validateSearchInput({ query: 'a', location: 'b', maxResults: 999 });
    const lo = validateSearchInput({ query: 'a', location: 'b', maxResults: 0 });
    expect(hi.ok && hi.value.maxResults).toBe(200);
    expect(lo.ok && lo.value.maxResults).toBe(1);
  });
  it('rejects missing fields, long text and newlines', () => {
    expect(validateSearchInput(null).ok).toBe(false);
    expect(validateSearchInput({ query: '', location: 'Santos' }).ok).toBe(false);
    expect(validateSearchInput({ query: 'a', location: '' }).ok).toBe(false);
    expect(validateSearchInput({ query: 'x'.repeat(121), location: 'Santos' }).ok).toBe(false);
    // One query per line in the scraper input file — a newline would inject a second search.
    expect(validateSearchInput({ query: 'a\nb', location: 'Santos' }).ok).toBe(false);
  });
});
```

- [ ] **Step 15: Run and see it fail** — Expected: FAIL.

- [ ] **Step 16: Implement `validate.ts`**

```ts
type Result =
  | { ok: true; value: { query: string; location: string; maxResults: number } }
  | { ok: false; error: string };

const MAX_LEN = 120;

export function validateSearchInput(body: unknown): Result {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Corpo inválido' };
  const b = body as Record<string, unknown>;
  const query = typeof b.query === 'string' ? b.query.trim() : '';
  const location = typeof b.location === 'string' ? b.location.trim() : '';
  if (!query) return { ok: false, error: 'Informe o que buscar' };
  if (!location) return { ok: false, error: 'Informe a cidade' };
  if (query.length > MAX_LEN || location.length > MAX_LEN) {
    return { ok: false, error: 'Texto muito longo' };
  }
  if (/[\r\n]/.test(query) || /[\r\n]/.test(location)) {
    return { ok: false, error: 'Use uma linha só' };
  }
  const raw = typeof b.maxResults === 'number' && Number.isFinite(b.maxResults) ? b.maxResults : 50;
  const maxResults = Math.min(200, Math.max(1, Math.round(raw)));
  return { ok: true, value: { query, location, maxResults } };
}
```

- [ ] **Step 17: Run all prospecting tests** — `npx vitest run src/lib/prospecting` — Expected: PASS.

- [ ] **Step 18: Commit**

```bash
git add src/lib/prospecting
git commit -m "feat(prospecting): normalização de telefone, score e mapeamento do scraper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Prospecting API routes — create search, retry, promote lead

**Files:**
- Create: `src/app/api/prospecting/searches/route.ts` (+ `route.test.ts`)
- Create: `src/app/api/prospecting/searches/[id]/retry/route.ts` (+ `route.test.ts`)
- Create: `src/app/api/prospecting/leads/[id]/promote/route.ts` (+ `route.test.ts`)

**Interfaces:**
- Consumes: `requireRole`, `toErrorResponse` from `@/lib/auth/account`; `validateSearchInput` (Task 2).
- Produces:
  - `POST /api/prospecting/searches` body `{ query, location, maxResults? }` → `201 { search: LeadSearch }` | `400 { error }`
  - `POST /api/prospecting/searches/:id/retry` → `200 { search }` | `404` | `409` (not failed)
  - `POST /api/prospecting/leads/:id/promote` → `200 { contactId, existing: boolean }` | `404` | `409 { error: 'Lead sem telefone' }`

All three use `ctx.supabase` (RLS-scoped), so a lead or search from another account is simply "not found".

- [ ] **Step 1: Write failing tests for create search**

`src/app/api/prospecting/searches/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), insert: vi.fn() }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { POST } from './route';

function ctx() {
  return {
    accountId: 'acc-1',
    userId: 'user-1',
    supabase: {
      from: () => ({
        insert: (row: unknown) => {
          mocks.insert(row);
          return { select: () => ({ single: async () => ({ data: { id: 's-1', ...(row as object) }, error: null }) }) };
        },
      }),
    },
  };
}

const req = (body: unknown) =>
  new Request('http://localhost/api/prospecting/searches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireRole.mockResolvedValue(ctx());
});

describe('POST /api/prospecting/searches', () => {
  it('requires agent and inserts a pending search', async () => {
    const res = await POST(req({ query: 'barbearia', location: 'Santos, SP', maxResults: 20 }));
    expect(res.status).toBe(201);
    expect(mocks.requireRole).toHaveBeenCalledWith('agent');
    expect(mocks.insert).toHaveBeenCalledWith({
      account_id: 'acc-1',
      created_by: 'user-1',
      query: 'barbearia',
      location: 'Santos, SP',
      max_results: 20,
      status: 'pending',
    });
  });
  it('returns 400 on invalid input without inserting', async () => {
    const res = await POST(req({ query: '', location: 'Santos' }));
    expect(res.status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it('returns the auth error when the role check fails', async () => {
    mocks.requireRole.mockRejectedValue(new Error('nope'));
    const res = await POST(req({ query: 'a', location: 'b' }));
    expect(res.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run and see it fail** — `npx vitest run src/app/api/prospecting/searches/route.test.ts` — Expected: FAIL.

- [ ] **Step 3: Implement `searches/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { validateSearchInput } from '@/lib/prospecting/validate';

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => null);
  const parsed = validateSearchInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await ctx.supabase
    .from('lead_searches')
    .insert({
      account_id: ctx.accountId,
      created_by: ctx.userId,
      query: parsed.value.query,
      location: parsed.value.location,
      max_results: parsed.value.maxResults,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ search: data }, { status: 201 });
}
```

- [ ] **Step 4: Run** — Expected: PASS.

- [ ] **Step 5: Write failing tests for retry**

`src/app/api/prospecting/searches/[id]/retry/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), current: null as unknown, update: vi.fn() }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { POST } from './route';

function supabase() {
  return {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.current, error: null }) }) }),
      update: (patch: unknown) => {
        mocks.update(patch);
        return {
          eq: () => ({
            select: () => ({ single: async () => ({ data: { id: 's-1', ...(patch as object) }, error: null }) }),
          }),
        };
      },
    }),
  };
}

const params = { params: Promise.resolve({ id: 's-1' }) };
const req = () => new Request('http://localhost/api/prospecting/searches/s-1/retry', { method: 'POST' });

beforeEach(() => {
  mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'u', supabase: supabase() });
});

describe('POST retry', () => {
  it('resets a failed search to pending', async () => {
    mocks.current = { id: 's-1', status: 'failed' };
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith({
      status: 'pending', error: null, started_at: null, finished_at: null,
    });
  });
  it('404s when the search is not visible', async () => {
    mocks.current = null;
    expect((await POST(req(), params)).status).toBe(404);
  });
  it('409s when the search is not failed', async () => {
    mocks.current = { id: 's-1', status: 'running' };
    expect((await POST(req(), params)).status).toBe(409);
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run and see it fail** — Expected: FAIL.

- [ ] **Step 7: Implement `searches/[id]/retry/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  const { id } = await params;

  const { data: current } = await ctx.supabase
    .from('lead_searches')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Busca não encontrada' }, { status: 404 });
  if (current.status !== 'failed') {
    return NextResponse.json({ error: 'Só dá pra tentar de novo uma busca com erro' }, { status: 409 });
  }

  const { data, error } = await ctx.supabase
    .from('lead_searches')
    .update({ status: 'pending', error: null, started_at: null, finished_at: null })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ search: data });
}
```

- [ ] **Step 8: Run** — Expected: PASS.

- [ ] **Step 9: Write failing tests for promote** (covers Review Focus #1)

`src/app/api/prospecting/leads/[id]/promote/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  lead: null as unknown,
  existingContact: null as unknown,
  insertContact: vi.fn(),
  updateLead: vi.fn(),
}));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { POST } from './route';

function supabase() {
  return {
    from: (table: string) => {
      if (table === 'leads') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.lead, error: null }) }) }),
          update: (patch: unknown) => {
            mocks.updateLead(patch);
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: mocks.existingContact, error: null }) }) }),
        }),
        insert: (row: unknown) => {
          mocks.insertContact(row);
          return { select: () => ({ single: async () => ({ data: { id: 'c-new' }, error: null }) }) };
        },
      };
    },
  };
}

const params = { params: Promise.resolve({ id: 'l-1' }) };
const req = () => new Request('http://localhost/api/prospecting/leads/l-1/promote', { method: 'POST' });
const baseLead = {
  id: 'l-1', name: 'Barbearia X', phone: '5513991234567', email: 'a@b.com',
  category: 'Barbearia', contact_id: null,
};

beforeEach(() => {
  mocks.lead = { ...baseLead };
  mocks.existingContact = null;
  mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'user-1', supabase: supabase() });
});

describe('POST promote', () => {
  it('creates a contact and links the lead', async () => {
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ contactId: 'c-new', existing: false });
    expect(mocks.insertContact).toHaveBeenCalledWith({
      user_id: 'user-1', account_id: 'acc-1', name: 'Barbearia X',
      phone: '5513991234567', email: 'a@b.com', company: 'Barbearia X',
    });
    expect(mocks.updateLead).toHaveBeenCalledWith(
      expect.objectContaining({ contact_id: 'c-new', status: 'contatado' }),
    );
  });
  it('links to an existing contact with the same phone instead of inserting', async () => {
    mocks.existingContact = { id: 'c-old' };
    const res = await POST(req(), params);
    expect(await res.json()).toEqual({ contactId: 'c-old', existing: true });
    expect(mocks.insertContact).not.toHaveBeenCalled();
  });
  it('is idempotent when already promoted', async () => {
    mocks.lead = { ...baseLead, contact_id: 'c-prev' };
    const res = await POST(req(), params);
    expect(await res.json()).toEqual({ contactId: 'c-prev', existing: true });
    expect(mocks.insertContact).not.toHaveBeenCalled();
  });
  it('409s for a lead without phone', async () => {
    mocks.lead = { ...baseLead, phone: null };
    expect((await POST(req(), params)).status).toBe(409);
  });
  it('404s for a lead not visible to the caller', async () => {
    mocks.lead = null;
    expect((await POST(req(), params)).status).toBe(404);
  });
});
```

- [ ] **Step 10: Run and see it fail** — Expected: FAIL.

- [ ] **Step 11: Implement `leads/[id]/promote/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  const { id } = await params;

  const { data: lead } = await ctx.supabase
    .from('leads')
    .select('id, name, phone, email, category, contact_id')
    .eq('id', id)
    .maybeSingle();
  if (!lead) return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 });
  if (lead.contact_id) return NextResponse.json({ contactId: lead.contact_id, existing: true });
  if (!lead.phone) return NextResponse.json({ error: 'Lead sem telefone' }, { status: 409 });

  // lead.phone is already digits-only (normalizeBrPhone), which is exactly
  // what contacts.phone_normalized holds — so this finds WhatsApp contacts too.
  const { data: existing } = await ctx.supabase
    .from('contacts')
    .select('id')
    .eq('account_id', ctx.accountId)
    .eq('phone_normalized', lead.phone)
    .maybeSingle();

  let contactId: string;
  if (existing) {
    contactId = existing.id;
  } else {
    const { data: created, error } = await ctx.supabase
      .from('contacts')
      .insert({
        user_id: ctx.userId,
        account_id: ctx.accountId,
        name: lead.name,
        phone: lead.phone,
        email: lead.email,
        company: lead.name,
      })
      .select('id')
      .single();
    if (error || !created) {
      return NextResponse.json({ error: error?.message ?? 'Falha ao criar contato' }, { status: 500 });
    }
    contactId = created.id;
  }

  const { error: linkError } = await ctx.supabase
    .from('leads')
    .update({ contact_id: contactId, status: 'contatado', updated_at: new Date().toISOString() })
    .eq('id', id);
  if (linkError) return NextResponse.json({ error: linkError.message }, { status: 500 });

  return NextResponse.json({ contactId, existing: Boolean(existing) });
}
```

- [ ] **Step 12: Run all route tests** — `npx vitest run src/app/api/prospecting` — Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add src/app/api/prospecting
git commit -m "feat(prospecting): rotas de criar busca, tentar de novo e promover lead

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Prospecção page, stale-queue helper and navigation

**Files:**
- Create: `src/lib/jobs/stale.ts`, `src/lib/jobs/stale.test.ts`
- Create: `src/app/(dashboard)/prospeccao/page.tsx`
- Modify: `src/components/layout/sidebar.tsx` (navItems, after `/appointments`)
- Modify: `src/components/layout/header.tsx` (`pageTitles`)
- Modify: `messages/pt.json`, `messages/en.json`, `messages/es.json`, `messages/ko.json` (`Sidebar` and `Header` sections)

**Interfaces:**
- Consumes: `LeadSearch`, `Lead`, `LeadStatus` (Task 1); API routes (Task 3).
- Produces: `hasStalePending(rows: { status: JobStatus; created_at: string }[], now: number, thresholdMs?: number): boolean` (default threshold 10 min) — reused by the Marketing page in Task 5.

- [ ] **Step 1: Write failing test for `stale.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { hasStalePending } from './stale';

const now = Date.parse('2026-09-29T12:00:00Z');

describe('hasStalePending', () => {
  it('is true when a pending job is older than 10 minutes', () => {
    expect(hasStalePending([{ status: 'pending', created_at: '2026-09-29T11:49:00Z' }], now)).toBe(true);
  });
  it('ignores recent pending and non-pending jobs', () => {
    expect(hasStalePending([
      { status: 'pending', created_at: '2026-09-29T11:55:00Z' },
      { status: 'failed', created_at: '2026-09-29T10:00:00Z' },
    ], now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run and see it fail**, then **implement** `src/lib/jobs/stale.ts`:

```ts
import type { JobStatus } from '@/types';

export function hasStalePending(
  rows: { status: JobStatus; created_at: string }[],
  now: number,
  thresholdMs = 10 * 60 * 1000,
): boolean {
  return rows.some((r) => r.status === 'pending' && now - Date.parse(r.created_at) > thresholdMs);
}
```

Run: `npx vitest run src/lib/jobs` — Expected: PASS.

- [ ] **Step 3: Add navigation**

In `src/components/layout/sidebar.tsx`, add `Search` and `Clapperboard` to the existing `lucide-react` import and insert after the `/appointments` item:

```ts
  { href: "/prospeccao", labelKey: "prospecting", icon: Search },
  { href: "/marketing", labelKey: "marketing", icon: Clapperboard },
```

In `src/components/layout/header.tsx` `pageTitles`, after `"/appointments"`:

```ts
  "/prospeccao": "prospecting",
  "/marketing": "marketing",
```

In each `messages/*.json`, add to **both** `Sidebar` and `Header`:

| file | `prospecting` | `marketing` |
|---|---|---|
| pt.json | `"Prospecção"` | `"Marketing"` |
| en.json | `"Prospecting"` | `"Marketing"` |
| es.json | `"Prospección"` | `"Marketing"` |
| ko.json | `"잠재 고객 발굴"` | `"마케팅"` |

Verify: `node -e 'for (const l of ["pt","en","es","ko"]) { const m=require("./messages/"+l+".json"); if(!m.Sidebar.prospecting||!m.Header.marketing) throw l }'` — Expected: no output.

- [ ] **Step 4: Write the page** `src/app/(dashboard)/prospeccao/page.tsx`

Uses the same building blocks as `appointments/page.tsx` (`createClient` from `@/lib/supabase/client`, `useAuth`, `useCan`, `sonner` toasts, `@/components/ui/*`). Polls every 5 s while any search is `pending`/`running`.

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { ExternalLink, MessageCircle, RotateCcw, Search, UserPlus, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { hasStalePending } from '@/lib/jobs/stale';
import type { Lead, LeadSearch, LeadStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const STATUS_LABEL: Record<LeadStatus, string> = {
  novo: 'Novo', contatado: 'Contatado', qualificado: 'Qualificado', descartado: 'Descartado',
};
const JOB_LABEL = { pending: 'Na fila', running: 'Buscando…', done: 'Concluída', failed: 'Erro' } as const;

export default function ProspeccaoPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId } = useAuth();
  const canEdit = useCan('send-messages');

  const [searches, setSearches] = useState<LeadSearch[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('Santos, SP');
  const [maxResults, setMaxResults] = useState(50);
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'todos'>('novo');
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    const [s, l] = await Promise.all([
      supabase.from('lead_searches').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('leads').select('*').order('score', { ascending: false }).limit(500),
    ]);
    if (s.data) setSearches(s.data as LeadSearch[]);
    if (l.data) setLeads(l.data as Lead[]);
  }, [supabase, accountId]);

  useEffect(() => { void load(); }, [load]);

  const busy = searches.some((s) => s.status === 'pending' || s.status === 'running');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  async function createSearch(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const res = await fetch('/api/prospecting/searches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, location, maxResults }),
    });
    setSubmitting(false);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.error ?? 'Não foi possível criar a busca');
    toast.success('Busca na fila. O worker processa quando estiver rodando.');
    setQuery('');
    void load();
  }

  async function retry(id: string) {
    const res = await fetch(`/api/prospecting/searches/${id}/retry`, { method: 'POST' });
    if (!res.ok) return toast.error('Não foi possível tentar de novo');
    void load();
  }

  async function promote(lead: Lead) {
    const res = await fetch(`/api/prospecting/leads/${lead.id}/promote`, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(json.error ?? 'Falha ao promover');
    toast.success(json.existing ? 'Já era um contato. Lead vinculado.' : 'Contato criado.');
    void load();
  }

  async function setStatus(lead: Lead, status: LeadStatus) {
    const { error } = await supabase
      .from('leads')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', lead.id);
    if (error) return toast.error(error.message);
    setLeads((prev) => prev.map((l) => (l.id === lead.id ? { ...l, status } : l)));
  }

  const visible = leads.filter((l) =>
    (statusFilter === 'todos' || l.status === statusFilter) &&
    (!text || `${l.name} ${l.address ?? ''} ${l.category ?? ''}`.toLowerCase().includes(text.toLowerCase())),
  );

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Prospecção</h1>
        <p className="text-sm text-muted-foreground">
          Negócios do Google Maps, ordenados por oportunidade. Uso interno: nenhuma mensagem é enviada automaticamente.
        </p>
      </div>

      {hasStalePending(searches, Date.now()) && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4" />
          Há buscas na fila há mais de 10 minutos. O worker está rodando? (veja docs/worker.md)
        </div>
      )}

      <form onSubmit={createSearch} className="flex flex-wrap items-end gap-3 rounded-lg border p-4">
        <label className="flex flex-col gap-1 text-sm">O que buscar
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="barbearia, imobiliária…" required maxLength={120} />
        </label>
        <label className="flex flex-col gap-1 text-sm">Cidade
          <Input value={location} onChange={(e) => setLocation(e.target.value)} required maxLength={120} />
        </label>
        <label className="flex w-28 flex-col gap-1 text-sm">Quantidade
          <Input type="number" min={1} max={200} value={maxResults} onChange={(e) => setMaxResults(Number(e.target.value))} />
        </label>
        <Button type="submit" disabled={!canEdit || submitting}>
          <Search className="mr-2 h-4 w-4" /> Buscar
        </Button>
      </form>

      {searches.length > 0 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {searches.slice(0, 8).map((s) => (
            <span key={s.id} className="flex items-center gap-2 rounded-full border px-3 py-1">
              {s.query} · {s.location} · {JOB_LABEL[s.status]}
              {s.status === 'done' && ` (${s.result_count ?? 0} novos)`}
              {s.status === 'failed' && (
                <button type="button" title={s.error ?? ''} onClick={() => retry(s.id)} className="underline">
                  <RotateCcw className="inline h-3 w-3" /> tentar de novo
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <select
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as LeadStatus | 'todos')}
        >
          <option value="todos">Todos</option>
          {Object.entries(STATUS_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
        <Input className="max-w-xs" placeholder="Filtrar por nome, bairro…" value={text} onChange={(e) => setText(e.target.value)} />
        <span className="text-sm text-muted-foreground">{visible.length} leads</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Score</TableHead>
            <TableHead>Negócio</TableHead>
            <TableHead>Contato</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((l) => (
            <TableRow key={l.id}>
              <TableCell>
                <div className="font-semibold">{l.score}</div>
                <div className="text-xs text-muted-foreground">{l.score_reasons.join(' · ')}</div>
              </TableCell>
              <TableCell>
                <div className="font-medium">{l.name}</div>
                <div className="text-xs text-muted-foreground">
                  {l.category} {l.rating ? `· ${l.rating}★ (${l.review_count ?? 0})` : ''}
                </div>
                <div className="text-xs text-muted-foreground">{l.address}</div>
              </TableCell>
              <TableCell className="text-sm">
                <div>{l.phone ?? '—'}</div>
                {l.website && <a className="text-xs underline" href={l.website} target="_blank" rel="noreferrer">site</a>}
                {l.email && <div className="text-xs">{l.email}</div>}
              </TableCell>
              <TableCell>
                <select
                  className="h-8 rounded-md border bg-background px-2 text-sm"
                  value={l.status}
                  disabled={!canEdit}
                  onChange={(e) => setStatus(l, e.target.value as LeadStatus)}
                >
                  {Object.entries(STATUS_LABEL).map(([v, label]) => <option key={v} value={v}>{label}</option>)}
                </select>
              </TableCell>
              <TableCell className="space-x-1 whitespace-nowrap">
                {l.maps_url && (
                  <Button asChild variant="ghost" size="icon" title="Abrir no Maps">
                    <a href={l.maps_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                  </Button>
                )}
                {l.phone && l.is_mobile && (
                  <Button asChild variant="ghost" size="icon" title="Abrir WhatsApp (manual)">
                    <a href={`https://wa.me/${l.phone}`} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /></a>
                  </Button>
                )}
                <Button
                  variant="outline" size="sm"
                  disabled={!canEdit || !l.phone || Boolean(l.contact_id)}
                  title={!l.phone ? 'Lead sem telefone' : l.contact_id ? 'Já é contato' : 'Promover para Contato'}
                  onClick={() => promote(l)}
                >
                  <UserPlus className="mr-1 h-4 w-4" /> {l.contact_id ? 'Contato' : 'Promover'}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

If `Button` in `src/components/ui/button.tsx` does not support `asChild` (it is built on `@base-ui/react`, check its props), replace the two `asChild` buttons with plain `<a>` elements styled with `buttonVariants({ variant: 'ghost', size: 'icon' })` from the same file.

- [ ] **Step 5: Verify**

Run: `npm run typecheck && npm run lint && npx vitest run` — Expected: all pass.

Start the dev server with the preview tools, sign in, open `/prospeccao`, and confirm: the tab shows in the sidebar and header, the form submits and a "Na fila" chip appears, and a row in `lead_searches` exists (check via `execute_sql`). Delete that test row afterwards with `execute_sql` (`delete from lead_searches where query = '<the test query>'`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/jobs "src/app/(dashboard)/prospeccao" src/components/layout/sidebar.tsx src/components/layout/header.tsx messages/pt.json messages/en.json messages/es.json messages/ko.json
git commit -m "feat(prospecting): aba Prospecção com busca, filtro e promoção de leads

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Marketing — validation, API routes and page

**Files:**
- Create: `src/lib/marketing/validate.ts`, `src/lib/marketing/validate.test.ts`
- Create: `src/app/api/marketing/videos/route.ts` (+ `route.test.ts`)
- Create: `src/app/api/marketing/videos/[id]/retry/route.ts` (+ `route.test.ts`)
- Create: `src/app/(dashboard)/marketing/page.tsx`

**Interfaces:**
- Consumes: `buildMediaPath(accountId, fileName, now, subfolder)` from `@/lib/storage/upload-media`; `hasStalePending` (Task 4); `MarketingVideo`, `VideoFormat`, `VideoTone` (Task 1).
- Produces:
  - `validateVideoInput(body: unknown, accountId: string): { ok: true; value: { prompt: string; imagePaths: string[]; format: VideoFormat; tone: VideoTone } } | { ok: false; error: string }`
  - `POST /api/marketing/videos` body `{ prompt, imagePaths, format?, tone? }` → `201 { video }` | `400`
  - `POST /api/marketing/videos/:id/retry` → `200 { video }` | `404` | `409`
  - Storage layout: uploads `marketing/account-<id>/uploads/<ts>-<name>.<ext>`; worker output `marketing/account-<id>/videos/<videoId>.mp4` and `…/<videoId>.jpg`.

- [ ] **Step 1: Write failing tests for validation**

```ts
import { describe, expect, it } from 'vitest';
import { validateVideoInput } from './validate';

const acc = 'acc-1';
const img = (n: number) => `account-${acc}/uploads/1-foto${n}.jpg`;

describe('validateVideoInput', () => {
  it('accepts prompt + images and applies defaults', () => {
    expect(validateVideoInput({ prompt: ' Promo corte + barba R$50 ', imagePaths: [img(1)] }, acc)).toEqual({
      ok: true,
      value: { prompt: 'Promo corte + barba R$50', imagePaths: [img(1)], format: 'vertical', tone: 'default' },
    });
  });
  it('accepts no images', () => {
    expect(validateVideoInput({ prompt: 'Abertura', imagePaths: [] }, acc).ok).toBe(true);
  });
  it('rejects empty or too long prompts', () => {
    expect(validateVideoInput({ prompt: '  ' }, acc).ok).toBe(false);
    expect(validateVideoInput({ prompt: 'x'.repeat(1001) }, acc).ok).toBe(false);
  });
  it('rejects more than 4 images', () => {
    expect(validateVideoInput({ prompt: 'a', imagePaths: [1, 2, 3, 4, 5].map(img) }, acc).ok).toBe(false);
  });
  it("rejects image paths outside the caller's account folder", () => {
    expect(validateVideoInput({ prompt: 'a', imagePaths: ['account-other/uploads/x.jpg'] }, acc).ok).toBe(false);
    expect(validateVideoInput({ prompt: 'a', imagePaths: [`account-${acc}/../x.jpg`] }, acc).ok).toBe(false);
  });
  it('rejects unknown format and tone', () => {
    expect(validateVideoInput({ prompt: 'a', format: 'tiktok' }, acc).ok).toBe(false);
    expect(validateVideoInput({ prompt: 'a', tone: 'chaotic' }, acc).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run and see it fail**, then **implement** `src/lib/marketing/validate.ts`:

```ts
import type { VideoFormat, VideoTone } from '@/types';

const FORMATS: VideoFormat[] = ['vertical', 'square', 'landscape'];
const TONES: VideoTone[] = ['default', 'polished', 'app-store', 'cinematic'];

type Result =
  | { ok: true; value: { prompt: string; imagePaths: string[]; format: VideoFormat; tone: VideoTone } }
  | { ok: false; error: string };

export function validateVideoInput(body: unknown, accountId: string): Result {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Corpo inválido' };
  const b = body as Record<string, unknown>;

  const prompt = typeof b.prompt === 'string' ? b.prompt.trim() : '';
  if (!prompt) return { ok: false, error: 'Descreva o vídeo' };
  if (prompt.length > 1000) return { ok: false, error: 'Descrição muito longa (máx. 1000)' };

  const imagePaths = Array.isArray(b.imagePaths) ? b.imagePaths : [];
  if (imagePaths.length > 4) return { ok: false, error: 'No máximo 4 fotos' };
  const prefix = `account-${accountId}/uploads/`;
  for (const p of imagePaths) {
    if (typeof p !== 'string' || !p.startsWith(prefix) || p.includes('..')) {
      return { ok: false, error: 'Foto inválida' };
    }
  }

  const format = (b.format ?? 'vertical') as VideoFormat;
  if (!FORMATS.includes(format)) return { ok: false, error: 'Formato inválido' };
  const tone = (b.tone ?? 'default') as VideoTone;
  if (!TONES.includes(tone)) return { ok: false, error: 'Tom inválido' };

  return { ok: true, value: { prompt, imagePaths: imagePaths as string[], format, tone } };
}
```

Run: `npx vitest run src/lib/marketing` — Expected: PASS.

- [ ] **Step 3: Write failing tests for `POST /api/marketing/videos`**

`src/app/api/marketing/videos/route.test.ts` — same mock shape as Task 3 Step 1:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), insert: vi.fn() }));

vi.mock('@/lib/auth/account', () => ({
  requireRole: mocks.requireRole,
  toErrorResponse: vi.fn(() => Response.json({ error: 'auth failed' }, { status: 403 })),
}));

import { POST } from './route';

const supabase = {
  from: () => ({
    insert: (row: unknown) => {
      mocks.insert(row);
      return { select: () => ({ single: async () => ({ data: { id: 'v-1', ...(row as object) }, error: null }) }) };
    },
  }),
};

const req = (body: unknown) =>
  new Request('http://localhost/api/marketing/videos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  mocks.requireRole.mockResolvedValue({ accountId: 'acc-1', userId: 'user-1', supabase });
});

describe('POST /api/marketing/videos', () => {
  it('inserts a pending video job', async () => {
    const res = await POST(req({ prompt: 'Promo', imagePaths: ['account-acc-1/uploads/1-a.jpg'], tone: 'polished' }));
    expect(res.status).toBe(201);
    expect(mocks.requireRole).toHaveBeenCalledWith('agent');
    expect(mocks.insert).toHaveBeenCalledWith({
      account_id: 'acc-1', created_by: 'user-1', prompt: 'Promo',
      image_paths: ['account-acc-1/uploads/1-a.jpg'], format: 'vertical', tone: 'polished', status: 'pending',
    });
  });
  it('400s on invalid input', async () => {
    expect((await POST(req({ prompt: '' }))).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run and see it fail**, then **implement** `src/app/api/marketing/videos/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { validateVideoInput } from '@/lib/marketing/validate';

export async function POST(request: Request) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }

  const body = await request.json().catch(() => null);
  const parsed = validateVideoInput(body, ctx.accountId);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data, error } = await ctx.supabase
    .from('marketing_videos')
    .insert({
      account_id: ctx.accountId,
      created_by: ctx.userId,
      prompt: parsed.value.prompt,
      image_paths: parsed.value.imagePaths,
      format: parsed.value.format,
      tone: parsed.value.tone,
      status: 'pending',
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ video: data }, { status: 201 });
}
```

Run — Expected: PASS.

- [ ] **Step 5: Retry route with tests**

Create `src/app/api/marketing/videos/[id]/retry/route.test.ts` as a copy of Task 3 Step 5's test with the URL changed to `/api/marketing/videos/v-1/retry`, `params` id `v-1`, and the expected update patch:

```ts
{ status: 'pending', error: null, started_at: null, finished_at: null, video_path: null, poster_path: null }
```

Create `src/app/api/marketing/videos/[id]/retry/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { requireRole, toErrorResponse } from '@/lib/auth/account';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  let ctx;
  try {
    ctx = await requireRole('agent');
  } catch (err) {
    return toErrorResponse(err);
  }
  const { id } = await params;

  const { data: current } = await ctx.supabase
    .from('marketing_videos')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Vídeo não encontrado' }, { status: 404 });
  if (current.status !== 'failed') {
    return NextResponse.json({ error: 'Só dá pra tentar de novo um vídeo com erro' }, { status: 409 });
  }

  const { data, error } = await ctx.supabase
    .from('marketing_videos')
    .update({
      status: 'pending', error: null, started_at: null, finished_at: null,
      video_path: null, poster_path: null,
    })
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ video: data });
}
```

Run: `npx vitest run src/app/api/marketing` — Expected: PASS.

- [ ] **Step 6: Write the page** `src/app/(dashboard)/marketing/page.tsx`

Uploads go straight from the browser to the private `marketing` bucket (RLS allows the member's own `account-<id>/` folder). Videos are shown via 1-hour signed URLs.

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Download, Loader2, RotateCcw, Trash2, Wand2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { useCan } from '@/hooks/use-can';
import { buildMediaPath } from '@/lib/storage/upload-media';
import { hasStalePending } from '@/lib/jobs/stale';
import type { MarketingVideo, VideoFormat, VideoTone } from '@/types';
import { Button } from '@/components/ui/button';

const BUCKET = 'marketing';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const TONES: { value: VideoTone; label: string }[] = [
  { value: 'default', label: 'Leve e divertido' },
  { value: 'polished', label: 'Elegante' },
  { value: 'app-store', label: 'Limpo, estilo anúncio' },
  { value: 'cinematic', label: 'Cinematográfico' },
];
const FORMATS: { value: VideoFormat; label: string }[] = [
  { value: 'vertical', label: 'Vertical (Stories/Reels)' },
  { value: 'square', label: 'Quadrado (Feed)' },
  { value: 'landscape', label: 'Horizontal (YouTube)' },
];
const JOB_LABEL = { pending: 'Na fila', running: 'Gerando…', done: 'Pronto', failed: 'Erro' } as const;

export default function MarketingPage() {
  const supabase = useMemo(() => createClient(), []);
  const { accountId } = useAuth();
  const canEdit = useCan('send-messages');

  const [videos, setVideos] = useState<MarketingVideo[]>([]);
  const [urls, setUrls] = useState<Record<string, { video?: string; poster?: string }>>({});
  const [prompt, setPrompt] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [format, setFormat] = useState<VideoFormat>('vertical');
  const [tone, setTone] = useState<VideoTone>('default');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) return;
    const { data } = await supabase
      .from('marketing_videos').select('*').order('created_at', { ascending: false }).limit(50);
    const rows = (data ?? []) as MarketingVideo[];
    setVideos(rows);
    const paths = rows.flatMap((v) => [v.video_path, v.poster_path]).filter((p): p is string => Boolean(p));
    if (paths.length === 0) return;
    const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrls(paths, 3600);
    const byPath = new Map((signed ?? []).map((s) => [s.path, s.signedUrl]));
    setUrls(Object.fromEntries(rows.map((v) => [v.id, {
      video: v.video_path ? byPath.get(v.video_path) : undefined,
      poster: v.poster_path ? byPath.get(v.poster_path) : undefined,
    }])));
  }, [supabase, accountId]);

  useEffect(() => { void load(); }, [load]);

  const busy = videos.some((v) => v.status === 'pending' || v.status === 'running');
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [busy, load]);

  function pickFiles(list: FileList | null) {
    const picked = Array.from(list ?? []);
    const bad = picked.find((f) => !IMAGE_TYPES.includes(f.type) || f.size > MAX_IMAGE_BYTES);
    if (bad) return toast.error(`${bad.name}: use JPG, PNG ou WebP de até 5 MB`);
    if (picked.length > 4) return toast.error('No máximo 4 fotos');
    setFiles(picked);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId) return;
    setSubmitting(true);
    try {
      const imagePaths: string[] = [];
      for (const file of files) {
        const path = buildMediaPath(accountId, file.name, Date.now(), 'uploads');
        const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
        if (error) throw new Error(`Falha ao enviar ${file.name}: ${error.message}`);
        imagePaths.push(path);
      }
      const res = await fetch('/api/marketing/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, imagePaths, format, tone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? 'Não foi possível criar o vídeo');
      toast.success('Vídeo na fila. Leva alguns minutos com o worker rodando.');
      setPrompt('');
      setFiles([]);
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro inesperado');
    } finally {
      setSubmitting(false);
    }
  }

  async function retry(id: string) {
    const res = await fetch(`/api/marketing/videos/${id}/retry`, { method: 'POST' });
    if (!res.ok) return toast.error('Não foi possível tentar de novo');
    void load();
  }

  async function remove(v: MarketingVideo) {
    if (!confirm('Excluir este vídeo?')) return;
    const paths = [...v.image_paths, v.video_path, v.poster_path].filter((p): p is string => Boolean(p));
    if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
    const { error } = await supabase.from('marketing_videos').delete().eq('id', v.id);
    if (error) return toast.error(error.message);
    setVideos((prev) => prev.filter((x) => x.id !== v.id));
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Marketing</h1>
        <p className="text-sm text-muted-foreground">Vídeos curtos (15–25 s) gerados com IA a partir de um texto e suas fotos.</p>
      </div>

      {hasStalePending(videos, Date.now()) && (
        <div className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4" />
          Há vídeos na fila há mais de 10 minutos. O worker está rodando? (veja docs/worker.md)
        </div>
      )}

      <form onSubmit={submit} className="space-y-3 rounded-lg border p-4">
        <textarea
          className="min-h-24 w-full rounded-md border bg-background p-2 text-sm"
          placeholder="Ex: Promoção de corte + barba por R$ 50 nesta sexta, Barbearia do Alemão, Santos."
          value={prompt} maxLength={1000} required
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <input type="file" accept={IMAGE_TYPES.join(',')} multiple onChange={(e) => pickFiles(e.target.files)} />
          <select className="h-9 rounded-md border bg-background px-2" value={format} onChange={(e) => setFormat(e.target.value as VideoFormat)}>
            {FORMATS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <select className="h-9 rounded-md border bg-background px-2" value={tone} onChange={(e) => setTone(e.target.value as VideoTone)}>
            {TONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <Button type="submit" disabled={!canEdit || submitting}>
            {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
            Gerar vídeo
          </Button>
        </div>
        {files.length > 0 && <p className="text-xs text-muted-foreground">{files.map((f) => f.name).join(', ')}</p>}
      </form>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {videos.map((v) => (
          <div key={v.id} className="space-y-2 rounded-lg border p-3">
            {v.status === 'done' && urls[v.id]?.video ? (
              <video className="w-full rounded" src={urls[v.id].video} poster={urls[v.id].poster} controls preload="none" />
            ) : (
              <div className="flex aspect-video items-center justify-center rounded bg-muted text-sm">
                {JOB_LABEL[v.status]}
              </div>
            )}
            <p className="line-clamp-2 text-sm">{v.prompt}</p>
            {v.status === 'failed' && <p className="text-xs text-destructive line-clamp-3">{v.error}</p>}
            <div className="flex gap-2">
              {v.status === 'done' && urls[v.id]?.video && (
                <a className="text-sm underline" href={urls[v.id].video} download>
                  <Download className="mr-1 inline h-4 w-4" />Baixar
                </a>
              )}
              {v.status === 'failed' && (
                <Button size="sm" variant="outline" disabled={!canEdit} onClick={() => retry(v.id)}>
                  <RotateCcw className="mr-1 h-4 w-4" />Tentar de novo
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={!canEdit || v.status === 'running'} onClick={() => remove(v)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm run lint && npx vitest run` — Expected: pass.

In the browser preview, open `/marketing`, upload one small JPG with a prompt, submit. Confirm a "Na fila" card appears and the file exists (`execute_sql`: `select name from storage.objects where bucket_id='marketing' order by created_at desc limit 1`). Leave this job in place: Task 7 uses it as the first real render.

- [ ] **Step 8: Commit**

```bash
git add src/lib/marketing/validate.ts src/lib/marketing/validate.test.ts src/app/api/marketing "src/app/(dashboard)/marketing"
git commit -m "feat(marketing): aba Marketing com upload de fotos e fila de vídeos

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Worker core + prospecting job

**Files:**
- Modify: `package.json` (devDependency `tsx`, script `"worker": "tsx --env-file=.env.local worker/index.ts"`)
- Modify: `vitest.config.ts` (`include` gains `"worker/**/*.test.ts"`)
- Create: `worker/exec.ts`, `worker/queue.ts`, `worker/queue.test.ts`, `worker/prospecting.ts`, `worker/prospecting.test.ts`, `worker/index.ts`

**Interfaces:**
- Consumes: `parseScraperOutput`, `mapPlaceToLead` (Task 2).
- Produces:
  - `runCommand(cmd: string, args: string[], opts: { cwd?: string; timeoutMs: number }): Promise<{ code: number; stdout: string; stderr: string }>`
  - `type JobTable = 'lead_searches' | 'marketing_videos'`
  - `claimNext<T>(db: SupabaseClient, table: JobTable): Promise<T | null>`
  - `finishJob(db, table, id, patch: Record<string, unknown>): Promise<void>` (sets `finished_at`)
  - `failJob(db, table, id, message: string): Promise<void>` (status `failed`, error truncated to 2000 chars)
  - `requeueStale(db, table, olderThanMs = 30 * 60 * 1000): Promise<number>`
  - `runProspectingJob(db, search: LeadSearch, deps?: { scrape?: (query: string, depth: number) => Promise<string> }): Promise<void>`
  - `depthFor(maxResults: number): number`

Before `npm install`: the JFrog plugin asks once per package type whether to route installs through Artifactory. Ask João that question for `npm` before running the install, then proceed with whatever he answers.

- [ ] **Step 1: Install and configure**

```bash
npm install --save-dev tsx
```

Add to `package.json` scripts: `"worker": "tsx --env-file=.env.local worker/index.ts"`. In `vitest.config.ts` change `include` to `["src/**/*.test.ts", "src/**/*.test.tsx", "worker/**/*.test.ts"]`.

Confirm `.env.local` has `SUPABASE_SERVICE_ROLE_KEY` and `NEXT_PUBLIC_SUPABASE_URL` (print only whether they are set: `grep -c "^SUPABASE_SERVICE_ROLE_KEY=." .env.local`).

- [ ] **Step 2: Write `worker/exec.ts`** (no test — thin wrapper over `child_process`)

```ts
import { spawn } from 'node:child_process';

export function runCommand(
  cmd: string,
  args: string[],
  opts: { cwd?: string; timeoutMs: number },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${cmd} passou do tempo limite (${Math.round(opts.timeoutMs / 60000)} min)`));
    }, opts.timeoutMs);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}
```

- [ ] **Step 3: Write failing tests for the queue** (covers Review Focus #4)

`worker/queue.test.ts` — uses a tiny in-memory fake of the supabase-js chain:

```ts
import { describe, expect, it } from 'vitest';
import { claimNext, failJob, finishJob, requeueStale } from './queue';

type Row = Record<string, unknown> & { id: string; status: string; created_at: string; started_at?: string | null };

function fakeDb(rows: Row[]) {
  const db = {
    rows,
    from() {
      const filters: Array<(r: Row) => boolean> = [];
      let patch: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        update: (p: Record<string, unknown>) => { patch = p; return q; },
        eq: (col: string, v: unknown) => { filters.push((r) => r[col] === v); return q; },
        lt: (col: string, v: string) => { filters.push((r) => typeof r[col] === 'string' && (r[col] as string) < v); return q; },
        order: () => q,
        limit: () => q,
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          let matched = rows.filter((r) => filters.every((f) => f(r)))
            .sort((a, b) => a.created_at.localeCompare(b.created_at));
          if (patch) { for (const r of matched) Object.assign(r, patch); }
          else matched = matched.slice(0, 1);
          resolve({ data: matched, error: null });
        },
      };
      return q;
    },
  };
  return db as unknown as Parameters<typeof claimNext>[0] & { rows: Row[] };
}

describe('queue', () => {
  it('claims the oldest pending job and marks it running', async () => {
    const db = fakeDb([
      { id: 'b', status: 'pending', created_at: '2026-09-29T10:02:00Z' },
      { id: 'a', status: 'pending', created_at: '2026-09-29T10:01:00Z' },
    ]);
    const job = await claimNext<Row>(db, 'lead_searches');
    expect(job?.id).toBe('a');
    expect(db.rows.find((r) => r.id === 'a')?.status).toBe('running');
    expect(db.rows.find((r) => r.id === 'b')?.status).toBe('pending');
  });
  it('returns null when nothing is pending', async () => {
    expect(await claimNext(fakeDb([{ id: 'a', status: 'done', created_at: 'x' }]), 'lead_searches')).toBeNull();
  });
  it('requeues jobs running for more than 30 minutes', async () => {
    const old = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    const fresh = new Date().toISOString();
    const db = fakeDb([
      { id: 'old', status: 'running', created_at: 'x', started_at: old },
      { id: 'new', status: 'running', created_at: 'y', started_at: fresh },
    ]);
    await requeueStale(db, 'marketing_videos');
    expect(db.rows.find((r) => r.id === 'old')?.status).toBe('pending');
    expect(db.rows.find((r) => r.id === 'new')?.status).toBe('running');
  });
  it('fail and finish set status and finished_at', async () => {
    const db = fakeDb([
      { id: 'a', status: 'running', created_at: 'x' },
      { id: 'b', status: 'running', created_at: 'y' },
    ]);
    await failJob(db, 'lead_searches', 'a', 'x'.repeat(3000));
    await finishJob(db, 'lead_searches', 'b', { result_count: 3 });
    const a = db.rows.find((r) => r.id === 'a')!;
    const b = db.rows.find((r) => r.id === 'b')!;
    expect(a.status).toBe('failed');
    expect((a.error as string).length).toBe(2000);
    expect(b).toMatchObject({ status: 'done', result_count: 3 });
    expect(b.finished_at).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run and see it fail** — `npx vitest run worker/queue.test.ts` — Expected: FAIL.

- [ ] **Step 5: Implement `worker/queue.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

export type JobTable = 'lead_searches' | 'marketing_videos';

export async function claimNext<T>(db: SupabaseClient, table: JobTable): Promise<T | null> {
  const { data: candidates } = await db
    .from(table).select('id').eq('status', 'pending').order('created_at', { ascending: true }).limit(1);
  const next = candidates?.[0];
  if (!next) return null;
  // Conditional update: if another worker (or a retry) changed the row,
  // zero rows match and we skip it.
  const { data: claimed } = await db
    .from(table)
    .update({ status: 'running', started_at: new Date().toISOString(), error: null })
    .eq('id', next.id)
    .eq('status', 'pending')
    .select();
  return (claimed?.[0] as T | undefined) ?? null;
}

export async function finishJob(
  db: SupabaseClient, table: JobTable, id: string, patch: Record<string, unknown>,
): Promise<void> {
  await db.from(table).update({ ...patch, status: 'done', finished_at: new Date().toISOString() }).eq('id', id);
}

export async function failJob(db: SupabaseClient, table: JobTable, id: string, message: string): Promise<void> {
  await db.from(table)
    .update({ status: 'failed', error: message.slice(0, 2000), finished_at: new Date().toISOString() })
    .eq('id', id);
}

export async function requeueStale(
  db: SupabaseClient, table: JobTable, olderThanMs = 30 * 60 * 1000,
): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const { data } = await db
    .from(table)
    .update({ status: 'pending', started_at: null })
    .eq('status', 'running')
    .lt('started_at', cutoff)
    .select();
  return data?.length ?? 0;
}
```

Run: `npx vitest run worker/queue.test.ts` — Expected: PASS.

- [ ] **Step 6: Write failing tests for the prospecting job** (covers Review Focus #2)

`worker/prospecting.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { depthFor, runProspectingJob } from './prospecting';
import type { LeadSearch } from '@/types';

const search = {
  id: 's-1', account_id: 'acc-1', query: 'barbearia', location: 'Santos, SP', max_results: 2,
} as LeadSearch;

function fakeDb() {
  const calls = { upsert: [] as unknown[][], update: [] as Record<string, unknown>[] };
  const db = {
    from(table: string) {
      return {
        upsert(rows: unknown[], opts: unknown) {
          calls.upsert.push([table, rows, opts]);
          // Pretend one of the rows already existed: only the first comes back.
          return { select: async () => ({ data: rows.slice(0, 1), error: null }) };
        },
        update(patch: Record<string, unknown>) {
          calls.update.push(patch);
          return { eq: async () => ({ error: null }) };
        },
      };
    },
  };
  return { db: db as never, calls };
}

const places = JSON.stringify([
  { title: 'A', place_id: 'p1', phone: '(13) 99123-4567' },
  { title: 'B', place_id: 'p2' },
  { title: 'C', place_id: 'p3' },
]);

describe('depthFor', () => {
  it('scales scroll depth with the requested count', () => {
    expect(depthFor(1)).toBe(1);
    expect(depthFor(50)).toBe(5);
    expect(depthFor(200)).toBe(10);
  });
});

describe('runProspectingJob', () => {
  it('scrapes "<query> em <location>", truncates to max_results, upserts ignoring duplicates, finishes with new count', async () => {
    const { db, calls } = fakeDb();
    const scrape = vi.fn().mockResolvedValue(places);
    await runProspectingJob(db, search, { scrape });
    expect(scrape).toHaveBeenCalledWith('barbearia em Santos, SP', 1);
    const [table, rows, opts] = calls.upsert[0] as [string, { place_id: string }[], unknown];
    expect(table).toBe('leads');
    expect(rows.map((r) => r.place_id)).toEqual(['p1', 'p2']);
    expect(opts).toEqual({ onConflict: 'account_id,place_id', ignoreDuplicates: true });
    expect(calls.update.at(-1)).toMatchObject({ status: 'done', result_count: 1 });
  });
  it('finishes with 0 when the scraper finds nothing', async () => {
    const { db, calls } = fakeDb();
    await runProspectingJob(db, search, { scrape: async () => '' });
    expect(calls.upsert).toHaveLength(0);
    expect(calls.update.at(-1)).toMatchObject({ status: 'done', result_count: 0 });
  });
  it('fails the job with a readable error when the scraper throws', async () => {
    const { db, calls } = fakeDb();
    await runProspectingJob(db, search, { scrape: async () => { throw new Error('docker: not found'); } });
    expect(calls.update.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('docker: not found') });
  });
});
```

- [ ] **Step 7: Run and see it fail** — Expected: FAIL.

- [ ] **Step 8: Implement `worker/prospecting.ts`**

```ts
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapPlaceToLead, parseScraperOutput } from '@/lib/prospecting/map-scraper';
import type { LeadSearch } from '@/types';
import { runCommand } from './exec';
import { failJob, finishJob } from './queue';

const SCRAPER_IMAGE = 'gosom/google-maps-scraper';
const SCRAPE_TIMEOUT_MS = 20 * 60 * 1000;

export function depthFor(maxResults: number): number {
  return Math.min(10, Math.max(1, Math.ceil(maxResults / 10)));
}

// Runs one query through the scraper container and returns its JSON output.
export async function scrapeWithDocker(queryLine: string, depth: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'gmaps-'));
  try {
    await writeFile(join(dir, 'queries.txt'), `${queryLine}\n`);
    const { code, stderr } = await runCommand('docker', [
      'run', '--rm',
      '-v', 'gmaps-playwright-cache:/opt',
      '-v', `${dir}:/work`,
      SCRAPER_IMAGE,
      '-input', '/work/queries.txt',
      '-results', '/work/results.json',
      '-json', '-email', '-lang', 'pt',
      '-depth', String(depth),
      '-exit-on-inactivity', '2m',
    ], { timeoutMs: SCRAPE_TIMEOUT_MS });
    if (code !== 0) throw new Error(`Scraper saiu com código ${code}: ${stderr.slice(-800)}`);
    return await readFile(join(dir, 'results.json'), 'utf8').catch(() => '');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function runProspectingJob(
  db: SupabaseClient,
  search: LeadSearch,
  deps: { scrape?: (queryLine: string, depth: number) => Promise<string> } = {},
): Promise<void> {
  const scrape = deps.scrape ?? scrapeWithDocker;
  try {
    const output = await scrape(`${search.query} em ${search.location}`, depthFor(search.max_results));
    const rows = parseScraperOutput(output)
      .slice(0, search.max_results)
      .map((p) => mapPlaceToLead(p, { accountId: search.account_id, searchId: search.id }));

    let inserted = 0;
    if (rows.length > 0) {
      const { data, error } = await db
        .from('leads')
        .upsert(rows, { onConflict: 'account_id,place_id', ignoreDuplicates: true })
        .select('id');
      if (error) throw new Error(`Falha ao salvar leads: ${error.message}`);
      inserted = data?.length ?? 0;
    }
    await finishJob(db, 'lead_searches', search.id, { result_count: inserted });
  } catch (err) {
    await failJob(db, 'lead_searches', search.id, err instanceof Error ? err.message : String(err));
  }
}
```

Run: `npx vitest run worker` — Expected: PASS.

- [ ] **Step 9: Write the loop** `worker/index.ts` (video job is wired in Task 7; for now only prospecting)

```ts
import { createClient } from '@supabase/supabase-js';
import type { LeadSearch } from '@/types';
import { claimNext, requeueStale } from './queue';
import { runProspectingJob } from './prospecting';

const POLL_MS = 5000;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} no .env.local`);
  return v;
}

const db = createClient(requireEnv('NEXT_PUBLIC_SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
});

let stopping = false;
process.on('SIGINT', () => { stopping = true; console.log('\nParando depois do job atual…'); });

async function tick(): Promise<boolean> {
  const search = await claimNext<LeadSearch>(db, 'lead_searches');
  if (search) {
    console.log(`[prospecção] ${search.query} em ${search.location}`);
    await runProspectingJob(db, search);
    return true;
  }
  return false;
}

async function main() {
  const a = await requeueStale(db, 'lead_searches');
  const b = await requeueStale(db, 'marketing_videos');
  if (a + b > 0) console.log(`Devolvidos à fila: ${a + b} job(s) travados`);
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

- [ ] **Step 10: Real end-to-end check**

1. In the browser, create a search "barbearia" / "Santos, SP" / 10 on `/prospeccao`.
2. Run `npm run worker`. Expected log: `[prospecção] barbearia em Santos, SP`, then the chip turns "Concluída (N novos)" within a few minutes and leads show with scores.
3. Create the same search again and run the worker: expected "Concluída (0 novos)" or a small number — no duplicate rows (`select place_id, count(*) from leads group by 1 having count(*) > 1` returns nothing).
4. Click "Promover" on a lead with phone: a contact appears in `/contacts`.
5. Stop the worker with Ctrl+C.

- [ ] **Step 11: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint && npx vitest run` — Expected: pass.

```bash
git add package.json package-lock.json vitest.config.ts worker/exec.ts worker/queue.ts worker/queue.test.ts worker/prospecting.ts worker/prospecting.test.ts worker/index.ts
git commit -m "feat(worker): fila local e job de prospecção com google-maps-scraper

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Video job — Claude composition, check/fix loop, render, upload

**Files:**
- Modify: `package.json` (devDependency `hyperframes`)
- Create: `worker/prompts/` (vendored guidance + `NOTICE.md`), `worker/video-scaffold/` (files from `hyperframes init`)
- Create: `src/lib/marketing/prompt.ts`, `src/lib/marketing/prompt.test.ts`
- Create: `worker/video.ts`, `worker/video.test.ts`
- Modify: `worker/index.ts` (process video jobs after prospecting)

**Interfaces:**
- Consumes: `claimNext`, `finishJob`, `failJob` (Task 6); `runCommand` (Task 6); `MarketingVideo` (Task 1).
- Produces:
  - `FORMAT_SIZE: Record<VideoFormat, { width: number; height: number }>`
  - `buildUserPrompt(input: { prompt: string; format: VideoFormat; tone: VideoTone; imageFiles: string[] }): string`
  - `buildFixPrompt(checkOutput: string): string`
  - `extractHtml(text: string): string | null`
  - `runVideoJob(db, video: MarketingVideo, deps?: Partial<VideoDeps>): Promise<void>`
  - `interface VideoDeps { compose(messages: ChatMessage[]): Promise<string>; check(dir: string): Promise<{ ok: boolean; output: string }>; render(dir: string, out: string): Promise<void>; poster(video: string, out: string): Promise<void>; }`

Before writing Claude API code, read the `claude-api` skill and use the model it recommends for long-form code generation; this plan assumes `claude-sonnet-5-5` with `max_tokens: 16000`. Add `ANTHROPIC_API_KEY` to `.env.local` if it is not set there (ask João for the value; never print it).

- [ ] **Step 1: Install HyperFrames and capture the scaffold**

```bash
npm install --save-dev hyperframes
cd /tmp && rm -rf hf-probe && npx hyperframes init hf-probe && ls -la hf-probe && cd -
```

If `init` is interactive, run `npx hyperframes init --help` and pass the flags that make it non-interactive. Copy every file it creates **except** `index.html` into `worker/video-scaffold/`. Then run `npx hyperframes doctor` and confirm Chrome and FFmpeg are detected.

- [ ] **Step 2: Vendor the guidance**

Copy into `worker/prompts/`:
- `hyperframes-core.md` ← `~/.claude/plugins/cache/claude-plugins-official/hyperframes/0.8.61/skills/hyperframes-core/SKILL.md`
- `brag-tones.md` ← `~/.claude/plugins/cache/brag/brag/0.4.0/skills/brag/references/tones.md`
- `brag-rules.md` ← the "Creative laws" section (from `## Creative laws` to the end) of `~/.claude/plugins/cache/brag/brag/0.4.0/skills/brag/SKILL.md`

Create `worker/prompts/NOTICE.md`:

```md
Guidance vendored for the video worker's system prompt.

- hyperframes-core.md — HyperFrames (https://github.com/heygen-com/hyperframes), Apache-2.0, © HeyGen.
- brag-tones.md, brag-rules.md — /brag skill v0.4.0, MIT, © 2026 Shunit Haviv Hakimi.

Refresh by copying the same files from a newer plugin install.
```

If `hyperframes-core.md` links to `references/*.md` files that define composition structure or the timeline/animation contract, copy those too and list them in `NOTICE.md`.

- [ ] **Step 3: Write failing tests for `prompt.ts`**

`src/lib/marketing/prompt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { FORMAT_SIZE, buildFixPrompt, buildUserPrompt, extractHtml } from './prompt';

describe('buildUserPrompt', () => {
  it('includes the brief, canvas size, tone and image files', () => {
    const p = buildUserPrompt({
      prompt: 'Promo corte + barba R$ 50', format: 'vertical', tone: 'polished',
      imageFiles: ['assets/img-1.jpg', 'assets/img-2.png'],
    });
    expect(p).toContain('Promo corte + barba R$ 50');
    expect(p).toContain('1080x1920');
    expect(p).toContain('polished');
    expect(p).toContain('assets/img-1.jpg');
    expect(p).toContain('assets/img-2.png');
  });
  it('says there are no images when none were sent', () => {
    expect(buildUserPrompt({ prompt: 'a', format: 'square', tone: 'default', imageFiles: [] }))
      .toContain('Nenhuma foto');
  });
});

describe('FORMAT_SIZE', () => {
  it('maps formats to canvas sizes', () => {
    expect(FORMAT_SIZE.landscape).toEqual({ width: 1920, height: 1080 });
  });
});

describe('extractHtml', () => {
  it('extracts the fenced html block', () => {
    expect(extractHtml('texto\n```html\n<html><body>x</body></html>\n```\nfim'))
      .toBe('<html><body>x</body></html>');
  });
  it('accepts a bare html document', () => {
    expect(extractHtml('<!doctype html><html></html>')).toBe('<!doctype html><html></html>');
  });
  it('returns null when there is no html', () => {
    expect(extractHtml('Desculpe, não posso.')).toBeNull();
  });
});

describe('buildFixPrompt', () => {
  it('embeds the tail of the check output', () => {
    const p = buildFixPrompt('a'.repeat(10000) + 'ERRO FINAL');
    expect(p).toContain('ERRO FINAL');
    expect(p.length).toBeLessThan(7000);
  });
});
```

- [ ] **Step 4: Run and see it fail**, then **implement** `src/lib/marketing/prompt.ts`:

```ts
import type { VideoFormat, VideoTone } from '@/types';

export const FORMAT_SIZE: Record<VideoFormat, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1920, height: 1080 },
};

export function buildUserPrompt(input: {
  prompt: string; format: VideoFormat; tone: VideoTone; imageFiles: string[];
}): string {
  const { width, height } = FORMAT_SIZE[input.format];
  const images = input.imageFiles.length
    ? input.imageFiles.map((f) => `- ${f}`).join('\n')
    : 'Nenhuma foto enviada: use tipografia, formas e cor.';
  return [
    'Crie um vídeo promocional curto para um negócio local brasileiro.',
    '',
    `Briefing do cliente: ${input.prompt}`,
    `Tela: ${width}x${height}. Duração total: entre 15 e 25 segundos.`,
    `Tom: ${input.tone} (veja as definições de tom).`,
    'Fotos disponíveis (caminhos relativos ao projeto; use todas pelo menos uma vez):',
    images,
    '',
    'Todo texto na tela em português do Brasil. Preços, endereços e nomes exatamente como no briefing.',
    'Sem áudio. Sem fontes ou imagens externas além das fotos listadas.',
    'Responda com UM bloco ```html contendo o index.html completo da composição HyperFrames, e nada mais.',
  ].join('\n');
}

export function buildFixPrompt(checkOutput: string): string {
  return [
    'O `npx hyperframes check` falhou com a saída abaixo. Corrija a composição.',
    'Responda de novo com UM bloco ```html contendo o index.html completo.',
    '',
    '```',
    checkOutput.slice(-6000),
    '```',
  ].join('\n');
}

export function extractHtml(text: string): string | null {
  const fenced = text.match(/```html\s*\n([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const trimmed = text.trim();
  if (/^<!doctype html|^<html/i.test(trimmed)) return trimmed;
  return null;
}
```

Run: `npx vitest run src/lib/marketing` — Expected: PASS.

- [ ] **Step 5: Write failing tests for `worker/video.ts`** (covers Review Focus #5)

`worker/video.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { runVideoJob } from './video';
import type { MarketingVideo } from '@/types';

const video = {
  id: 'v-1', account_id: 'acc-1', prompt: 'Promo', image_paths: ['account-acc-1/uploads/1-a.jpg'],
  format: 'vertical', tone: 'default',
} as MarketingVideo;

const HTML = '```html\n<!doctype html><html><body>ok</body></html>\n```';

function fakeDb() {
  const updates: Record<string, unknown>[] = [];
  const uploads: string[] = [];
  const db = {
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null }),
        upload: async (path: string) => { uploads.push(path); return { error: null }; },
      }),
    },
    from: () => ({
      update: (patch: Record<string, unknown>) => { updates.push(patch); return { eq: async () => ({ error: null }) }; },
    }),
  };
  return { db: db as never, updates, uploads };
}

function deps(over: Record<string, unknown> = {}) {
  return {
    compose: vi.fn().mockResolvedValue(HTML),
    check: vi.fn().mockResolvedValue({ ok: true, output: '' }),
    render: vi.fn().mockResolvedValue(undefined),
    poster: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(Buffer.from('mp4')),
    ...over,
  };
}

describe('runVideoJob', () => {
  it('composes, checks, renders, uploads and finishes', async () => {
    const { db, updates, uploads } = fakeDb();
    const d = deps();
    await runVideoJob(db, video, d);
    expect(d.compose).toHaveBeenCalledTimes(1);
    expect(d.render).toHaveBeenCalledTimes(1);
    expect(uploads).toEqual(['account-acc-1/videos/v-1.mp4', 'account-acc-1/videos/v-1.jpg']);
    expect(updates.at(-1)).toMatchObject({
      status: 'done', video_path: 'account-acc-1/videos/v-1.mp4', poster_path: 'account-acc-1/videos/v-1.jpg',
    });
  });
  it('sends check errors back to Claude and succeeds on the second try', async () => {
    const { db, updates } = fakeDb();
    const d = deps({
      check: vi.fn()
        .mockResolvedValueOnce({ ok: false, output: 'lint: missing data-duration' })
        .mockResolvedValueOnce({ ok: true, output: '' }),
    });
    await runVideoJob(db, video, d);
    expect(d.compose).toHaveBeenCalledTimes(2);
    const secondCallMessages = d.compose.mock.calls[1][0] as { content: string }[];
    expect(secondCallMessages.at(-1)?.content).toContain('missing data-duration');
    expect(updates.at(-1)).toMatchObject({ status: 'done' });
  });
  it('fails after the first attempt plus 2 fixes, with the last check output', async () => {
    const { db, updates } = fakeDb();
    const d = deps({ check: vi.fn().mockResolvedValue({ ok: false, output: 'still broken' }) });
    await runVideoJob(db, video, d);
    expect(d.compose).toHaveBeenCalledTimes(3);
    expect(d.render).not.toHaveBeenCalled();
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('still broken') });
  });
  it('fails cleanly when Claude returns no html', async () => {
    const { db, updates } = fakeDb();
    const d = deps({ compose: vi.fn().mockResolvedValue('Não consigo ajudar com isso.') });
    await runVideoJob(db, video, d);
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('HTML') });
  });
  it('fails cleanly when rendering throws', async () => {
    const { db, updates } = fakeDb();
    const d = deps({ render: vi.fn().mockRejectedValue(new Error('ffmpeg crashed')) });
    await runVideoJob(db, video, d);
    expect(updates.at(-1)).toMatchObject({ status: 'failed', error: expect.stringContaining('ffmpeg crashed') });
  });
});
```

- [ ] **Step 6: Run and see it fail** — Expected: FAIL.

- [ ] **Step 7: Implement `worker/video.ts`**

```ts
import { cp, mkdir, mkdtemp, readFile as fsReadFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildFixPrompt, buildUserPrompt, extractHtml } from '@/lib/marketing/prompt';
import type { MarketingVideo } from '@/types';
import { runCommand } from './exec';
import { failJob, finishJob } from './queue';

const BUCKET = 'marketing';
const MAX_FIX_ROUNDS = 2;
const MODEL = 'claude-sonnet-5-5';
// The worker always runs from the repo root (`npm run worker`).
const SCAFFOLD_DIR = join(process.cwd(), 'worker', 'video-scaffold');
const PROMPTS_DIR = join(process.cwd(), 'worker', 'prompts');

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface VideoDeps {
  compose(messages: ChatMessage[]): Promise<string>;
  check(dir: string): Promise<{ ok: boolean; output: string }>;
  render(dir: string, out: string): Promise<void>;
  poster(video: string, out: string): Promise<void>;
  readFile(path: string): Promise<Buffer>;
}

let systemPromptCache: string | null = null;
async function systemPrompt(): Promise<string> {
  if (systemPromptCache) return systemPromptCache;
  const [core, tones, rules] = await Promise.all(
    ['hyperframes-core.md', 'brag-tones.md', 'brag-rules.md'].map((f) => fsReadFile(join(PROMPTS_DIR, f), 'utf8')),
  );
  systemPromptCache = [
    'Você é um motion designer que escreve composições HyperFrames (HTML → vídeo).',
    'Siga estritamente a referência do HyperFrames abaixo e as regras criativas.',
    '# Referência HyperFrames', core,
    '# Tons', tones,
    '# Regras criativas', rules,
  ].join('\n\n');
  return systemPromptCache;
}

const defaultDeps: VideoDeps = {
  async compose(messages) {
    const client = new Anthropic();
    const res = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: await systemPrompt(),
      messages,
    });
    return res.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
  },
  async check(dir) {
    const r = await runCommand('npx', ['hyperframes', 'check'], { cwd: dir, timeoutMs: 5 * 60 * 1000 });
    return { ok: r.code === 0, output: `${r.stdout}\n${r.stderr}` };
  },
  async render(dir, out) {
    const r = await runCommand('npx', ['hyperframes', 'render', '--quality', 'looks', '--output', out], {
      cwd: dir, timeoutMs: 15 * 60 * 1000,
    });
    if (r.code !== 0) throw new Error(`Render falhou: ${r.stderr.slice(-800)}`);
  },
  async poster(video, out) {
    const r = await runCommand('ffmpeg', ['-y', '-ss', '1', '-i', video, '-frames:v', '1', out], {
      timeoutMs: 60 * 1000,
    });
    if (r.code !== 0) throw new Error(`Poster falhou: ${r.stderr.slice(-400)}`);
  },
  readFile: (p) => fsReadFile(p),
};

export async function runVideoJob(
  db: SupabaseClient, video: MarketingVideo, overrides: Partial<VideoDeps> = {},
): Promise<void> {
  const deps = { ...defaultDeps, ...overrides };
  const dir = await mkdtemp(join(tmpdir(), 'hf-'));
  try {
    // Scaffold may be empty in tests; the real one comes from Step 1.
    await cp(SCAFFOLD_DIR, dir, { recursive: true }).catch(() => undefined);
    await mkdir(join(dir, 'assets'), { recursive: true });

    const imageFiles: string[] = [];
    for (const [i, path] of video.image_paths.entries()) {
      const { data, error } = await db.storage.from(BUCKET).download(path);
      if (error || !data) throw new Error(`Não consegui baixar a foto ${i + 1}`);
      const rel = `assets/img-${i + 1}${extname(path) || '.jpg'}`;
      await writeFile(join(dir, rel), Buffer.from(await data.arrayBuffer()));
      imageFiles.push(rel);
    }

    const messages: ChatMessage[] = [{
      role: 'user',
      content: buildUserPrompt({ prompt: video.prompt, format: video.format, tone: video.tone, imageFiles }),
    }];

    let lastCheck = '';
    let passed = false;
    for (let attempt = 0; attempt <= MAX_FIX_ROUNDS; attempt++) {
      const reply = await deps.compose(messages);
      const html = extractHtml(reply);
      if (!html) throw new Error('A IA não devolveu um HTML de composição');
      await writeFile(join(dir, 'index.html'), html);
      const result = await deps.check(dir);
      if (result.ok) { passed = true; break; }
      lastCheck = result.output;
      messages.push({ role: 'assistant', content: reply }, { role: 'user', content: buildFixPrompt(result.output) });
    }
    if (!passed) throw new Error(`Composição inválida depois de ${MAX_FIX_ROUNDS + 1} tentativas: ${lastCheck.slice(-1500)}`);

    const mp4 = join(dir, 'out.mp4');
    const jpg = join(dir, 'poster.jpg');
    await deps.render(dir, mp4);
    await deps.poster(mp4, jpg);

    const base = `account-${video.account_id}/videos/${video.id}`;
    const up1 = await db.storage.from(BUCKET).upload(`${base}.mp4`, await deps.readFile(mp4), { contentType: 'video/mp4', upsert: true });
    if (up1.error) throw new Error(`Upload do vídeo falhou: ${up1.error.message}`);
    const up2 = await db.storage.from(BUCKET).upload(`${base}.jpg`, await deps.readFile(jpg), { contentType: 'image/jpeg', upsert: true });
    if (up2.error) throw new Error(`Upload do poster falhou: ${up2.error.message}`);

    await finishJob(db, 'marketing_videos', video.id, { video_path: `${base}.mp4`, poster_path: `${base}.jpg` });
  } catch (err) {
    await failJob(db, 'marketing_videos', video.id, err instanceof Error ? err.message : String(err));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

Run: `npx vitest run worker src/lib/marketing` — Expected: PASS.

- [ ] **Step 8: Wire into the loop** — in `worker/index.ts`, import `runVideoJob` and `MarketingVideo`, and extend `tick()` after the prospecting branch:

```ts
  const video = await claimNext<MarketingVideo>(db, 'marketing_videos');
  if (video) {
    console.log(`[marketing] ${video.prompt.slice(0, 60)}`);
    await runVideoJob(db, video);
    return true;
  }
  return false;
```

Also add `requireEnv('ANTHROPIC_API_KEY')` at startup so a missing key fails fast with a clear message.

- [ ] **Step 9: Real end-to-end render**

Run `npm run worker` with the pending job from Task 5 Step 7. Expected: log `[marketing] …`, then the card on `/marketing` shows a playable video within ~5–10 minutes. Download it and check with `ffprobe -v error -show_entries format=duration -of csv=p=0 <file>` that duration is between 15 and 25 s. Look at the poster/video: the uploaded photo appears and Portuguese text is legible. If the output is poor, adjust `buildUserPrompt` wording (keep tests green) — do not loosen the check/fix loop.

- [ ] **Step 10: Typecheck, lint, commit**

Run: `npm run typecheck && npm run lint && npx vitest run` — Expected: pass.

```bash
git add package.json package-lock.json worker/prompts worker/video-scaffold worker/video.ts worker/video.test.ts worker/index.ts src/lib/marketing/prompt.ts src/lib/marketing/prompt.test.ts
git commit -m "feat(worker): geração de vídeo com Claude + HyperFrames (motor do Brag)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Docs and second brain

**Files:**
- Create: `docs/worker.md`
- Modify: `.env.local.example` (worker section)
- Modify: `…/Segundo cérebro/SimpleBrain/wiki/crm-concept.md` (replace the "Em planejamento" section)
- Modify: `…/Segundo cérebro/SimpleBrain/aprendizados/` (relevant topic file, per `aprendizados/README.md`)

- [ ] **Step 1: Write `docs/worker.md`**

```md
# Worker local (Prospecção e Marketing)

As abas Prospecção e Marketing só criam pedidos. Quem processa é o worker,
que roda na máquina da Concept (a Vercel não roda Docker nem Chrome/FFmpeg).

## Requisitos
- Node 22+, Docker Desktop aberto, FFmpeg (`brew install ffmpeg`)
- `.env.local` com `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `ANTHROPIC_API_KEY`

## Rodar
    npm run worker

Ctrl+C para parar (termina o job atual antes). Pedidos feitos com o worker
parado ficam "Na fila" e são processados quando ele voltar. Jobs travados em
"running" por mais de 30 min voltam para a fila na inicialização.

## Custos e limites
- Prospecção: grátis; o Google pode bloquear buscas grandes (use proxy se precisar).
  Uso interno: o scraper viola os termos do Google Maps, e o CRM nunca envia mensagem sozinho.
- Vídeo: custo dos tokens do Claude por vídeo (até 3 chamadas se a composição precisar de correção).

## Mover para um servidor
Rodar o mesmo `npm run worker` num VPS com Docker, Node 22+ e FFmpeg, com as mesmas variáveis.
```

- [ ] **Step 2: Update `.env.local.example`**

Add under the OPTIONAL section (as a comment block, no real values):

```
# ------------------------------------------------------------------
# Worker local (Prospecção/Marketing) — see docs/worker.md
# ------------------------------------------------------------------
# ANTHROPIC_API_KEY=sk-ant-...
```

The existing commented `EVOLUTION_API_KEY=concept_master_evolution_2026` line in that file looks like a real value. Replace it with `EVOLUTION_API_KEY=your-evolution-api-key` and tell João to rotate that key in the Evolution API if it is the one in use.

- [ ] **Step 3: Update the second brain**

Read `wiki/crm-concept.md` first, then replace the "Em planejamento (2026-09-28): Prospecção e Marketing" section with a short "Prospecção e Marketing (uso interno)" section: what each tab does, that the worker must be running on the Mac (`npm run worker`, see `docs/worker.md`), that it replaced Mailerfind (97 €/mês) and Runway, and the Google ToS risk. Keep the voice rules in `SimpleBrain/CLAUDE.md`. Add any reusable lesson found during implementation to the matching `aprendizados/*.md` file in the format of `aprendizados/README.md`.

- [ ] **Step 4: Commit (CRM repo only; the second brain is not a git repo)**

```bash
git add docs/worker.md .env.local.example
git commit -m "docs: como rodar o worker de prospecção e marketing

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
