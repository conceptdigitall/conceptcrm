# Planilha Preditiva (parte B): a Laya aprende cada coluna — design

Data: 2026-10-01 · Status: aguardando revisão do João · Depende da parte A (mergeada, #9)
e do ensemble com árbitro Claude (#15).

## Objetivo

Cada coluna de IA da Prospecção ganha uma "cabeça" própria, treinada com os exemplos daquela
coluna. Com o tempo:

1. **a Laya acerta mais** onde o modelo base erra por viés (ex.: "Nicho" acertou 48% na
   medição inicial: barbearias viraram "alimentação" por causa de "bar"/"café" na ficha);
2. **o worker chama menos o Claude**: hoje toda célula com margem < 0,60 vai para o árbitro
   (`claude-arbitrator.ts`), em toda execução e para todo lead novo. A cabeça aprende com essas
   respostas e passa a responder sozinha os casos parecidos.

O mesmo método já funciona na dificuldade de tarefa do segundo cérebro
(`SimpleBrain/integracoes/laya/`): codificador da Laya congelado + regressão logística por
cima, adotada só quando a validação cruzada mostra que é melhor.

### Por que não o plano original da parte A

A parte A previa "treino com dados sintéticos rotulados pela Claude, avaliado em colunas
nunca vistas" (um modelo que generaliza para qualquer coluna). Com 3 colunas e o `laya` 0.3.22
sem função de treino, isso seria fine-tuning do modelo inteiro, sem dados para medir. Uma
cabeça por coluna resolve o problema real (viés de cada coluna) com o que já existe.

## Situação hoje (2026-10-01)

- 58 leads, 3 colunas (`Nicho` choice, `Parece ter dinheiro` score, `Tem site?` noul),
  174 valores, **0 correções**.
- Os valores decididos pelo Claude não se distinguem dos da Laya no banco: os rótulos
  pagos de hoje se perdem.

## Fontes de exemplo (rótulo), da mais forte para a mais fraca

| fonte | custo | peso no treino |
|---|---|---|
| correção do João (`corrected_value`) | zero | 3 |
| resposta do árbitro Claude (`source = 'claude'`) | já paga hoje | 1 |
| **(decisão aberta)** "Ensinar com Claude": o Haiku rotula 30 leads de uma coluna nova, uma vez | ~US$ 0,01 por coluna | 1 |

**Decisão para o João:** ligar o "Ensinar com Claude" (coluna aprende no primeiro dia) ou
deixar só as fontes gratuitas (aprende devagar, conforme o árbitro e as correções aparecem).
Recomendação: ligar, como botão por coluna, sem rodar sozinho.

## Dados (migration 047)

`lead_column_values`, colunas novas:

| coluna | tipo | observação |
|---|---|---|
| source | text | `laya` \| `cabeca` \| `claude` (quem decidiu `value`); nulo nos antigos |
| laya_value | text | o palpite do modelo base, mesmo quando outro decidiu (para medir a cabeça contra a base) |

`lead_embeddings` (cache; o vetor de um lead não muda enquanto a ficha não mudar):

| coluna | tipo | observação |
|---|---|---|
| lead_id | uuid pk | fk leads, cascade |
| account_id | uuid | RLS |
| model | text | `multilingual` |
| state_hash | text | sha1 do texto do lead; mudou, recalcula |
| vector | vector(768) | pgvector |

`lead_column_heads` (uma linha por coluna, a cabeça em uso):

| coluna | tipo | observação |
|---|---|---|
| column_id | uuid pk | fk lead_columns, cascade |
| account_id | uuid | RLS |
| labels | text[] | ordem das saídas |
| weights, bias, mu, sd | real[] | regressão logística (3×768 + 3 + 768 + 768 no máximo) |
| threshold | real | confiança mínima para a cabeça decidir |
| n_examples | int | exemplos usados |
| cv_accuracy, base_accuracy | real | cabeça × modelo base nos mesmos exemplos (validação cruzada) |
| trained_at | timestamptz | |

`lead_columns`, colunas novas: `claude_calls int` e `head_decisions int` da última execução
(para provar a economia na tela).

RLS igual à da parte A. O worker usa a service role.

## Vetores do lead

O servidor da Laya ganha a rota `POST /v1/embed` (`{texts}` → `{vectors}`: média do
codificador, máx. 256 tokens, protegida pela mesma `LAYA_API_KEY`). Fica no CRM em
`worker/laya/serve_plus.py`, que estende o `laya-serve` no mesmo processo (mesmo modelo, sem
RAM a mais) e vira o padrão do `serve.sh`.

O `laya_plus.py` do segundo cérebro (rota de dificuldade) passa a ser um plugin desse
servidor: `serve_plus.py` importa o arquivo de `LAYA_PLUS`, se existir, e chama
`register(app, router)`. Um processo, duas extensões, nenhuma dependência do CRM no Mac do
João.

## Worker

### Ordem de decisão por célula (`runColumnJob`)

1. Correção do João: nunca sobrescreve (como hoje).
2. **Cabeça** da coluna, se existir e `confiança ≥ threshold` → `source = 'cabeca'`.
3. Modelo base da Laya com margem ≥ 0,60 → `source = 'laya'`.
4. Árbitro Claude → `source = 'claude'` (vira exemplo para o próximo treino).

Em todos os casos, `laya_value` guarda o palpite do modelo base.

### Treino (`trainColumnHead`, job novo, TypeScript)

Regressão logística multinomial em TS puro (768 dimensões, até ~500 exemplos: milissegundos).
Mesmo procedimento já medido no segundo cérebro:

- Gatilho: ao terminar `runColumnJob`, se a coluna tem ≥ 12 exemplos, pelo menos 2 classes com
  ≥ 3 exemplos cada, e ≥ 5 exemplos novos desde o último treino.
- Validação cruzada 5×5, estratificada; grade l2 ∈ {0,1; 0,3; 1; 3} × limiar ∈ {0,6; 0,7; 0,8; 0,9}.
- **Só adota** se, no limiar escolhido, acertar ≥ 85%, e mais que o modelo base
  (`laya_value`) nos mesmos exemplos. Senão, mantém a cabeça anterior (ou nenhuma).
- Escolha: a combinação que decide em mais leads cumprindo as duas metas.
- Correções pesam 3 no treino; na validação, todos pesam 1.

Quando a cabeça muda, as células com `source in ('laya','cabeca')` e sem correção voltam a
ser preenchidas (as de `claude` ficam: já são o melhor rótulo pago).

### "Ensinar com Claude" (se aprovado)

`POST /api/prospecting/columns/[id]/teach`: escolhe 30 leads (estratificado pelo palpite da
Laya, para não vir tudo de uma classe), pede ao árbitro e grava com `source = 'claude'`.
Depois enfileira o treino. Uma vez por coluna (botão some depois).

## Tela

- Cabeçalho da coluna: "aprendendo · 14 exemplos" ou "treinada · acerta 88% (base 48%)".
- Resumo da execução: "124 linhas · 3,2 s · Claude chamado 4× (antes 31×)".
- Célula: ícone discreto de quem decidiu (Laya, cabeça treinada, Claude, você).

## Testes (TDD)

- Regressão logística em TS: aprende um problema separável; probabilidades somam 1; l2 encolhe pesos.
- Validação cruzada: estratificação, não vaza exemplo do treino para o teste.
- Regra de adoção: não adota abaixo de 85% nem abaixo da base; escolhe maior cobertura.
- `runColumnJob`: ordem cabeça → Laya → Claude; `source` e `laya_value` gravados; correção intocada.
- Cache de vetores: recalcula só quando `state_hash` muda.
- Rota `/teach`: 403 conta externa, uma vez por coluna.

## Critério de sucesso

1. Em "Nicho", com 20+ exemplos, a cabeça bate a base (48%) na validação cruzada.
2. Numa coluna com cabeça, as chamadas ao Claude por execução caem pela metade ou mais.
3. Nenhuma correção sobrescrita; nenhuma cabeça pior que a base adotada.

## Fora do escopo

Modelo geral para colunas nunca vistas, fine-tuning do codificador, servidor no Railway,
colunas de nota (`score`) com mais de 3 níveis.

## Riscos

- Poucos dados: com 58 leads, a validação cruzada oscila; por isso a meta dupla e a regra
  "nunca pior que a base".
- Rótulo do Claude pode estar errado: correções do João pesam 3 e sempre vencem.
- pgvector precisa estar habilitado no projeto Supabase (checar na migration).
- O `serve_plus.py` muda o processo que a produção usa via ngrok: as rotas antigas têm que
  continuar idênticas (teste de contrato com o `laya-client.test.ts`).
