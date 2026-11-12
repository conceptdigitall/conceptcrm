/* Kit 3D cinematográfico da Concept Digital (estilo "cinematico").
 * Extraído do vídeo aprovado da barbearia (nov/2026). Depende de assets/three.global.js
 * (Three.js 0.170 como window.THREE). Tudo é determinístico: desenhe cada quadro a partir
 * do tempo, nunca de relógio ou Math.random.
 *
 * Uso típico dentro de uma sub-composição "world":
 *   const C = ConceptCena.criar(document.getElementById('w-cv'), { w:1080, h:1920 });
 *   const luz = ConceptCena.luzes(C);                 // triste → feliz
 *   const p = ConceptCena.pessoa(C, { skin:0xb8794f, hair:0x1a120e, beard:true, shirt:0xe9e5dc });
 *   const cam = ConceptCena.camera(C, [[0,[0,2,8.4],[0,1.35,0]], [5,[1,1.7,3.4],[1,1.55,.35]]]);
 *   const po = ConceptCena.poeira(C);
 *   ConceptCena.aoBuscar(t => { const f = C.u.sm(10, 11.2, t); luz(f); po(t, f);
 *     ConceptCena.humor(p.hd, f > .5 ? 1 : -1); cam(t); C.render(); });
 */
(function () {
  const T = window.THREE;
  if (!T) throw new Error('cena3d.js precisa de assets/three.global.js carregado antes');

  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const lerp = (a, b, k) => a + (b - a) * k;
  const sm = (a, b, x) => { const k = clamp((x - a) / (b - a)); return k * k * (3 - 2 * k); };
  const ioc = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  function rng(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Renderizador, cena e câmera prontos (tone mapping ACES, sombras suaves, névoa). */
  function criar(canvas, o = {}) {
    const w = o.w || 1080, h = o.h || 1920;
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1); renderer.setSize(w, h, false);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene();
    const fundo = o.fundo ?? 0x04060c;
    scene.fog = new T.Fog(fundo, o.fogPerto ?? 9, o.fogLonge ?? 24);
    scene.background = new T.Color(fundo);
    const cam = new T.PerspectiveCamera(o.fov || 40, w / h, 0.05, 80);
    const R = rng(o.seed || 11);
    const mat = (c, x = {}) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0 }, x));
    function mesh(g, m, x = 0, y = 0, z = 0, p = scene) {
      const ob = new T.Mesh(g, m); ob.position.set(x, y, z); ob.castShadow = true; ob.receiveShadow = true; p.add(ob); return ob;
    }
    function tex(tw, th, draw) {
      const c = document.createElement('canvas'); c.width = tw; c.height = th; draw(c.getContext('2d'), tw, th);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8; return t;
    }
    return {
      T, renderer, scene, cam, R, mat, mesh, tex,
      u: { clamp, lerp, sm, ioc, hash, rng },
      render: () => renderer.render(scene, cam),
    };
  }

  /** Cômodo simples: piso, 3 paredes e rodapé. Cores em hex. */
  function sala(C, o = {}) {
    const { T, mesh, mat, tex } = C;
    let pisoM;
    if (o.xadrez !== false) {
      const ch = tex(512, 512, (g, w) => { const n = 8, s = w / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? (o.piso1 || '#e9e6df') : (o.piso2 || '#15161a'); g.fillRect(i * s, j * s, s, s); } });
      ch.wrapS = ch.wrapT = T.RepeatWrapping; ch.repeat.set(5, 5);
      pisoM = mat(0xffffff, { map: ch, roughness: 0.35 });
    } else pisoM = mat(o.pisoCor ?? 0x2a2a2e, { roughness: 0.5 });
    const piso = mesh(new T.PlaneGeometry(16, 16), pisoM, 0, 0, 2); piso.rotation.x = -Math.PI / 2;
    const paredeM = mat(o.parede ?? 0x1b2a3f, { roughness: 0.85 });
    mesh(new T.PlaneGeometry(16, 7), paredeM, 0, 3.5, -1.6);
    mesh(new T.PlaneGeometry(10, 7), paredeM, -4.4, 3.5, 2).rotation.y = Math.PI / 2;
    mesh(new T.PlaneGeometry(10, 7), paredeM, 4.4, 3.5, 2).rotation.y = -Math.PI / 2;
    if (o.rodape !== false) {
      mesh(new T.BoxGeometry(16, 1.05, 0.08), mat(o.madeira ?? 0x5a351f, { roughness: 0.55 }), 0, 0.525, -1.56);
      mesh(new T.BoxGeometry(16, 0.06, 0.14), mat(o.friso ?? 0xc9a35a, { metalness: 0.8, roughness: 0.35 }), 0, 1.07, -1.53);
    }
  }

  /** Letreiro neon na parede. Devolve f(intensidade 0..1). */
  function neon(C, texto, o = {}) {
    const { T, mesh, tex, scene } = C;
    const cor = o.cor || '#FCE026';
    const t = tex(1024, 256, (g, w, h) => {
      g.font = `900 ${o.px || 150}px Poppins, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = cor; g.shadowBlur = 40; g.fillStyle = o.miolo || '#fff7b0'; g.fillText(texto, w / 2, h / 2 + 8);
      g.shadowBlur = 14; g.fillText(texto, w / 2, h / 2 + 8);
    });
    const m = new T.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, color: 0x222222, toneMapped: false });
    const pl = mesh(new T.PlaneGeometry(3.2, 0.8), m, o.x ?? 0, o.y ?? 3.35, o.z ?? -1.5); pl.castShadow = false;
    const luz = new T.PointLight(new T.Color(cor), 0, 6, 2); luz.position.set(o.x ?? 0, (o.y ?? 3.35) - 0.05, (o.z ?? -1.5) + 0.5); scene.add(luz);
    return (v) => { m.color.setScalar(Math.max(0.004, v)); luz.intensity = v * 6; };
  }

  /** Iluminação "triste → feliz". Devolve f(k) com k=0 triste (frio, escuro) e k=1 feliz (quente). */
  function luzes(C, o = {}) {
    const { T, scene, renderer } = C;
    const frio = new T.SpotLight(0x8fb0ff, 0, 14, 0.5, 0.7, 1.4); frio.position.set(0.6, 4.4, 2.4); frio.target.position.set(0.3, 0.7, 0.2);
    frio.castShadow = true; frio.shadow.mapSize.set(1024, 1024); frio.shadow.bias = -0.0004; scene.add(frio, frio.target);
    const quente = new T.SpotLight(0xffc27a, 0, 9, 0.62, 0.55, 1.6); quente.position.set(0, 2.9, 0.3); quente.target.position.set(0, 0.6, 0.35);
    quente.castShadow = true; quente.shadow.mapSize.set(1024, 1024); quente.shadow.bias = -0.0004; scene.add(quente, quente.target);
    const hemi = new T.HemisphereLight(0x8aa2d8, 0x0a0a12, 0.3); scene.add(hemi);
    const key = new T.DirectionalLight(0x9ab0ff, 0.4); key.position.set(-4, 5, 6); scene.add(key);
    const rim = new T.DirectionalLight(0x6f8cff, 0.6); rim.position.set(3, 3, -4); scene.add(rim);
    // Luz de rosto fria vinda da câmera: no clima triste o rosto ainda precisa ser lido no 1º segundo.
    const rosto = new T.DirectionalLight(0xa9bcff, 0); rosto.position.set(0.5, 2.2, 8); rosto.target.position.set(0, 1.5, 0); scene.add(rosto, rosto.target);
    const fogA = new T.Color(o.fundoTriste ?? 0x04060c), fogB = new T.Color(o.fundoFeliz ?? 0x140c05);
    const hA = new T.Color(0x8aa2d8), hB = new T.Color(0xffd9a8), kA = new T.Color(0x9ab0ff), kB = new T.Color(0xffe2bd);
    return (k) => {
      frio.intensity = lerp(60, 0, k); quente.intensity = lerp(0, 55, k);
      hemi.intensity = lerp(0.28, 0.75, k); hemi.color.copy(hA).lerp(hB, k);
      key.intensity = lerp(0.35, 1.1, k); key.color.copy(kA).lerp(kB, k);
      rim.intensity = lerp(0.7, 0.9, k); rosto.intensity = lerp(o.rostoTriste ?? 0.9, 0.35, k);
      scene.fog.color.copy(fogA).lerp(fogB, k); scene.background.copy(scene.fog.color);
      renderer.toneMappingExposure = lerp(0.95, 1.15, k);
    };
  }

  /** Cabelo com volume. estilo: 'curto' | 'longo' | 'cacheado' | 'coque' (hair:null = careca). */
  function cabelo(C, h, R0, cor, estilo) {
    const { T, mesh, mat } = C;
    const m = mat(cor, { roughness: 0.7 });
    const topo = mesh(new T.SphereGeometry(R0 * 1.06, 48, 24, 0, Math.PI * 2, 0, Math.PI * 0.5), m, 0, 0.015, -0.012, h);
    topo.scale.set(1, 1.02, 1); topo.rotation.x = -0.32; // nuca coberta, testa livre para os olhos
    // franja: três gomos sobre a testa
    [-0.1, 0, 0.1].forEach((x, i) => {
      const f = mesh(new T.SphereGeometry(0.085, 20, 14), m, x, 0.17 - Math.abs(x) * 0.25, 0.15, h);
      f.scale.set(1.1, 0.62, 0.7); f.rotation.z = (1 - i) * 0.35;
    });
    if (estilo === 'longo') {
      const tras = mesh(new T.SphereGeometry(R0 * 1.08, 40, 28), m, 0, -0.1, -0.07, h); tras.scale.set(1.02, 1.35, 0.85);
      [-1, 1].forEach((s) => { const l = mesh(new T.CapsuleGeometry(0.075, 0.26, 8, 16), m, s * 0.22, -0.16, 0.02, h); l.rotation.z = s * 0.12; });
    } else if (estilo === 'cacheado') {
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2, el = 0.15 + hash(i + 3) * 0.9;
        const r = R0 * 1.02, x = Math.cos(a) * Math.cos(el) * r * 1.08, y = Math.sin(el) * r * 1.05 + 0.02, z = Math.sin(a) * Math.cos(el) * r - 0.04;
        if (z > 0.02 && y < 0.2) continue; // deixa testa e olhos à mostra
        mesh(new T.SphereGeometry(0.075 + hash(i) * 0.03, 16, 12), m, x, y, z, h);
      }
    } else if (estilo === 'coque') {
      mesh(new T.SphereGeometry(0.1, 24, 18), m, 0, 0.26, -0.12, h);
    }
  }

  /** Cabeça fofa (proporção de animação): olhos grandes com brilho, pálpebras, bochechas e boca que mudam de humor.
   *  Opções: skin, hair (cor ou null), cabelo ('curto'|'longo'|'cacheado'|'coque'), long (=cabelo longo), beard, olhos (cor da íris). */
  function cabeca(C, parent, o) {
    const { T, mesh, mat } = C;
    const h = new T.Group(); parent.add(h);
    const R0 = 0.26;
    const skin = mat(o.skin ?? 0xc99470, { roughness: 0.48 });
    mesh(new T.SphereGeometry(R0, 56, 40), skin, 0, 0, 0, h).scale.set(1, 0.98, 0.94);
    [-1, 1].forEach((s) => mesh(new T.SphereGeometry(0.05, 16, 12), skin, s * 0.255, -0.01, -0.01, h).scale.set(0.5, 1, 0.8));
    mesh(new T.SphereGeometry(0.032, 16, 12), skin, 0, -0.035, 0.24, h).scale.set(1, 0.85, 0.9);
    // olhos: branco, íris, pupila e brilho; a pálpebra (calota de pele) desce quando triste
    const lids = [];
    const branco = mat(0xffffff, { roughness: 0.2 }), iris = mat(o.olhos ?? 0x4a2c16, { roughness: 0.25 }), pupila = mat(0x080808, { roughness: 0.1 });
    const brilhoM = new T.MeshBasicMaterial({ color: 0xffffff });
    [-0.092, 0.092].forEach((x) => {
      const e = new T.Group(); e.position.set(x, 0.015, 0.2); h.add(e);
      mesh(new T.SphereGeometry(0.058, 28, 20), branco, 0, 0, 0, e).scale.set(1, 1.12, 0.6);
      mesh(new T.SphereGeometry(0.04, 24, 18), iris, 0, -0.004, 0.022, e).scale.set(1, 1.1, 0.55);
      mesh(new T.SphereGeometry(0.022, 16, 12), pupila, 0, -0.004, 0.035, e).scale.set(1, 1.1, 0.5);
      const b1 = new T.Mesh(new T.SphereGeometry(0.012, 10, 8), brilhoM); b1.position.set(0.015, 0.017, 0.046); e.add(b1);
      const b2 = new T.Mesh(new T.SphereGeometry(0.006, 8, 6), brilhoM); b2.position.set(-0.012, -0.016, 0.044); e.add(b2);
      const lid = mesh(new T.SphereGeometry(0.064, 28, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), skin, 0, 0, 0, e);
      lid.scale.set(1.04, 1.14, 0.68); lids.push(lid);
    });
    const bM = mat(o.hair ?? 0x2a1a10, { roughness: 0.6 });
    const brow = (x) => { const b = mesh(new T.CapsuleGeometry(0.012, 0.055, 4, 10), bM, x, 0.105, 0.212, h); b.rotation.z = Math.PI / 2; return b; };
    const bL = brow(-0.092), bR = brow(0.092);
    const bochechaM = new T.MeshStandardMaterial({ color: 0xff7a8a, roughness: 0.8, transparent: true, opacity: 0.35, depthWrite: false });
    const bochechas = [-0.155, 0.155].map((x) => { const c = mesh(new T.SphereGeometry(0.045, 16, 12), bochechaM, x, -0.065, 0.178, h); c.scale.set(1, 0.6, 0.35); c.castShadow = false; return c; });
    const mouth = mesh(new T.TorusGeometry(0.048, 0.013, 10, 28, Math.PI), mat(0x5a1a1a, { roughness: 0.45 }), 0, -0.105, 0.222, h);
    if (o.hair !== null) cabelo(C, h, R0, o.hair ?? 0x2a1a10, o.cabelo ?? (o.long ? 'longo' : 'curto'));
    if (o.beard) { const b = mesh(new T.SphereGeometry(R0 * 1.01, 40, 20, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), bM, 0, 0, 0.006, h); b.scale.set(1, 1.02, 0.98); }
    const p = { h, bL, bR, mouth, lids, bochechas };
    humor(p, 0);
    return p;
  }

  /** Humor do rosto: -1 triste, 0 neutro, 1 sorrindo. Barba cobre a boca: para sorriso visível, sem barba. */
  function humor(p, m) {
    p.mouth.scale.y = Math.abs(m) < 0.05 ? 0.08 : -m;
    p.mouth.scale.x = 1 + 0.15 * Math.max(0, m);
    p.mouth.position.y = -0.105 - 0.018 * m;
    p.bL.rotation.z = Math.PI / 2 + (m < 0 ? 0.45 * m : 0.1 * m); p.bR.rotation.z = Math.PI / 2 - (m < 0 ? 0.45 * m : 0.1 * m);
    p.bL.position.y = p.bR.position.y = 0.105 + 0.014 * Math.max(0, m);
    if (p.lids) p.lids.forEach((l) => { l.rotation.x = m < 0 ? lerp(-1.25, -0.5, -m) : -1.25; });
    if (p.bochechas) p.bochechas.forEach((c) => { c.material.opacity = lerp(0.12, 0.55, Math.max(0, m)); });
  }

  /** Personagem de pé (dono, profissional, atendente) em proporção fofa. Avental opcional. Mão direita aceita objeto (p.mao). */
  function pessoa(C, o = {}) {
    const { T, mesh, mat, scene } = C;
    const g = new T.Group(); scene.add(g);
    const pants = mat(o.pants ?? 0x1d2230, { roughness: 0.7 }), shirt = mat(o.shirt ?? 0xe9e5dc, { roughness: 0.65 }), skin = mat(o.skin ?? 0xb8794f, { roughness: 0.48 });
    const shoe = mat(o.shoes ?? 0x15161a, { roughness: 0.4, metalness: 0.1 });
    [-0.12, 0.12].forEach((x) => {
      mesh(new T.CapsuleGeometry(0.1, 0.36, 8, 16), pants, x, 0.34, 0, g);
      mesh(new T.SphereGeometry(0.1, 20, 14), shoe, x, 0.06, 0.06, g).scale.set(1, 0.6, 1.5);
    });
    const torso = new T.Group(); torso.position.y = 0.62; g.add(torso);
    // tronco em gota: largo embaixo, ombros arredondados
    const perfil = [[0, 0], [0.24, 0.02], [0.3, 0.14], [0.31, 0.32], [0.27, 0.5], [0.17, 0.62], [0.08, 0.66], [0, 0.67]].map(([r, y]) => new T.Vector2(r, y));
    mesh(new T.LatheGeometry(perfil, 40), shirt, 0, 0, 0, torso).scale.z = 0.82;
    mesh(new T.CylinderGeometry(0.075, 0.085, 0.12, 20), skin, 0, 0.7, 0, torso);
    if (o.apron !== undefined && o.apron !== null) {
      const am = mat(o.apron, { roughness: 0.7 }); am.side = T.DoubleSide;
      mesh(new T.CylinderGeometry(0.29, 0.325, 0.5, 32, 1, true, -1.05, 2.1), am, 0, 0.22, 0, torso).scale.z = 0.84;
      mesh(new T.BoxGeometry(0.5, 0.03, 0.02), am, 0, 0.44, 0.22, torso);
    }
    const hd = cabeca(C, torso, o); hd.h.position.set(0, 0.98, 0.01);
    function arm(side) {
      const a = new T.Group(); a.position.set(0.3 * side, 0.52, 0); torso.add(a);
      mesh(new T.CapsuleGeometry(0.075, 0.3, 8, 14), shirt, 0, -0.2, 0, a);
      mesh(new T.SphereGeometry(0.072, 18, 14), skin, 0, -0.42, 0.01, a).scale.set(0.95, 1.05, 0.85);
      return a;
    }
    const aL = arm(-1), aR = arm(1);
    const mao = new T.Group(); mao.position.set(0, -0.46, 0.06); aR.add(mao);
    return { g, torso, hd, aL, aR, mao };
  }

  /** Pose pronta: 'triste' (curvado, cabeça baixa) ou 'feliz' (ereto, braços trabalhando). */
  function pose(p, nome, t = 0) {
    if (nome === 'triste') {
      p.torso.rotation.x = 0.16; p.hd.h.rotation.set(0.38 + 0.03 * Math.sin(t * 1.3), 0, 0);
      p.aL.rotation.set(0, 0, 0.05); p.aR.rotation.set(0, 0, -0.05); humor(p.hd, -1);
    } else {
      p.torso.rotation.x = 0.08; p.hd.h.rotation.set(0.12, 0.25, 0);
      p.aL.rotation.set(-1.1, 0, 0.15); p.aR.rotation.set(-1.25 + 0.06 * Math.sin(t * 6), 0, 0.15); humor(p.hd, 1);
    }
  }

  /** Pessoa sentada (cliente) com capa de salão em sino, gola e pés aparecendo. cape: cor da capa (ou roupa). */
  function sentado(C, x, o = {}) {
    const { T, mesh, mat, scene } = C;
    const g = new T.Group(); g.position.set(x, 0, o.z ?? 0.27); scene.add(g);
    const capeM = mat(o.cape ?? 0xf1f1f1, { roughness: 0.6 }); capeM.side = T.DoubleSide;
    const perfil = [[0, 1.46], [0.13, 1.46], [0.24, 1.41], [0.33, 1.3], [0.4, 1.08], [0.45, 0.82], [0.49, 0.6], [0.5, 0.56]].map(([r, y]) => new T.Vector2(r, y));
    mesh(new T.LatheGeometry(perfil, 48), capeM, 0, 0, 0.02, g).scale.z = 0.86;
    mesh(new T.TorusGeometry(0.12, 0.025, 10, 32), mat(o.gola ?? 0xffffff, { roughness: 0.5 }), 0, 1.47, 0.02, g).rotation.x = Math.PI / 2;
    mesh(new T.CylinderGeometry(0.075, 0.085, 0.12, 20), mat(o.skin ?? 0xc99470, { roughness: 0.48 }), 0, 1.52, 0, g);
    [-0.1, 0.1].forEach((px) => mesh(new T.SphereGeometry(0.08, 18, 12), mat(o.shoes ?? 0x15161a, { roughness: 0.4 }), px, 0.3, 0.42, g).scale.set(1, 0.6, 1.4));
    const hd = cabeca(C, g, o); hd.h.position.set(0, 1.79, 0.01); humor(hd, o.humor ?? 1);
    return { g, hd };
  }

  /** Poeira no ar (luz volumétrica falsa). Devolve f(t, feliz 0..1). */
  function poeira(C, n = 420) {
    const { T, scene, R } = C;
    const base = new Float32Array(n * 3), pos = new Float32Array(n * 3), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { base[i * 3] = -4 + R() * 8; base[i * 3 + 1] = R() * 3.6; base[i * 3 + 2] = -1.4 + R() * 4.4; ph[i] = R() * 6.28; }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    const m = new T.PointsMaterial({ color: 0xc8d4ff, size: 0.018, transparent: true, opacity: 0.7, depthWrite: false });
    scene.add(new T.Points(g, m));
    return (t, k = 0) => {
      for (let i = 0; i < n; i++) { pos[i * 3] = ((base[i * 3] + t * 0.04 + 4) % 8) - 4; pos[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.35 + ph[i]) * 0.12; pos[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.27 + ph[i]) * 0.1; }
      g.attributes.position.needsUpdate = true; m.opacity = lerp(0.75, 0.25, k);
    };
  }

  /** Câmera por keyframes [tempo, [x,y,z] posição, [x,y,z] alvo], com easing in-out.
   *  Corte seco: dois keyframes a 0,02s de distância. Tremor de mão leve incluso (tremor:0 desliga). */
  function camera(C, K, o = {}) {
    const tgt = new C.T.Vector3(), tr = o.tremor ?? 1;
    return (t) => {
      let i = 0; while (i < K.length - 2 && t >= K[i + 1][0]) i++;
      const a = K[i], b = K[Math.min(i + 1, K.length - 1)], k = ioc(clamp((t - a[0]) / Math.max(1e-6, b[0] - a[0])));
      C.cam.position.set(lerp(a[1][0], b[1][0], k), lerp(a[1][1], b[1][1], k), lerp(a[1][2], b[1][2], k));
      tgt.set(lerp(a[2][0], b[2][0], k), lerp(a[2][1], b[2][1], k), lerp(a[2][2], b[2][2], k));
      C.cam.lookAt(tgt);
      C.cam.position.x += 0.006 * tr * Math.sin(t * 1.7); C.cam.position.y += 0.005 * tr * Math.sin(t * 2.3 + 1);
    };
  }

  /** Falha de "sumir" (glitch): devolve true se visível no tempo t dentro de [a,b]. */
  function falha(t, a, b) {
    if (t < a) return true; if (t >= b) return false;
    return hash(Math.floor(t * 15)) > 0.25 + ((t - a) / (b - a)) * 0.7;
  }

  /** Liga o desenho ao relógio do HyperFrames (determinístico) e desenha o quadro 0. */
  function aoBuscar(render) {
    window.addEventListener('hf-seek', (e) => render(e.detail.time));
    render(0);
  }

  window.ConceptCena = { criar, sala, neon, luzes, cabeca, cabelo, humor, pessoa, pose, sentado, poeira, camera, falha, aoBuscar, u: { clamp, lerp, sm, ioc, hash, rng } };
})();
