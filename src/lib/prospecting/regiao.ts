import { normalizeLabel } from './columns';

export type NivelDinheiro = 'baixo' | 'médio' | 'alto';

// "Parece ter dinheiro" depende da região: centro de Santos, Gonzaga e Ponta da Praia
// tendem a ter mais dinheiro; bairros afastados do centro, menos (critério do João, 2026-10-05).
// Chave: "cidade/bairro" normalizados (minúsculas, sem acento), como vêm do Google Maps
// em raw.complete_address. Bairros que já apareceram nos leads, por número de leads:
//   São Vicente: Centro (136), Itararé (14), Vila Cascatinha (10), Catiapoã (6), Gonzaguinha (4),
//     Parque São Vicente, Vila Valença, Vila Voturuá, Jardim Independência (2 cada), Jardim Guassu (1)
//   Santos: Gonzaga (29), Vila Mathias (7), Boqueirão (7), Campo Grande (6), Ponta da Praia (5),
//     Encruzilhada, Marapé, Aparecida (4 cada), Vila Belmiro, José Menino (3 cada),
//     Pompéia, Embaré (2 cada), Jardim Castelo, Rádio Clube (1 cada)
// João: "Gonzaga, canal 5 e 6, Ponta da Praia e centro de Santos alto, resto médio".
// O Maps dá bairros, não canais: entre os canais 5 e 6 fica a Aparecida; o Embaré (canais 4–5), o João confirmou como alto.
export const NIVEL_POR_BAIRRO: Record<string, NivelDinheiro> = {
  'santos/gonzaga': 'alto',
  'santos/ponta da praia': 'alto',
  'santos/centro': 'alto',
  'santos/aparecida': 'alto',
  'santos/embare': 'alto',
};

const NIVEL_PADRAO: NivelDinheiro = 'médio';

/** Nível esperado pela região do lead, ou null quando o endereço não tem cidade ou bairro. */
export function nivelPorRegiao(cidade: string | null | undefined, bairro: string | null | undefined): NivelDinheiro | null {
  if (!cidade || !bairro) return null;
  return NIVEL_POR_BAIRRO[`${normalizeLabel(cidade)}/${normalizeLabel(bairro)}`] ?? NIVEL_PADRAO;
}

/** Extrai o nível por região a partir dos dados brutos do lead (Google Maps raw). */
export function nivelPorLead(lead: { raw?: Record<string, unknown> | null }): NivelDinheiro | null {
  if (!lead?.raw) return null;
  const addr = (lead.raw.complete_address ?? {}) as Record<string, unknown>;
  const city = typeof addr.city === 'string' ? addr.city : null;
  const borough = typeof addr.borough === 'string' ? addr.borough : null;
  return nivelPorRegiao(city, borough);
}
