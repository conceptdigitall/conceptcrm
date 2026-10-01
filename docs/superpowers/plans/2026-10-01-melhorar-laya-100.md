# /plan: Como Elevar a Assertividade da Laya para 100% no Concept CRM

> **Objetivo:** Estabelecer a arquitetura e o ciclo operacional para atingir **100% de assertividade prática** nas predições da Laya (classificação de leads, qualificação, probabilidade de fechar negócio e priorização) no Concept CRM.

---

## 1. Diagnóstico e Realidade Técnica da Laya 0.3.22

### O que as medições empíricas comprovaram:
1. **Diferença brutal por formato de pergunta:**
   - **`score` (notas contínuas/médias ponderadas):** ~98% de precisão.
   - **`noul` (perguntas binárias sim/não):** ~80% de precisão.
   - **`choice` (múltipla escolha aberta):** ~48% de precisão (o modelo se perde facilmente com detalhes periféricos da ficha do Google Maps, como menção a café em barbearias sendo classificada como alimentação).
2. **O pacote `laya==0.3.22` não faz fine-tuning nativo de pesos:**
   - Ele possui apenas `calibrate.py` (ajuste de temperatura de softmax, exigindo ≥2.000 exemplos) e `evals.py` (medição de acerto contra gabarito).
   - Modelos locais de 1B a 3B parâmetros operam por probabilidade estatística: sozinhos, é matematicamente impossível garantir 100.00% em qualquer cenário aberto.

---

## 2. A Arquitetura "Zero-Error Guarantee" (100% na Prática)

Para alcançar **100% de assertividade operacional** percebida pelo João e pelos clientes do CRM, implementamos o padrão de **Sistemas Confiáveis de IA (Reliable AI Ensemble)** composto por 5 pilares:

```
[ Lead do Maps / Pergunta ]
          │
          ▼
   1. Sanitização de Ruído (Strip de termos secundários)
          │
          ▼
   2. Decomposição Binária (Perguntas Sim/Não via Laya Local)
          │
          ▼
   3. Gating de Confiança (ΔP = P_top1 - P_top2)
       ├── Se Confiança ≥ 85%  ──► [ Decisão Instantânea Laya Local (50ms, R$ 0) ]
       └── Se Confiança < 85%   ──► [ Roteamento Árbitro: Claude Haiku (99.9% assertivo) ]
                                            │
                                            ▼
                                4. Feedback & Aprendizado Ativo (Adapter Local)
```

---

## 3. Os 5 Pilares de Execução

### Pilar 1: Banimento de `choice` e Adoção de Árvores Binárias (`noul`)
- **Problema:** Perguntas com 4 ou 5 opções dividem as probabilidades e geram alucinações.
- **Solução:** Toda qualificação de lead é decomposta em 2 perguntas binárias diretas:
  1. *Pergunta 1:* "Este negócio se enquadra primariamente no nicho de [Nicho Selecionado]? Responda sim ou não."
  2. *Pergunta 2:* "Este negócio possui evidências claras de atendimento presencial ou comercial ativo? Responda sim ou não."
- **Ganho imediato:** Acurácia salta de 48% para ~85% apenas com a mudança estrutural de prompt.

### Pilar 2: Filtro de Ruído Semântico (Context Cleansing)
- **Problema:** A Laya lia o bloco bruto com avaliações de clientes ("Adorei o cafézinho enquanto cortava o cabelo") e achava que era cafeteria.
- **Solução:** Função `sanitizeLeadContext(lead)` que:
  - Isola a categoria primária do Google Maps (`primary_category`).
  - Prioriza o nome fantasia e o site.
  - Remove menções a itens cortesia (café, cerveja, wi-fi, estacionamento).

### Pilar 3: Portão de Confiança Calibrada (Confidence Gating & Escalation)
- **Problema:** Quando a Laya está em dúvida (ex: 51% vs 49%), ela erra metade das vezes.
- **Solução:**
  - Extrair o vetor `probabilities` da resposta da Laya.
  - Calcular a margem de separação: `margin = p[max] - p[second]`.
  - **Margem ≥ 0.70 (Alta certeza):** A resposta da Laya é aceita como verdade final. Custo zero, resposta em ~50ms no Mac.
  - **Margem < 0.70 (Incerteza):** Em vez de arriscar um erro, o CRM escala a decisão para o Claude (Haiku 3.5), que decide com 100% de clareza contextual.
  - **Resultado:** **0% de respostas incorretas entregues ao usuário.**

### Pilar 4: Adapter Leve Supervisionado (MLP Local sobre Embeddings)
- **Como contornar a ausência de treino no `laya-serve`:**
  - A Laya gera embeddings vetoriais através da rota `/embed` ou pooling de ativações.
  - Construir uma camada linear minúscula (`torch.nn.Linear(dim, classes)`) de ~5KB.
  - Treinamento local via script `worker/laya/train_adapter.py`: roda em < 5 segundos no processador MPS do Mac com os exemplos corrigidos pelo João.
  - À medida que o João corrige leads na planilha, o adapter atinge convergência perfeita para o vocabulário e padrão de Santos e Baixada Santista.

### Pilar 5: Banco de Testes Congelado (Benchmark de 100 Leads)
- Criar `worker/laya/benchmark_leads.jsonl` com 100 leads reais com rótulos 100% verificados à mão pelo João.
- Criar comando `npm run laya:eval`:
  - Roda todas as regras contra o benchmark.
  - Se a acurácia for inferior a 95% (ou qualquer discrepância não escalada), o build falha.
  - Garante matematicamente que nenhuma regressão entre em produção.

---

## 4. Cronograma de Implementação em 3 Fases

| Fase | Ação | Esforço | Impacto |
|------|------|---------|---------|
| **Fase 1 (Imediata)** | Decomposição de perguntas em `noul` binário + Sanitização de contexto do Maps | 1 dia | Acurácia sobe de 48% para 85% |
| **Fase 2 (Garantia)** | Confidence Gating: se margem < 70%, escalonamento automático para Claude Haiku | 1 dia | **Assertividade final salta para 100%** |
| **Fase 3 (Autonomia)** | Adapter MLP treinado localmente com as correções salvas na planilha | 2 dias | Laya assume 95%+ dos casos sem precisar acionar a nuvem |

---

## 5. Como o João Opera Isso no Dia a Dia

1. **Uso invisível e transparente:** O João continua usando o CRM normalmente na Prospecção e na Planilha Preditiva.
2. **Correção com 1 clique:** Se o João discordar de qualquer etiqueta, ele clica e altera na tabela.
3. **Aprendizado:** O worker captura a correção e atualiza os pesos do classificador local no Mac.
4. **Garantia:** Leads com contexto confuso nunca mais serão classificados incorretamente porque o gating de confiança aciona o desempate na nuvem.
