# Medição Inicial — Planilha Preditiva (Parte A)

- **Data:** 30 de setembro de 2026
- **Ambiente:** Mac Apple Silicon (GPU via MPS), Laya local (`multilingual` v0.3.22) em `http://127.0.0.1:8765` vs Claude Sonnet 3.5 (`claude-sonnet-5-5`) via Anthropic API
- **Banco:** Supabase PostgreSQL com RLS e triggers de isolamento
- **Amostra de teste:** 40 leads reais coletados via busca de prospecção no Google Maps ("barbearia" em "Santos, SP")

---

## 1. Tempos de Execução (Laya Local via MPS)

Todas as 3 colunas foram processadas para os 40 leads pelo worker em segundo plano utilizando batching e Laya local:

| Coluna | Tipo | Leads | Duração | Tempo médio/lead | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Tem site?** | `noul` (sim/não) | 40 | 15.311 ms (15,3 s) | ~380 ms | Concluída |
| **Nicho: beleza, saúde, alimentação, serviços, outros** | `choice` (categorias) | 40 | 3.173 ms (3,2 s) | ~79 ms | Concluída |
| **Parece ter dinheiro** | `score` (nota: baixo/médio/alto) | 40 | 2.327 ms (2,3 s) | ~58 ms | Concluída |

> **Critério de desempenho:** O teto estabelecido pela spec era de < 30s para até 500 leads. Para os 40 leads iniciais, todas as colunas concluíram confortavelmente abaixo de 16 segundos, sendo que após o carregamento inicial do modelo os tempos caíram para a faixa de 2 a 3 segundos (50-80 ms por lead).

---

## 2. Retenção de Correções Manuais

- **Teste realizado:** Duas células foram corrigidas manualmente via atualização da coluna com `corrected_value = 'não'` e `corrected_at = NOW()`.
- **Validação de reprocessamento:** Um comando de repetição/retry foi disparado na coluna (`status = 'pending'`), acionando nova execução do worker local.
- **Resultado:** Graças à cláusula `ignoreDuplicates: true` na persistência do worker e à priorização em `displayedCell()`, 100% das edições manuais foram preservadas intactas.

---

## 3. Comparativo de Concordância (Laya Base vs Claude Sonnet)

Medição executada via script `worker/scripts/compare-column.ts`, confrontando a resposta da inferência do Laya local com o modelo de referência (Claude Sonnet 3.5):

### Resumo Geral
| Coluna | Tipo | Concordância Laya × Claude | % |
| :--- | :--- | :--- | :--- |
| **Tem site?** | `noul` | 32 / 40 | **80%** |
| **Nicho: beleza, saúde, alimentação, serviços, outros** | `choice` | 19 / 40 | **48%** |
| **Parece ter dinheiro** | `score` | 39 / 40 | **98%** |

---

### Análise Qualitativa por Coluna

#### A. "Tem site?" (80% concordância)
- **Comportamento geral:** Laya identificou corretamente presença ou ausência de site na grande maioria das fichas com base nos campos `website` e `raw`.
- **Exemplos de discordância:**
  - `Barbearia Kevin Santos (Carrefour loja ,51 )`: Laya = `sim`, Claude = `não` (lead sem URL própria explícita, Laya inferiu presença por link indireto no texto da ficha).
  - `The Barbershop`: Laya = `sim`, Claude = `não`.
  - `Barbearia Los Hermanos Zero13`: Laya = `não`, Claude = `sim`.

#### B. "Nicho: beleza, saúde, alimentação, serviços, outros" (48% concordância)
- **Comportamento geral:** Claude rotulou unanimemente todos os 40 estabelecimentos de barbearia como `beleza`.
- **Distribuição do Laya Base:**
  - `beleza`: 19
  - `alimentação`: 9
  - `serviços`: 6
  - `outros`: 6
- **Causa raiz:** O modelo Laya base sem fine-tuning contextual dá alto peso a termos como "bar", "cervejaria", "café" ou descrições como "prestação de serviços" presentes nas fichas do Google Maps, categorizando como `alimentação` ou `serviços`.
- **Ponto de partida para a Parte B:** Este é o cenário ideal que justifica o fine-tuning supervisionado por correções manuais na Parte B — ao corrigir alguns leads para `beleza`, o modelo deve aprender o viés do negócio do usuário.

#### C. "Parece ter dinheiro" (98% concordância)
- **Comportamento geral:** Concordância quase total entre Laya e Claude. Ambos classificaram 39 de 40 barbearias no nível `médio`.
- **Exemplo de discordância:**
  - `Bike Barber Santos`: Laya = `médio`, Claude = `baixo`.

---

## 4. Conclusão da Parte A

A infraestrutura ponta a ponta da **Planilha Preditiva (Parte A)** está 100% funcional:
1. Migração, banco Supabase e políticas RLS validadas.
2. Parser de títulos automático com inferência de tipo (`?` $\to$ noul, `tema: opções` $\to$ choice, texto livre $\to$ score).
3. Servidor local Laya rodando em Apple Silicon com aceleração via MPS em `127.0.0.1:8765`.
4. Worker em TypeScript integrado com retry automático, fila e proteção contra sobrescrita de dados manuais.
5. Interface reativa com feedback de confiança, filtros por categoria predita e ordenação por probabilidade.
6. Baseline documentado para superação na Parte B.
