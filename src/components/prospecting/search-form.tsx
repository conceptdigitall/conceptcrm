'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { MapPin, Plus, Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DEFAULT_CITIES,
  BAIXADA_SANTISTA_CITIES,
} from '@/lib/prospecting/cities';

// Mapa carregado somente no client-side para evitar problemas de SSR com Leaflet
const SearchRadiusMap = dynamic(
  () =>
    import('./search-radius-map').then((mod) => mod.SearchRadiusMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-56 w-full items-center justify-center rounded-xl border border-border bg-card text-xs text-muted-foreground sm:h-72">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span>Carregando mapa da região...</span>
        </div>
      </div>
    ),
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

const RADIUS_OPTIONS = [5, 10, 15, 25, 50] as const;
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
  const [selectedCities, setSelectedCities] = useState<string[]>([DEFAULT_CITIES[0]]);
  const [cityInput, setCityInput] = useState('');
  const [district, setDistrict] = useState('');
  const [radiusKm, setRadiusKm] = useState<number>(10);
  const [amount, setAmount] = useState<number>(50);
  const [submitting, setSubmitting] = useState(false);

  const isCustom = niche === 'outro';
  const query = (isCustom ? custom : niche).trim();
  const plural = NICHES.find((n) => n.query === niche)?.plural ?? `"${query}"`;

  // Monta a string de cidades para a query
  const citiesString = selectedCities.join(', ');
  const location = (
    district.trim() ? `${district.trim()}, ${citiesString}` : citiesString
  ).trim();

  const ready = query.length > 0 && selectedCities.length > 0;

  function toggleCity(cityName: string) {
    setSelectedCities((prev) => {
      if (prev.includes(cityName)) {
        if (prev.length === 1) return prev; // Mantém pelo menos uma
        return prev.filter((c) => c !== cityName);
      }
      return [...prev, cityName];
    });
  }

  function handleAddCityFromInput() {
    const trimmed = cityInput.trim();
    if (!trimmed) return;
    if (!selectedCities.includes(trimmed)) {
      setSelectedCities((prev) => [...prev, trimmed]);
    }
    setCityInput('');
  }

  function selectAllBaixada() {
    setSelectedCities(BAIXADA_SANTISTA_CITIES);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSubmitting(true);
    const ok = await onSubmit({ query, location, maxResults: amount });
    setSubmitting(false);
    if (ok && isCustom) setCustom('');
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-xl border bg-card p-5">
      {/* 1. Tipo de negócio */}
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
                niche === q
                  ? 'border-primary bg-primary text-primary-foreground font-semibold shadow-sm'
                  : 'hover:bg-muted text-muted-foreground',
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
            className="max-w-sm mt-2"
          />
        )}
      </fieldset>

      {/* 2. Onde (Múltiplas Cidades + Mapa em Tempo Real) */}
      <fieldset className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <legend className="text-sm font-medium">
            2. Onde? (escolha uma ou mais cidades)
          </legend>
          <button
            type="button"
            onClick={selectAllBaixada}
            className="text-xs font-semibold text-primary hover:underline"
          >
            + Selecionar Baixada Santista toda
          </button>
        </div>

        {/* Chips de cidades selecionadas */}
        <div className="flex flex-wrap items-center gap-2">
          {selectedCities.map((city) => (
            <span
              key={city}
              className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary"
            >
              <MapPin className="h-3 w-3" />
              {city}
              {selectedCities.length > 1 && (
                <button
                  type="button"
                  onClick={() => toggleCity(city)}
                  aria-label={`Remover ${city}`}
                  className="rounded-full p-0.5 hover:bg-primary/20"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
        </div>

        {/* Pílulas de cidades sugeridas rápidas para clique com 1 toque */}
        <div className="space-y-1.5">
          <span className="text-xs text-muted-foreground">Sugestões rápidas:</span>
          <div className="flex flex-wrap gap-1.5">
            {DEFAULT_CITIES.map((c) => {
              const active = selectedCities.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCity(c)}
                  className={cn(
                    'rounded-md border px-2.5 py-1 text-xs transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground font-medium'
                      : 'border-border bg-muted/50 hover:bg-muted text-muted-foreground',
                  )}
                >
                  {active ? `✓ ${c}` : `+ ${c}`}
                </button>
              );
            })}
          </div>
        </div>

        {/* Campo para adicionar outra cidade e bairro */}
        <div className="grid gap-3 sm:grid-cols-2 pt-1">
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span>Adicionar outra cidade</span>
            <div className="flex gap-2">
              <Input
                value={cityInput}
                onChange={(e) => setCityInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCityFromInput();
                  }
                }}
                placeholder="Ex.: Curitiba, PR"
                maxLength={80}
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleAddCityFromInput}
                disabled={!cityInput.trim()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <label className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span>Bairro (opcional)</span>
            <Input
              value={district}
              onChange={(e) => setDistrict(e.target.value)}
              placeholder="Ex.: Gonzaga"
              maxLength={40}
            />
          </label>
        </div>

        {/* Controle de Raio de Busca em Tempo Real */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Raio de busca ao redor das cidades:</span>
            <span className="font-semibold text-primary">{radiusKm} km de raio</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {RADIUS_OPTIONS.map((km) => (
              <button
                key={km}
                type="button"
                onClick={() => setRadiusKm(km)}
                className={cn(
                  'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                  radiusKm === km
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border bg-muted/40 hover:bg-muted text-muted-foreground',
                )}
              >
                {km} km
              </button>
            ))}
          </div>
        </div>

        {/* MAPA EM TEMPO REAL */}
        <div className="pt-2">
          <SearchRadiusMap cities={selectedCities} radiusKm={radiusKm} />
        </div>
      </fieldset>

      {/* 3. Quantos leads */}
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
                amount === n
                  ? 'bg-primary text-primary-foreground font-semibold'
                  : 'hover:bg-muted text-muted-foreground',
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Botão de busca */}
      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Button
          type="submit"
          size="lg"
          disabled={disabled || submitting || !ready}
          className="w-full sm:w-auto"
        >
          <Search className="mr-2 h-4 w-4" />
          {ready
            ? `Buscar ${amount} ${plural} em ${selectedCities.length === 1 ? selectedCities[0] : `${selectedCities.length} cidades`} (raio ${radiusKm}km)`
            : 'Escolha o tipo de negócio e a cidade'}
        </Button>
      </div>
    </form>
  );
}
