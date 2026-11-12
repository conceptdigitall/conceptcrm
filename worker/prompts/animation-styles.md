# Estilos de Animação em JavaScript da Concept Digital

Quando o briefing pedir um estilo específico ou quando o tema do vídeo se beneficiar de alto dinamismo visual, use a biblioteca `assets/animacoes.js` incluída no projeto.

Inclua sempre no `<head>`:
```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script src="assets/animacoes.js"></script>
```

---

## 1. Whiteboard (Lousa / Desenho com Mão)

Ideal para: explicar processos, funis de venda, dores do empresário e fluxo de automação.

### Como montar:
1. **Fundo da lousa:** Fundo claro limpo (`background: #fafaf9` ou `#fdfbf7`) com textos em preto marcante (`#18181b`) e destaques em dourado (`#eab308` / `#ca8a04`).
2. **Elemento da Mão:** Coloque a mão no body com posição absoluta e opacidade 0:
```html
<img id="hand" src="assets/hand.svg" style="position: absolute; width: 140px; pointer-events: none; opacity: 0; z-index: 999;" />
```
3. **Ícones Vetoriais Disponíveis na pasta `assets/icons/`:**
- `assets/icons/relogio.svg` (relógio / espera / atendimento noturno)
- `assets/icons/celular-whatsapp.svg` (WhatsApp / notificações)
- `assets/icons/robo-ia.svg` (robô / assistente de IA da Concept)
- `assets/icons/pix-moeda.svg` (PIX / vendas 24/7)
- `assets/icons/foguete.svg` (crescimento rápido)
- `assets/icons/grafico.svg` (métricas / faturamento em alta)
- `assets/icons/alerta-dor.svg` (perigo / dor do negócio)

4. **Invocação via Script:**
Incorpore o SVG inline ou use o helper:
```javascript
// Desenha os traços do elemento e faz a mão guiar o desenho:
ConceptAnim.whiteboard(tl, {
  svg: "#bloco-desenho",
  hand: "#hand",
  duration: 1.6,
  at: 0.5
});
```

---

## Toque / clique em botão ou link (mão)

**Proibido desenhar mão, dedo ou cursor de mão com CSS, `<div>` ou SVG próprio.** Desenho improvisado de dedo vira forma estranha e o vídeo não pode ir ao ar. Use sempre a mão pronta e o helper, que coloca a ponta do dedo no centro do alvo:

```html
<img id="toque" src="assets/icons/mao-toque.svg" style="position: absolute; left: 0; top: 0; width: 150px; opacity: 0; pointer-events: none; z-index: 999;" />
```
```javascript
ConceptAnim.toque(tl, { hand: "#toque", target: "#link-agendar", at: 1.2 });
```

- O alvo precisa ter pelo menos 60px de altura na tela para o toque ser visível.
- Uma mão por cena; não gire nem estique a imagem.
- Se não houver botão para tocar, não use mão: use destaque (sublinhado, brilho, seta).

---

## 2. Contadores Numéricos Dinâmicos

Ideal para: provas de faturamento, tempo de resposta ("10 segundos"), horas salvas.

```html
<div id="metric" style="font-size: 80px; font-weight: 800; color: #eab308;">R$ 0</div>
```
```javascript
ConceptAnim.contador(tl, {
  target: "#metric",
  start: 0,
  end: 15400,
  prefix: "R$ ",
  suffix: "/mês",
  duration: 2.2,
  at: 2.0
});
```

---

## 3. Cutout / Colagem (Estilo Roast & Prints Reais)

Ideal para: contrastar "site ruim vs landing page boa", prints de WhatsApp no vácuo, auditorias visuais com estilo de adesivo e fita.

```html
<div id="print-ruim" class="cutout-box" style="box-shadow: 12px 12px 0px #09090b; border: 4px solid #18181b; background: #fff; padding: 24px;">
  <p>Mensagem ignorada há 4 horas...</p>
</div>
```
```javascript
ConceptAnim.cutout(tl, {
  target: "#print-ruim",
  rotation: -3.5,
  duration: 0.35,
  at: 0.8
});
```

---

## 4. Kinetic Typography com Impacto Imediato (Punch)

Palavras gigantes que ocupam a tela e dão soco visual no 1º segundo (0.0s):

```html
<h1 id="punch-title" style="font-size: 96px; font-weight: 900; color: #ffffff; letter-spacing: -0.04em;">CLIENTE PERDIDO.</h1>
```
```javascript
ConceptAnim.kineticPunch(tl, {
  target: "#punch-title",
  duration: 0.2,
  at: 0.0
});
```

---

## 5. Cinemático 3D (estilo `cinematico`)

Ideal para: história com virada ("antes triste → depois feliz"), institucional de nicho (barbearia, clínica, loja, restaurante), anúncio com personagem. Padrão aprovado pelo João em nov/2026: mundo 3D contínuo + camadas de interface por cena + whooshes.

### Estrutura obrigatória
1. **Uma sub-composição `world`** com o cenário 3D ocupando o vídeo inteiro (track 1). Canvas 1080×1920 (ou 1920×1080 no deitado) dentro de `#w-stage`, vinheta por cima.
2. **Uma sub-composição de interface por fala** (`o1`, `o2`, …, track 2), em sequência sem buraco, cada uma começando no tempo em que a frase é falada.
3. **Áudio:** narração, trilha e efeitos em `<audio>` com `id`, cada som sobreposto em track própria.

No `<head>` do `index.html`:
```html
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<script src="assets/three.global.js"></script>
<script src="assets/cena3d.js"></script>
```

### Mundo 3D com o kit `ConceptCena` (não reescreva Three.js do zero)
```javascript
const C = ConceptCena.criar(document.getElementById('w-cv'), { w: 1080, h: 1920 });
ConceptCena.sala(C, { parede: 0x1b2a3f });            // piso xadrez, paredes, rodapé
const brilho = ConceptCena.neon(C, 'BARBEARIA');      // letreiro: brilho(0..1)
const luz = ConceptCena.luzes(C);                     // luz(0)=triste fria, luz(1)=feliz quente
const dono = ConceptCena.pessoa(C, { skin: 0xb8794f, hair: 0x1a120e, beard: true, apron: 0x161616 });
const cli = [ConceptCena.sentado(C, -1.2, { skin: 0xe0b08c, hair: 0x3b2416 }), ConceptCena.sentado(C, 1.2, { skin: 0x8a5a3c, hair: 0x0f0c0b, cape: 0x1d1d22 })];
const po = ConceptCena.poeira(C);
const cam = ConceptCena.camera(C, [
  [0,    [0, 2.0, 8.4], [0, 1.35, 0]],   // abertura larga
  [4.5,  [0.9, 1.7, 3.4], [0.9, 1.55, 0.35]], // zoom lento no rosto
  [4.52, [-3.6, 2.7, 5.6], [0, 1.1, 0]], // corte seco = dois keyframes a 0,02s
  [9,    [3.6, 2.3, 5.2], [0, 1.1, 0]],  // travelling lateral
]);
const { sm } = ConceptCena.u;
ConceptCena.aoBuscar((t) => {
  const f = sm(VIRADA, VIRADA + 1.2, t);  // VIRADA = segundo em que a narração diz "imagina o contrário"
  luz(f); po(t, f); brilho(f);
  ConceptCena.pose(dono, t < VIRADA ? 'triste' : 'feliz', t);
  dono.g.position.set(0.5, 0, -0.6);
  cli.forEach((c) => { c.g.visible = t >= VIRADA; });
  cam(t); C.render();
});
```
**Personagens (estilo fofo de animação, cabeça grande e olhos com brilho):** varie cor de pele, cabelo e roupa entre eles. Opções de `pessoa`/`sentado`: `skin`, `hair` (cor; `null` = careca), `cabelo: 'curto' | 'longo' | 'cacheado' | 'coque'`, `olhos` (cor da íris), `beard`, `shirt`, `pants`, `apron`, `cape` (capa/roupa do sentado), `gola`. `ConceptCena.humor(p.hd, -1..1)` muda boca, sobrancelhas, pálpebras e bochechas. Para close no rosto, mire a câmera na altura da cabeça: em pé ≈ y 1.6, sentado ≈ y 1.79.

Objetos do nicho (cadeira, maca, balcão, prateleira) você monta com `C.mesh(new C.T.BoxGeometry(...), C.mat(cor), x, y, z)`. Use `C.R()` (aleatório com semente) em vez de `Math.random`.

### Roteiro visual (arco que funciona)
1. **Gancho (0–3s):** frase grande legível no quadro 0 + personagem triste em luz fria, **com o rosto visível já no 1º segundo** (câmera perto do personagem, nunca um quadro quase preto ou um objeto solto no escuro). Falha (`ConceptCena.falha`) para "não existe / some".
2. **Dores (1 cena por dor, 3–4s cada):** câmera muda a cada dor (corte seco ou travelling). Por cima, interface realista da dor: busca no Google sem o negócio, WhatsApp sem resposta com relógio pulando, agenda de papel riscada. O palco 3D desfoca atrás (`filter: blur(12px) brightness(.5)` em `#w-stage`, na timeline do `world`).
3. **Virada:** luzes acendem uma a uma (som `lamp`), letreiro liga, cor vai de azul frio para âmbar.
4. **Solução:** celular entra girando em 3D (`rotationX/rotationY` + `perspective`), telas passando com chicote lateral dentro do celular (site → agenda → WhatsApp com IA). Checks amarelos com o nome de cada entrega.
5. **Resultado:** cena 3D feliz (clientes sorrindo, personagem trabalhando), card de gráfico subindo marcado "ilustrativo".
6. **Fecho (no máximo 4s):** flash, fundo azul Concept (#0624C7) abrindo em círculo, **logo do lobo-guará** entrando, chamada e CTA em botão amarelo. Nada parado: o lobo desliza/escala devagar e o botão pulsa até o último quadro.
   - Vídeo da própria Concept Digital: `assets/brand/lobo-guara-amarelo.png` (fundo transparente, para o azul) ou `assets/brand/lobo-guara-azul.png` (para fundo claro), com "CONCEPT DIGITAL" escrito embaixo em texto. Vídeo de cliente: logo do cliente se ele enviou; senão só o nome em texto (o lobo é marca da Concept, não do cliente).

### Transições e som
- Whoosh lateral entre cenas: saída com `x: -1100` + `blur(10px)` e entrada vindo da direita; som `assets/sfx/whoosh-a|b|c.mp3` 0,15s antes do corte (volume 0.4–0.5), alternando os três.
- `assets/sfx/lamp.mp3` em cada luz que acende; `assets/sfx/impact.mp3` no fecho. Sons sobrepostos = `data-track-index` diferentes.
- Trilha baixa (0.13) na parte triste e sobe (0.22) depois da virada.

### Regras que já quebraram render (siga à risca)
- Não anime `letterSpacing` (erro). Use `scale` e `filter: blur`.
- Não faça dois `fromTo` no mesmo elemento: coloque o segundo efeito num wrapper.
- Texto principal entre y=168 e y=1330 no vertical (zona segura do Instagram). Nada cobrindo o letreiro neon.
- Personagem que precisa sorrir na tela: sem barba (a barba cobre a boca). Braço do personagem não pode atravessar o rosto de outro: posicione atrás da cadeira.
- Telas de celular/site com texto pequeno: marque o contêiner com `data-layout-ignore`.
- Nunca invente fato ("história real", números): gráfico de resultado sempre com "ilustrativo".
