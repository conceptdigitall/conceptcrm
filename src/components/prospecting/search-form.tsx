'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Check, Plus, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DEFAULT_CITIES, BAIXADA_SANTISTA_CITIES } from '@/lib/prospecting/cities';

const SearchRadiusMap = dynamic(
  () => import('./search-radius-map').then((mod) => mod.SearchRadiusMap),
  {
    ssr: false,
    loading: () => <div className="h-48 w-full animate-pulse rounded-xl border bg-muted sm:h-60" />,
  },
);

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

const AMOUNTS = [20, 50, 100] as const;

export interface SearchInput {
  query: string;
  location: string;
  maxResults: number;
}

interface Props {
  disabled: boolean;
  /** Uma entrada por cidade: o Google trata "Santos, São Vicente" como um lugar só. */
  onSubmit: (inputs: SearchInput[]) => Promise<boolean>;
}

const chip = (active: boolean) =>
  cn(
    'inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-sm transition-colors',
    active
      ? 'border-primary bg-primary font-medium text-primary-foreground'
      : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
  );

export function SearchForm({ disabled, onSubmit }: Props) {
  const [niche, setNiche] = useState<string>(NICHES[0].query);
  const [custom, setCustom] = useState('');
  const [cities, setCities] = useState<string[]>([DEFAULT_CITIES[0]]);
  const [extraCity, setExtraCity] = useState('');
  const [district, setDistrict] = useState('');
  const [amount, setAmount] = useState<number>(50);
  const [submitting, setSubmitting] = useState(false);

  const isCustom = niche === 'outro';
  const query = (isCustom ? custom : niche).trim();
  const plural = NICHES.find((n) => n.query === niche)?.plural ?? `"${query}"`;
  const singleCity = cities.length === 1;
  const cityOptions = [...DEFAULT_CITIES, ...cities.filter((c) => !DEFAULT_CITIES.includes(c))];
  const ready = query.length > 0 && cities.length > 0;

  function toggleCity(city: string) {
    setCities((prev) =>
      prev.includes(city) ? prev.filter((c) => c !== city) : [...prev, city],
    );
  }

  function addExtraCity() {
    const city = extraCity.trim();
    if (city && !cities.includes(city)) setCities((prev) => [...prev, city]);
    setExtraCity('');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    const inputs = cities.map((city) => ({
      query,
      location: singleCity && district.trim() ? `${district.trim()}, ${city}` : city,
      maxResults: amount,
    }));
    const ok = await onSubmit(inputs);
    setSubmitting(false);
    if (ok && isCustom) setCustom('');
  }

  const where = singleCity ? cities[0] : `${cities.length} cidades`;

  return (
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1fr_minmax(0,22rem)]">
      <div className="min-w-0 space-y-6">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">1. Que tipo de negócio?</legend>
          <div className="flex flex-wrap gap-2">
            {[...NICHES.map((n) => n.query), 'outro'].map((q) => (
              <button key={q} type="button" aria-pressed={niche === q} onClick={() => setNiche(q)} className={cn(chip(niche === q), 'capitalize')}>
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

        <fieldset className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <legend className="text-sm font-semibold">2. Em quais cidades?</legend>
            <button
              type="button"
              onClick={() => setCities(BAIXADA_SANTISTA_CITIES)}
              className="text-xs font-medium text-primary hover:underline"
            >
              Baixada Santista inteira
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {cityOptions.map((city) => {
              const active = cities.includes(city);
              return (
                <button key={city} type="button" aria-pressed={active} onClick={() => toggleCity(city)} className={chip(active)}>
                  {active && <Check className="h-3.5 w-3.5" />}
                  {city.replace(/, [A-Z]{2}$/, '')}
                </button>
              );
            })}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex gap-2">
              <Input
                value={extraCity}
                onChange={(e) => setExtraCity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addExtraCity();
                  }
                }}
                placeholder="Outra cidade (ex.: Curitiba, PR)"
                maxLength={80}
              />
              <Button type="button" variant="outline" size="icon" onClick={addExtraCity} disabled={!extraCity.trim()} aria-label="Adicionar cidade">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {singleCity && (
              <Input
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                placeholder={`Bairro em ${cities[0].replace(/, [A-Z]{2}$/, '')} (opcional)`}
                maxLength={40}
              />
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">3. Quantos leads {singleCity ? '' : 'por cidade'}?</legend>
          <div className="inline-flex rounded-lg border p-1">
            {AMOUNTS.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={amount === n}
                onClick={() => setAmount(n)}
                className={cn(
                  'min-h-9 rounded-md px-5 text-sm transition-colors',
                  amount === n ? 'bg-primary font-semibold text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {n}
              </button>
            ))}
          </div>
        </fieldset>

        <Button type="submit" size="lg" disabled={disabled || submitting || !ready} className="w-full sm:w-auto">
          <Search className="mr-2 h-4 w-4" />
          {!query ? 'Escolha o tipo de negócio' : cities.length === 0 ? 'Escolha ao menos uma cidade' : `Buscar ${plural} em ${where}`}
        </Button>
      </div>

      <div className="min-w-0">
        <SearchRadiusMap cities={cities} />
      </div>
    </form>
  );
}
