'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

// Plural is only for the summary sentence ("Buscar 50 barbearias em Santos").
const NICHES = [
  { query: 'barbearia', plural: 'barbearias' },
  { query: 'salão de beleza', plural: 'salões de beleza' },
  { query: 'clínica de estética', plural: 'clínicas de estética' },
  { query: 'dentista', plural: 'dentistas' },
  { query: 'advogado', plural: 'advogados' },
  { query: 'imobiliária', plural: 'imobiliárias' },
  { query: 'academia', plural: 'academias' },
  { query: 'restaurante', plural: 'restaurantes' },
  { query: 'pet shop', plural: 'pet shops' },
  { query: 'oficina mecânica', plural: 'oficinas mecânicas' },
] as const;

const CITIES = [
  'Santos, SP', 'São Vicente, SP', 'Guarujá, SP', 'Praia Grande, SP', 'Cubatão, SP',
  'Bertioga, SP', 'Mongaguá, SP', 'Itanhaém, SP', 'Peruíbe, SP', 'São Paulo, SP',
];

const AMOUNTS = [20, 50, 100, 200] as const;

export interface SearchInput {
  query: string;
  location: string;
  maxResults: number;
}

interface Props {
  disabled: boolean;
  onSubmit: (input: SearchInput) => Promise<boolean>;
}

export function SearchForm({ disabled, onSubmit }: Props) {
  const [niche, setNiche] = useState<string>(NICHES[0].query);
  const [custom, setCustom] = useState('');
  const [city, setCity] = useState(CITIES[0]);
  const [district, setDistrict] = useState('');
  const [amount, setAmount] = useState<number>(50);
  const [submitting, setSubmitting] = useState(false);

  const isCustom = niche === 'outro';
  const query = (isCustom ? custom : niche).trim();
  const location = (district.trim() ? `${district.trim()}, ${city}` : city).trim();
  const plural = NICHES.find((n) => n.query === niche)?.plural ?? `"${query}"`;
  const ready = query.length > 0 && city.trim().length > 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    const ok = await onSubmit({ query, location, maxResults: amount });
    setSubmitting(false);
    if (ok && isCustom) setCustom('');
  }

  return (
    <form onSubmit={submit} className="space-y-5 rounded-xl border bg-card p-5">
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">1. Que tipo de negócio?</legend>
        <div className="flex flex-wrap gap-2">
          {[...NICHES.map((n) => n.query), 'outro'].map((q) => (
            <button
              key={q}
              type="button"
              aria-pressed={niche === q}
              onClick={() => setNiche(q)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm capitalize transition-colors',
                niche === q ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {q === 'outro' ? 'Outro…' : q}
            </button>
          ))}
        </div>
        {isCustom && (
          <Input
            autoFocus
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Ex.: escola de inglês, contabilidade…"
            maxLength={120}
            className="max-w-sm"
          />
        )}
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium sm:col-span-2">2. Onde?</legend>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Cidade
          <Input list="prospect-cities" value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} required />
          <datalist id="prospect-cities">
            {CITIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </label>
        <label className="flex flex-col gap-1 text-sm text-muted-foreground">
          Bairro (opcional)
          <Input value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="Ex.: Gonzaga" maxLength={40} />
        </label>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">3. Quantos leads?</legend>
        <div className="inline-flex rounded-lg border p-1">
          {AMOUNTS.map((n) => (
            <button
              key={n}
              type="button"
              aria-pressed={amount === n}
              onClick={() => setAmount(n)}
              className={cn(
                'rounded-md px-4 py-1.5 text-sm transition-colors',
                amount === n ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3 border-t pt-4">
        <Button type="submit" size="lg" disabled={disabled || submitting || !ready}>
          <Search className="mr-2 h-4 w-4" />
          {ready ? `Buscar ${amount} ${plural} em ${location}` : 'Escolha o tipo de negócio'}
        </Button>
      </div>
    </form>
  );
}
