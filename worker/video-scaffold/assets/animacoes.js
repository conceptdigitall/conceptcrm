/**
 * animacoes.js - Helpers universais de animação em JavaScript para HyperFrames (GSAP)
 * Usado pelo worker de vídeo do CRM Concept.
 */

(function (global) {
  const Animacoes = {
    /**
     * Anima o desenho de traços SVG e guia a mão com caneta (Whiteboard)
     * @param {gsap.core.Timeline} tl - A timeline do GSAP
     * @param {Object} opts - Opções da animação
     * @param {string|Element} opts.svg - Seletor ou elemento do SVG/container a desenhar
     * @param {string|Element} [opts.hand] - Seletor ou elemento da mão com caneta
     * @param {number} [opts.duration=1.8] - Duração do traçado em segundos
     * @param {number} [opts.at=0] - Ponto de inserção na timeline (em segundos)
     */
    whiteboard(tl, opts) {
      const container = typeof opts.svg === 'string' ? document.querySelector(opts.svg) : opts.svg;
      if (!container) return;

      const paths = container.querySelectorAll('path, line, circle, rect, polygon, polyline');
      const hand = opts.hand ? (typeof opts.hand === 'string' ? document.querySelector(opts.hand) : opts.hand) : null;
      const duration = opts.duration || 1.8;
      const at = opts.at !== undefined ? opts.at : 0;

      // Medir e configurar cada traço do SVG para animação de revelação
      paths.forEach((path) => {
        try {
          if (path.getTotalLength) {
            const len = Math.ceil(path.getTotalLength()) + 2;
            path.style.strokeDasharray = `${len}`;
            path.style.strokeDashoffset = `${len}`;
            tl.to(path, { strokeDashoffset: 0, duration: duration, ease: 'power1.inOut' }, at);
          } else {
            tl.fromTo(path, { opacity: 0 }, { opacity: 1, duration: duration * 0.4 }, at);
          }
        } catch (_) {
          tl.fromTo(path, { opacity: 0 }, { opacity: 1, duration: duration * 0.4 }, at);
        }
      });

      // Se houver elemento de mão com marcador, move da posição inicial até o centro do elemento
      if (hand) {
        const rect = container.getBoundingClientRect();
        const startX = rect.left - 60;
        const startY = rect.top + 40;
        const endX = rect.left + rect.width - 30;
        const endY = rect.top + rect.height - 20;

        tl.fromTo(
          hand,
          { opacity: 0, x: startX, y: startY + 50, scale: 0.9 },
          { opacity: 1, x: startX, y: startY, scale: 1, duration: 0.25, ease: 'power2.out' },
          at
        );

        tl.to(
          hand,
          {
            x: endX,
            y: endY,
            duration: duration,
            ease: 'sine.inOut',
          },
          at + 0.1
        );

        tl.to(hand, { opacity: 0, duration: 0.3, ease: 'power2.in' }, at + duration + 0.1);
      }
    },

    /**
     * Contador numérico acelerado com efeito de punch ao finalizar
     * @param {gsap.core.Timeline} tl - A timeline do GSAP
     * @param {Object} opts - Opções do contador
     * @param {string|Element} opts.target - Seletor do elemento que exibe o número
     * @param {number} [opts.start=0] - Valor inicial
     * @param {number} opts.end - Valor final
     * @param {string} [opts.prefix=""] - Prefixo (ex: "R$ ")
     * @param {string} [opts.suffix=""] - Sufixo (ex: "s", "%", "/mês")
     * @param {number} [opts.duration=2.0] - Duração da subida
     * @param {number} [opts.at=0] - Momento na timeline
     */
    contador(tl, opts) {
      const el = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
      if (!el) return;

      const obj = { val: opts.start || 0 };
      const duration = opts.duration || 2.0;
      const at = opts.at !== undefined ? opts.at : 0;
      const prefix = opts.prefix || '';
      const suffix = opts.suffix || '';

      tl.to(
        obj,
        {
          val: opts.end,
          duration: duration,
          ease: 'power3.out',
          onUpdate: function () {
            const formatted = Math.floor(obj.val).toLocaleString('pt-BR');
            el.innerText = `${prefix}${formatted}${suffix}`;
          },
        },
        at
      );

      // Efeito de impacto quando o número atinge o ápice
      tl.fromTo(
        el,
        { scale: 1 },
        { scale: 1.15, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.inOut' },
        at + duration - 0.2
      );
    },

    /**
     * Animação estilo Cutout / Colagem (roast de prints, recortes com fita e sombra dura)
     * @param {gsap.core.Timeline} tl
     * @param {Object} opts
     * @param {string|Element} opts.target
     * @param {number} [opts.rotation=3] - Rotação imperfeita de colagem em graus
     * @param {number} [opts.duration=0.4]
     * @param {number} [opts.at=0]
     */
    cutout(tl, opts) {
      const el = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
      if (!el) return;

      const at = opts.at !== undefined ? opts.at : 0;
      const rot = opts.rotation !== undefined ? opts.rotation : (Math.random() > 0.5 ? 3.5 : -3.5);

      tl.fromTo(
        el,
        { opacity: 0, scale: 0.7, rotation: rot * 3, y: -40 },
        { opacity: 1, scale: 1, rotation: rot, y: 0, duration: opts.duration || 0.4, ease: 'back.out(2)' },
        at
      );
    },

    /**
     * Kinetic Typography com punch de impacto imediato (0 a 1 em fração de segundo)
     * @param {gsap.core.Timeline} tl
     * @param {Object} opts
     * @param {string|Element} opts.target
     * @param {number} [opts.duration=0.3]
     * @param {number} [opts.at=0]
     */
    kineticPunch(tl, opts) {
      const el = typeof opts.target === 'string' ? document.querySelector(opts.target) : opts.target;
      if (!el) return;

      const at = opts.at !== undefined ? opts.at : 0;

      tl.fromTo(
        el,
        { opacity: 0, scale: 1.8, filter: 'blur(8px)' },
        { opacity: 1, scale: 1, filter: 'blur(0px)', duration: opts.duration || 0.3, ease: 'power4.out' },
        at
      );
    },
  };

  global.ConceptAnim = Animacoes;
})(typeof window !== 'undefined' ? window : this);
