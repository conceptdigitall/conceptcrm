# Marketing: vídeos por pacote de nicho, vídeo no site e postagem — design

Data: 2026-10-07
Status: aguardando revisão do João
Base: `conceptdigitall/conceptcrm` (remoto `modelo` dos CRMs derivados)
Relacionados: `2026-09-29-prospeccao-marketing` (motor atual), `2026-10-01-marketing-templates-guiados` (formulários guiados, já em produção)

## 1. Objetivo

Hoje a aba Marketing gera vídeos pedindo ao Claude (Haiku) que escreva o HTML da
composição HyperFrames do zero a cada vez. O resultado varia e às vezes sai ruim.
O público do CRM são donos de negócio leigos, então o sistema precisa decidir
quase tudo sozinho e entregar vídeo bom de forma previsível.

Passa a existir, como **recurso do produto vendido aos clientes**:

1. **Vídeo Reels** (fotos → vídeo vertical 9:16 ou quadrado 1:1) para Instagram e TikTok,
   com legenda pronta e botão Publicar.
2. **Vídeo Resumo** (site/serviço → vídeo horizontal 16:9), só para o site do próprio
   cliente, que escolhe onde ele aparece. Pode baixar, **não pode postar nas redes**.

## 2. Decisões já tomadas

| Tema | Decisão |
|---|---|
| Motor | Templates HyperFrames desenhados por nós + Claude como "diretor" que só devolve dados (não escreve HTML). Sem IA generativa de vídeo: foto de imóvel/produto real nunca pode ser deformada. |
| Nichos | Cada nicho é um **pacote** (templates, botões, instruções do diretor). Todos ficam no código da base; a configuração `marketing_niche` liga um por CRM. O dono só vê o pacote do seu nicho. |
| Sites | Só sites nossos nesta fase. Site de terceiros fica para depois (código para colar). |
| Chave de IA | Por CRM: `ANTHROPIC_API_KEY` do próprio cliente se existir, senão a da Concept. |
| Render | Worker no Mac do João por enquanto (sem verba para servidor). Pedidos ficam na fila com o Mac desligado. Trocar por servidor = rodar o mesmo worker em outro lugar. |
| Publicação | Só publicar agora (sem agendar). Enquanto a plataforma não aprovar o app ou a conta não estiver conectada, vale o fluxo manual atual (baixar + copiar legenda). |
| Prévia | O dono sempre vê a prévia; nada vai ao ar sozinho. |

## 3. Decomposição e ordem

Quatro sub-projetos, cada um com plano e implementação próprios, nesta ordem:

1. **Motor de templates + pacote Barbearia (piloto)**: substitui `worker/video.ts` livre por diretor + template; formatos 9:16 e 1:1; checagem de fotos.
2. **Vídeo Resumo + bloco no site**: captura do site, template 16:9, `<VideoDoSite />` e posições nomeadas.
3. **Demais pacotes**: imobiliária, clínica, eletrônicos, adega, roupa, "software Concept".
4. **Postagem direta** Instagram e TikTok (OAuth, publicação, status).

Ação paralela do João, sem esperar o código: abrir o app na Meta (revisão de
`instagram_business_content_publish`) e na TikTok (auditoria do Content Posting API).

## 4. Arquitetura

```
CRM (Vercel)                Supabase                       Worker (Mac)
 Marketing UI  --pedido-->  marketing_videos (fila)  <--poll--  1 checa fotos (Claude visão)
 prévia/publicar            Storage `marketing`                  2 diretor (Claude) → JSON
 bloco no site <--lê------  site_video_settings                  3 valida JSON contra o template
                            social_connections/posts             4 hyperframes render (N formatos)
                                                                 5 grava vídeo + capa
```

O CRM só escreve pedidos e lê resultados; o worker é o único que chama Claude e
HyperFrames. A publicação nas redes roda no CRM (rotas de API), pois só precisa
de HTTP e dos tokens da conta.

## 5. Pacotes de nicho e templates

**Pacote** = pasta `src/lib/marketing/packs/<nicho>/` com:
- `pack.ts`: id do nicho, nome, botões prontos (cada um aponta para um template e traz o texto de instrução do diretor), tom e hashtags-base;
- `templates/<id>/`: composição HyperFrames + `template.json`.

**`template.json`** declara: encaixes de foto (mín./máx., ex. 4 a 10), textos
(com limite de caracteres), cores/logo vindos do cadastro da conta, trilhas de
música permitidas, duração e formatos suportados (`9:16`, `1:1`, `16:9`). O mesmo
template Reels cobre 9:16 e 1:1 com zonas seguras para texto; gerar os dois = dois renders.

**Reaproveitamento:** os 4 formulários guiados existentes (`templates.ts`:
Oferta, Destaque, Espaço, Prova social) viram a **entrada de dados** do diretor
(os campos continuam, o prompt livre deixa de ser o caminho padrão). O modo
"Texto Livre" continua existindo, mas passa pelo diretor com template genérico.

Lista inicial por pacote (a detalhar no plano de cada sub-projeto):
- Barbearia: compilado de cortes, antes e depois, oferta;
- Imobiliária: tour do imóvel (fotos reais, sem alteração);
- Eletrônicos / adega / roupa: destaque de produto, oferta;
- Software Concept: demonstração das telas do CRM.

## 6. Diretor (Claude)

Entrada: nicho, botão escolhido, campos do formulário guiado, URLs das fotos,
dados da conta. Saída (JSON validado por schema do template):
`template_id`, ordem das fotos, textos por encaixe, legenda, hashtags, música.

Regras:
- Nunca devolve HTML/CSS. Saída fora do schema → uma nova tentativa com o erro; falhou de novo → pedido `failed` com mensagem amigável, nada é publicado.
- **Checagem de fotos antes do render** (Claude visão): resolução mínima, foto escura/borrada, contagem fora de faixa. O CRM mostra "essa foto está escura, quer trocar?" sem gastar render.
- Modelo configurável (`VIDEO_MODEL`, hoje Haiku 4.5); a decisão é de custo baixo, pois o diretor só preenche dados.
- Fotos de imóvel/produto são sempre exibidas como enviadas (recorte e movimento de câmera sim; geração/edição de conteúdo não).

## 7. Dados (migrations aditivas, padrão `account_id` + RLS)

- Conta: `marketing_niche` (qual pacote está ligado). Local exato (tabela de settings da conta) definido no plano.
- `marketing_videos` ganha: `kind` (`reels` | `resumo`), `aspect` (`9:16` | `1:1` | `16:9`), `niche`, `template_id`, `director_input` jsonb, `director_output` jsonb, `caption`.
  - Constraint: `kind='resumo'` ⇒ `aspect='16:9'`; `kind='reels'` ⇒ `aspect IN ('9:16','1:1')`.
- `site_video_settings`: `account_id`, `video_id`, `slot` (chave da posição), `enabled`, `autoplay_muted`.
- `social_connections`: `account_id`, `platform` (`instagram` | `tiktok`), conta externa, tokens **criptografados**, `expires_at`, `status`.
- `social_posts`: `video_id`, `platform`, `status` (`pending|published|failed`), `external_id`, `error_code`, `error_message_pt`.

Bucket: vídeos publicados no site ficam em local público de leitura (ou URL assinada
longa) separado do bucket privado de fotos de entrada.

## 8. Vídeo Resumo e bloco no site

- Geração: captura do site publicado do cliente (puppeteer-core + chrome-headless-shell, como no Concept Video), template 16:9, textos do serviço pelo diretor.
- **Posições nomeadas** em vez de altura livre: cada site declara em um manifesto seus slots (ex. Barbearia: `hero`, `apos-servicos`, `apos-depoimentos`, `final`). O CRM lista os slots do site com um desenho simples; o dono escolhe um.
- Componente `<VideoDoSite slot="…" />` em cada site. Lê `site_video_settings` (endpoint público de leitura ou consulta Supabase restrita ao slot); **sem redeploy** ao trocar de posição.
- Comportamento: `hero` toca mudo em loop com botão de som; demais posições mostram capa + play; carregamento preguiçoso (só perto da viewport).
- Cada site existente recebe os slots uma única vez (trabalho nosso, por site).

## 9. Publicação (sub-projeto 4)

- "Conectar Instagram/TikTok" uma vez (OAuth); depois, Publicar por vídeo, com status.
- **Bloqueio do Resumo no servidor**: a rota de publicação recusa qualquer vídeo com `kind != 'reels'`; botão escondido na UI é só conveniência.
- Instagram: três etapas (criar contêiner `media_type=REELS` com URL pública, consultar status até `FINISHED`, `media_publish`). Exige conta Business/Creator e revisão do app na Meta.
- TikTok: Content Posting API. Fila de status e mensagens de erro em português simples ("O Instagram pediu para você entrar de novo").
- Fallback: sem conexão ativa, `SocialModal` atual (baixar + copiar legenda).
- Tokens nunca vão ao cliente nem a logs.

## 10. Limites das plataformas (verificados em 2026-10-07)

- **TikTok:** app não auditado só publica com visibilidade privada (`SELF_ONLY`), com no máximo 5 usuários/24 h e contas privadas; a auditoria costuma levar de 2 a 4 semanas, com rejeições comuns. Até lá, o fluxo manual é o caminho real. Fontes: [Content Sharing Guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines), [guia de aprovação](https://bundle.social/blog/tiktok-api-approval).
- **Instagram:** só contas Business/Creator; permissões `instagram_business_basic` e `instagram_business_content_publish` por App Review para usuários sem papel no app; Reels via API: MP4/MOV H.264, 5 a 90 s, 9:16 para entrar na aba Reels; limite de 50 posts por 24 h. Fontes: [Content Publishing](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/content-publishing), [guia de publicação](https://postproxy.dev/blog/instagram-reels-api-publishing-guide/).
- **Ponto aberto:** o vídeo 1:1 deve ir ao feed e pode não aparecer na aba Reels; confirmar o comportamento da API na fase do plano 4 e, se preciso, oferecer o 1:1 só como download/feed.

## 11. Erros e experiência do dono leigo

- Estados visíveis: `Na fila` (com aviso de que o vídeo sai quando o computador de renderização estiver ligado), `Gerando`, `Pronto`, `Precisa de atenção` (ex. foto ruim).
- Toda mensagem em português simples, sem código de erro.
- Falhas de render reaproveitam o `retry` já existente.

## 12. Testes

- Schema do template e do diretor: testes unitários (entrada inválida recusada).
- Cada template: render com fotos de exemplo nos formatos suportados, comparando o quadro de capa (fixtures).
- Constraints de `kind`/`aspect` e bloqueio do Resumo na rota de publicação: testes de rota.
- Adaptadores Instagram/TikTok com as redes simuladas; teste de expiração de token.
- `<VideoDoSite />`: teste de render por slot e de estado desligado.
- Pacote só visível quando `marketing_niche` casa; outro nicho nunca aparece na UI.

## 13. Fora de escopo (YAGNI)

IA generativa de vídeo, agendamento de posts, sites de terceiros, servidor de render
dedicado, edição manual de timeline, voz/narração (reavaliar depois para o Resumo).

## 14. Riscos

- Render depende do Mac ligado: aceito por falta de verba; fila + mensagem clara mitigam.
- Aprovações da Meta/TikTok são externas e demoradas: por isso sub-projeto 4 é o último e há fallback manual.
- Muitos pacotes = muito design de template: por isso piloto só com Barbearia e a ordem do item 3.
- Propagação para os CRMs derivados exige merge do `modelo` em cada um; mudanças só aditivas nas migrations.
