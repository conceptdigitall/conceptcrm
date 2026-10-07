import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

vi.mock('@base-ui/react/dialog', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    Dialog: {
      ...(actual.Dialog as Record<string, unknown>),
      Portal: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="mock-portal">{children}</div>
      ),
      Popup: ({
        children,
        className,
        ...props
      }: React.HTMLAttributes<HTMLDivElement>) => (
        <div data-slot="dialog-content" className={className} {...props}>
          {children}
        </div>
      ),
      Backdrop: ({
        className,
        ...props
      }: React.HTMLAttributes<HTMLDivElement>) => (
        <div data-slot="dialog-overlay" className={className} {...props} />
      ),
      Close: ({ render }: { render?: React.ReactNode }) =>
        render ?? <button type="button">Close</button>,
    },
  };
});

import { ReactivationRadar } from './reactivation-radar';
import { PlaybookPickerModal } from './playbook-picker-modal';
import { CsvImportModal } from './csv-import-modal';
import { ReactivationResult } from '@/lib/prospecting/reactivation';

describe('prospecting vertical ui components', () => {
  describe('ReactivationRadar', () => {
    it('renders empty state when there are no candidates', () => {
      const markup = renderToStaticMarkup(
        React.createElement(ReactivationRadar, {
          candidates: [],
          niche: 'barbeiro',
          onSelectCandidate: vi.fn(),
        })
      );

      expect(markup).toContain('Radar de Reativação da Base');
      expect(markup).toContain('Nenhum cliente necessitando reativação no momento');
      expect(markup).toContain('21 dias'); // default barber cycle
    });

    it('renders candidate cards with days inactive and urgency badges', () => {
      const candidates: ReactivationResult[] = [
        {
          contact: {
            id: 'c1',
            name: 'Lucas Silva',
            phone: '5513988881111',
          },
          daysInactive: 25,
          lastActivityDate: '2026-09-10T12:00:00Z',
          urgency: 'no_ciclo',
          urgencyLabel: 'No momento ideal',
        },
        {
          contact: {
            id: 'c2',
            name: 'Matheus Santos',
            phone: '5513988882222',
          },
          daysInactive: 45,
          lastActivityDate: '2026-08-20T12:00:00Z',
          urgency: 'atrasado',
          urgencyLabel: 'Atrasado',
        },
      ];

      const markup = renderToStaticMarkup(
        React.createElement(ReactivationRadar, {
          candidates,
          niche: 'barbeiro',
          onSelectCandidate: vi.fn(),
        })
      );

      expect(markup).toContain('Lucas Silva');
      expect(markup).toContain('5513988881111');
      expect(markup).toContain('25 dias');
      expect(markup).toContain('No momento ideal');
      expect(markup).toContain('Matheus Santos');
      expect(markup).toContain('45 dias');
      expect(markup).toContain('Atrasado');
      expect(markup).toContain('Abordar com Playbook');
    });
  });

  describe('PlaybookPickerModal', () => {
    it('renders null when contact is null', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PlaybookPickerModal, {
          isOpen: true,
          onClose: vi.fn(),
          contact: null,
          niche: 'clinica',
        })
      );

      expect(markup).toBe('');
    });

    it('renders modal dialog content when open with a contact', () => {
      const markup = renderToStaticMarkup(
        React.createElement(PlaybookPickerModal, {
          isOpen: true,
          onClose: vi.fn(),
          contact: {
            id: 'c1',
            name: 'Fernanda Lima',
            phone: '5513988883333',
            service: 'Check-up Preventivo',
          },
          niche: 'clinica',
        })
      );

      expect(markup).toContain('Playbook de Abordagem Guiada');
      expect(markup).toContain('Fernanda Lima');
      expect(markup).toContain('5513988883333');
      expect(markup).toContain('Modelos Guiados');
      expect(markup).toContain('Abrir no WhatsApp');
    });
  });

  describe('CsvImportModal', () => {
    it('renders upload area when open without initial file', () => {
      const markup = renderToStaticMarkup(
        React.createElement(CsvImportModal, {
          isOpen: true,
          onClose: vi.fn(),
          onImport: vi.fn(),
        })
      );

      expect(markup).toContain('Importar Base de Clientes (CSV)');
      expect(markup).toContain('Arraste seu arquivo CSV');
    });
  });
});
