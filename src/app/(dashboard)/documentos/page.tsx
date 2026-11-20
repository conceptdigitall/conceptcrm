import { Metadata } from 'next';
import { DocumentsView } from '@/components/documents/documents-view';

export const metadata: Metadata = {
  title: 'Documentos & Contratos | Concept CRM',
  description: 'Gestão de contratos, minutas e faturamento de clientes da Concept Digital',
};

export default function DocumentosPage() {
  return (
    <div className="flex-1 space-y-6 p-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Documentos & Contratos</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Gestão de propostas, minutas jurídicas, receita recorrente (MRR) e taxas de setup
          </p>
        </div>
      </div>

      <DocumentsView />
    </div>
  );
}
