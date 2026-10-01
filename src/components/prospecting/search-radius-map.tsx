'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup, TileLayer } from 'leaflet';
import { findCityCoordinates } from '@/lib/prospecting/cities';

const TILES = {
  light: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
  dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
};

function isDarkTheme(): boolean {
  return document.documentElement.classList.contains('dark');
}

interface SearchRadiusMapProps {
  cities: string[];
}

/** Mostra no mapa as cidades escolhidas para a busca. */
export function SearchRadiusMap({ cities }: SearchRadiusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const tilesRef = useRef<TileLayer | null>(null);
  const leafletRef = useRef<typeof import('leaflet') | null>(null);
  const [ready, setReady] = useState(false);

  // Cria o mapa uma única vez; Leaflet quebra se inicializar duas vezes no mesmo div.
  useEffect(() => {
    let cancelled = false;
    let observer: ResizeObserver | null = null;
    let themeObserver: MutationObserver | null = null;

    (async () => {
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !containerRef.current || mapRef.current) return;

      leafletRef.current = L;
      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        scrollWheelZoom: false,
        dragging: !L.Browser.mobile,
        tap: false,
      } as L.MapOptions);
      L.control.zoom({ position: 'bottomright' }).addTo(map);
      tilesRef.current = L.tileLayer(isDarkTheme() ? TILES.dark : TILES.light, {
        maxZoom: 18,
        subdomains: 'abcd',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      // O container muda de largura (menu, rotação do celular): o Leaflet precisa saber.
      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(containerRef.current);

      themeObserver = new MutationObserver(() => {
        tilesRef.current?.setUrl(isDarkTheme() ? TILES.dark : TILES.light);
      });
      themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

      setReady(true);
    })();

    return () => {
      cancelled = true;
      observer?.disconnect();
      themeObserver?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  const located = cities
    .map((name) => ({ name, coords: findCityCoordinates(name) }))
    .filter((c): c is { name: string; coords: [number, number] } => c.coords !== null);
  const unlocated = cities.filter((name) => !findCityCoordinates(name));
  const locatedKey = located.map((c) => c.name).join('|');

  useEffect(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!ready || !L || !map || !layer) return;

    layer.clearLayers();
    const points = locatedKey ? locatedKey.split('|') : [];
    const bounds = L.latLngBounds([]);
    for (const name of points) {
      const coords = findCityCoordinates(name);
      if (!coords) continue;
      bounds.extend(coords);
      L.circleMarker(coords, {
        radius: 7,
        color: '#04081E',
        weight: 2,
        fillColor: '#FCE026',
        fillOpacity: 1,
      })
        .bindTooltip(name.replace(/, [A-Z]{2}$/, ''), { permanent: true, direction: 'top', offset: [0, -6] })
        .addTo(layer);
    }

    if (points.length === 1) map.setView(bounds.getCenter(), 12);
    else if (points.length > 1) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 12 });
    else map.setView([-23.9608, -46.3336], 10);
  }, [ready, locatedKey]);

  return (
    // `isolate` prende os z-index internos do Leaflet (400+) dentro do mapa,
    // senão ele passa por cima do cabeçalho e dos menus abertos.
    <div className="relative isolate overflow-hidden rounded-xl border border-border bg-muted">
      <div ref={containerRef} className="h-48 w-full sm:h-60" aria-label="Mapa das cidades escolhidas" role="img" />
      {unlocated.length > 0 && (
        <p className="absolute inset-x-2 bottom-2 z-[1000] rounded-md bg-background/90 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm">
          Fora do mapa (a busca funciona igual): {unlocated.join(' · ')}
        </p>
      )}
    </div>
  );
}
