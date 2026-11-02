# Vídeo com cenário (antes x depois) e banco de ganchos

Decidido com o João em 02/11/2026. Estilo dos personagens: **ilustrado com Open Peeps (CC0)**.

## Por quê

Os vídeos atuais são texto animado sobre fundo. O João quer vídeos com história: um personagem do nicho (barbeiro triste sem clientes, corretor afogado em mensagens) sem automação de marketing contra o mesmo personagem com automação. E ganchos fortes, porque o gancho decide se o vídeo é assistido.

Regra que não muda: **a IA não desenha forma orgânica** (gente, mão, rosto, objeto curvo). Foi assim que nasceu o dedo deformado. Ela escolhe peças prontas, posiciona, anima e escreve.

## Formato "Antes x Depois com personagem" (20 a 25 s)

| Tempo | Batida | Exemplo (barbearia) |
|---|---|---|
| 0 a 1,5 s | Gancho | Cadeira vazia girando, texto grande "3 da tarde. Nenhum cliente." |
| 1,5 a 8 s | Dor | Barbeiro com rosto triste, celular com "tem horário?" sem resposta, relógio correndo |
| 8 a 15 s | Virada | A IA responde, a mão (`ConceptAnim.toque`) toca o link de agendar, cai o PIX |
| 15 a 22 s | Depois | O mesmo barbeiro com rosto feliz, agenda cheia, fila na porta |
| final | CTA | Chamada da conta (`marketing_settings.cta`) |

O personagem é o mesmo nas duas metades; só troca o rosto e a pose. Isso dá a sensação de "mesma pessoa, outro resultado".

## Kit por nicho

Pasta `worker/video-scaffold/assets/cenas/<nicho>/` com:

- `personagem-triste.svg` e `personagem-feliz.svg`: Open Peeps montado (corpo, pose, rosto), mesma roupa nos dois.
- `cenario.svg`: fundo simples do lugar (cadeira de barbeiro e espelho; mesa de corretor com chaves).
- Props avulsos reaproveitáveis em `assets/cenas/props/`: celular, relógio, agenda, notificação PIX, balão de mensagem.
- `kit.json`: nome de cada peça, tamanho natural, ponto de apoio (onde o personagem "pisa") e uma frase que descreve a peça para o diretor.

Pilotos: **barbearia** e **imobiliária**. Depois: clínica, adega.

As peças são montadas uma vez à mão (ou com script) a partir do Open Peeps e conferidas em snapshot do HyperFrames antes de entrar no kit. Crédito em `worker/prompts/NOTICE.md` (CC0 não exige, mas registramos a origem).

Helper novo em `animacoes.js`: `ConceptAnim.trocaHumor(tl, { triste, feliz, at })`, que faz a troca de rosto/pose com um pequeno pulo, para o modelo não improvisar a transição.

## Banco de ganchos no diretor

Hoje o `concept-playbook.md` pede um gancho só. Passa a ser:

1. O diretor gera **10 ganchos tipados**: 3 de curiosidade, 3 de dor, 3 de prova, 1 de conflito.
2. Cada gancho traz: primeiro quadro visual (o que se move em 0,0 s), fala de até 12 palavras, promessa implícita e em que batida a promessa é cumprida.
3. Um jurado mais barato (Sonnet) escolhe o melhor com regras fixas:
   - movimento no quadro zero, texto grande;
   - nada de "você não vai acreditar", "oi gente", logo ou introdução na abertura;
   - a promessa é cumprida na própria história;
   - **gancho de prova só com número real do briefing**; sem dado real, prova é descartada.
4. Os 10 ganchos e a escolha ficam salvos no post (para o João ver e trocar na aprovação).

Fórmula de referência: [movimento ou impacto visual] + [afirmação curta] + [promessa específica].

## Ordem de execução

1. Banco de ganchos (diretor + jurado + campo no post). Melhora todo vídeo e é barato.
2. Kit piloto barbearia e imobiliária + `trocaHumor` + regra no `animation-styles.md` ("personagem só do kit").
3. Um vídeo de prova de cada nicho para o João avaliar.
4. Depois: revisão visual automática (folha de quadros + jurado com `rubric.md`).

## Fora do escopo

- Cenas realistas geradas por IA de imagem (descartado: custo por vídeo, rosto muda entre cenas, mãos ruins).
- Personagem do ClaudeAnimationBase (é o mascote da Anthropic).
- Publicação automática: tudo continua passando pela aprovação do João.
