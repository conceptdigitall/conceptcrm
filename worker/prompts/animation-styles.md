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
