'use client';

import { useEffect, useRef } from 'react';
import { getCityCoordinates, calculateCenterCoordinates } from '@/lib/prospecting/cities';

interface SearchRadiusMapProps {
  cities: string[];
  radiusKm: number;
}

export function SearchRadiusMap({ cities, radiusKm }: SearchRadiusMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerGroupRef = useRef<any>(null);

  useEffect(() => {
    let isMounted = true;

    async function initMap() {
      if (!containerRef.current || typeof window === 'undefined') return;

      // Import dinâmico do Leaflet apenas no cliente
      const L = await import('leaflet');
      await import('leaflet/dist/leaflet.css');

      if (!isMounted || !containerRef.current) return;

      const center = calculateCenterCoordinates(cities);

      if (!mapInstanceRef.current) {
        const map = L.map(containerRef.current, {
          center,
          zoom: cities.length > 2 ? 11 : 12,
          zoomControl: false,
          attributionControl: false,
          scrollWheelZoom: false, // não captura o scroll da página acidentalmente
        });

        // Adiciona zoom control discreto no canto inferior direito
        L.control.zoom({ position: 'bottomright' }).addTo(map);

        // Tiles CartoDB Dark Matter (tema escuro do Concept CRM)
        L.tileLayer(
          'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
          {
            maxZoom: 18,
            subdomains: 'abcd',
          },
        ).addTo(map);

        const layerGroup = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;
        layerGroupRef.current = layerGroup;
      }

      const map = mapInstanceRef.current;
      const layerGroup = layerGroupRef.current;

      if (!layerGroup || !map) return;

      // Limpa marcadores e círculos anteriores
      layerGroup.clearLayers();

      const bounds = L.latLngBounds([]);

      // Desenha o círculo de raio para cada cidade selecionada ou para o centro
      cities.forEach((cityName) => {
        const coords = getCityCoordinates(cityName);
        bounds.extend(coords);

        // Círculo de raio em tempo real
        const circle = L.circle(coords, {
          radius: radiusKm * 1000,
          color: '#0624C7',
          weight: 2,
          fillColor: '#0624C7',
          fillOpacity: 0.18,
          dashArray: '4, 6',
        });
        circle.addTo(layerGroup);

        // Marcador customizado estilo Concept CRM
        const pulseIcon = L.divIcon({
          className: 'custom-map-marker',
          html: `
            <div style="
              width: 14px;
              height: 14px;
              background-color: #FCE026;
              border: 2px solid #04081E;
              border-radius: 50%;
              box-shadow: 0 0 10px rgba(252, 224, 38, 0.8);
            "></div>
          `,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });

        const marker = L.marker(coords, { icon: pulseIcon });
        marker.bindTooltip(cityName, {
          permanent: true,
          direction: 'top',
          className: 'bg-card text-foreground text-xs font-semibold px-2 py-0.5 rounded shadow border border-border',
        });
        marker.addTo(layerGroup);
      });

      if (cities.length > 0) {
        if (cities.length === 1) {
          const coords = getCityCoordinates(cities[0]);
          map.setView(coords, radiusKm > 20 ? 11 : 12);
        } else {
          map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13 });
        }
      }
    }

    initMap();

    return () => {
      isMounted = false;
    };
  }, [cities, radiusKm]);

  // Cleanup na desmontagem
  useEffect(() => {
    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card">
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2 rounded-lg border border-border/80 bg-background/90 px-3 py-1.5 text-xs font-medium text-foreground backdrop-blur-sm">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FCE026] opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[#FCE026]" />
        </span>
        <span>
          Raio de busca: <strong className="text-primary-foreground">{radiusKm} km</strong> ({cities.length}{' '}
          {cities.length === 1 ? 'cidade' : 'cidades'})
        </span>
      </div>

      <div
        ref={containerRef}
        className="h-56 w-full sm:h-72"
        style={{ background: '#04081E' }}
      />
    </div>
  );
}
