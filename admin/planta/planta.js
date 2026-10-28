// Editor da planta de acessos (admin v2, Frente C).
//
//   import { abrirEditorPlanta } from "./planta/planta.js";
//   const ed = abrirEditorPlanta(container, { planta, ingressos, aoMudar, desenharPlanta? });
//   ed.fechar();          // tira o editor do container
//   ed.obter();           // cópia da planta atual
//
// planta: modelo v2 do brief-admin2 ({ colunas, linhas, salas:[{ id, nome, detalhe, tipo, x, y, w, h, abre, zonas }] }).
// ingressos: [{ id, nome, cor? }]. aoMudar(novaPlanta) recebe uma cópia nova a cada alteração confirmada.
// desenharPlanta(planta, ingressos, 'larga'|'alta') (opcional, da Frente A): devolve o SVG do site (string ou elemento).
// Sem ela, a prévia é desenhada aqui com as mesmas regras do contrato. O objeto `planta` recebido nunca é alterado.

const NS = "http://www.w3.org/2000/svg";
const CORES = ["#b48a45", "#1a5a46", "#7a4e8c", "#2f6690", "#a14a3b", "#5b6b2e"];
const TIPOS = [
  { id: "sala", nome: "Sala" },
  { id: "externa", nome: "Área externa" },
  { id: "online", nome: "Online" },
];

// geometria das duas plantas do site: larga 640 de largura (12×9 dá 640×476), alta 340 de largura (12×9 dá 340×486)
const GEO = {
  larga: { largura: 640, m: 20, gap: 10, base: 26, razao: 0.9556, padX: 18, l1: 30, lh: 20, lhSub: 18, zonaH: 46, zonaGap: 12, zonaIn: 20, zonaBase: 26 },
  alta: { largura: 340, m: 1, gap: 10, base: 25, razao: 1.02, padX: 16, l1: 26, lh: 18, lhSub: 17, zonaH: 36, zonaGap: 8, zonaIn: 14, zonaBase: 16 },
};

let contador = 0;

const ICONES = {
  sala: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V4h16v16h-5"/><path d="M15 20v-6"/><path d="M15 14a6 6 0 0 1 0 6" stroke-dasharray="1.5 2"/></svg>',
  externa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21v-6"/><path d="M12 15c-4 0-6-2.5-6-5.5S8.7 3 12 3s6 3.5 6 6.5S16 15 12 15z"/><path d="M5 21h14"/></svg>',
  online: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M9 20h6M12 16v4"/></svg>',
  mais: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  menos: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  desfazer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
  refazer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
  lixo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/></svg>',
  cima: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 14 6-6 6 6"/></svg>',
  baixo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 10 6 6 6-6"/></svg>',
  cadeado: '<svg viewBox="0 0 12 16" aria-hidden="true"><path d="M2.5 7V4.5a3.5 3.5 0 0 1 7 0V7"/><rect x="0.5" y="7" width="11" height="8.5" rx="1.5"/></svg>',
  ok: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5 10 17l8.5-9"/></svg>',
};

// ------------------------------------------------------------------ modelo

// o campo de uma linha não guarda "\n" (quebra forçada): compara e mostra com espaço, e só troca se o texto mudou
function plano(s) {
  return String(s || "").replace(/\s*\n\s*/g, " ");
}

function copiar(o) {
  return JSON.parse(JSON.stringify(o));
}

function normalizar(p, ingressos) {
  const n = copiar(p || {});
  n.colunas = Math.max(1, Math.round(+n.colunas || 12));
  n.linhas = Math.max(1, Math.round(+n.linhas || 9));
  n.salas = Array.isArray(n.salas) ? n.salas : [];
  const ids = new Set(ingressos.map((i) => i.id));
  n.salas.forEach((s, i) => {
    s.id = String(s.id || "sala-" + (i + 1));
    s.nome = String(s.nome ?? "");
    s.detalhe = String(s.detalhe ?? "");
    s.tipo = TIPOS.some((t) => t.id === s.tipo) ? s.tipo : "sala";
    ["x", "y"].forEach((k) => (s[k] = Math.max(0, Math.round(+s[k] || 0))));
    ["w", "h"].forEach((k) => (s[k] = Math.max(1, Math.round(+s[k] || 1))));
    s.abre = (Array.isArray(s.abre) ? s.abre : []).filter((a) => ids.has(a));
    s.zonas = (Array.isArray(s.zonas) ? s.zonas : []).map((z, j) => ({
      id: String(z.id || s.id + "-zona-" + (j + 1)),
      nome: String(z.nome ?? ""),
      abre: (Array.isArray(z.abre) ? z.abre : []).filter((a) => ids.has(a)),
    }));
  });
  return n;
}

function cruza(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// onde o retângulo não cabe: fora da grade ou em cima de outra sala
export function testarEspaco(planta, r, ignorarId) {
  if (r.w < 1 || r.h < 1) return { ok: false, motivo: "pequena" };
  if (r.x < 0 || r.y < 0 || r.x + r.w > planta.colunas || r.y + r.h > planta.linhas) return { ok: false, motivo: "fora" };
  const outra = planta.salas.find((s) => s.id !== ignorarId && cruza(s, r));
  return outra ? { ok: false, motivo: "ocupado", sala: outra } : { ok: true };
}

function primeiroLivre(planta, w, h) {
  for (let y = 0; y + h <= planta.linhas; y++) {
    for (let x = 0; x + w <= planta.colunas; x++) {
      if (testarEspaco(planta, { x, y, w, h }).ok) return { x, y, w, h };
    }
  }
  return null;
}

function novoId(prefixo, usados) {
  let i = 1;
  while (usados.has(prefixo + "-" + i)) i++;
  return prefixo + "-" + i;
}

function corDe(ingressos, id) {
  const i = ingressos.findIndex((x) => x.id === id);
  return (ingressos[i] && ingressos[i].cor) || CORES[i % CORES.length] || CORES[0];
}

// ------------------------------------------------------------------ desenho da prévia (o contrato da planta v2)

let regua = null;
function largura(texto, px, peso) {
  if (!regua) regua = document.createElement("canvas").getContext("2d");
  regua.font = peso + " " + px + 'px "Proza Libre", sans-serif';
  return regua.measureText(texto).width;
}

// quebra em linhas pela largura; `apertado` quando uma palavra sozinha já passa da largura
// "\n" no texto força a quebra (contrato da Frente A)
function quebrar(texto, max, px, peso) {
  const linhas = [];
  let apertado = false;
  String(texto || "").split("\n").forEach((trecho) => {
    let atual = "";
    trecho.split(/\s+/).filter(Boolean).forEach((p) => {
      if (largura(p, px, peso) > max) apertado = true;
      const teste = atual ? atual + " " + p : p;
      if (!atual || largura(teste, px, peso) <= max) atual = teste;
      else {
        linhas.push(atual);
        atual = p;
      }
    });
    if (atual) linhas.push(atual);
  });
  return { linhas, apertado };
}

function dimensoes(planta, orient) {
  const g = GEO[orient];
  const cols = orient === "larga" ? planta.colunas : planta.linhas;
  const rows = orient === "larga" ? planta.linhas : planta.colunas;
  const cw = (g.largura - 2 * g.m) / cols;
  const ch = cw * g.razao;
  return { g, cols, rows, cw, ch, W: g.largura, H: Math.round(g.m + rows * ch + g.base) };
}

// a sala no espaço da planta pedida: larga usa x,y,w,h; alta usa a mesma sala transposta (x↔y, w↔h)
function geometriaSala(s, d, orient) {
  const t = orient === "larga" ? s : { x: s.y, y: s.x, w: s.h, h: s.w };
  const { g, cols, rows, cw, ch } = d;
  const x0 = g.m + t.x * cw + (t.x > 0 ? g.gap / 2 : 0);
  const x1 = g.m + (t.x + t.w) * cw - (t.x + t.w < cols ? g.gap / 2 : 0);
  const y0 = g.m + t.y * ch + (t.y > 0 ? g.gap / 2 : 0);
  const y1 = g.m + (t.y + t.h) * ch - (t.y + t.h < rows ? g.gap / 2 : 0);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// layout de uma sala: linhas do nome, do detalhe e as faixas das zonas; diz se o texto ficou apertado
function layoutSala(s, r, g, nIngressos) {
  // sala com cadeado (nem todo ingresso abre): as zonas sobem para não ficar em cima dele
  if (s.tipo === "sala" && s.abre.length && s.abre.length < nIngressos) g = { ...g, zonaBase: g.zonaBase + 24 };
  const max = r.w - 2 * g.padX;
  const nome = quebrar(s.nome, max, 14, 500);
  const sub = quebrar(s.detalhe, max, 12, 400);
  const textos = [];
  let y = r.y + g.l1;
  nome.linhas.forEach((l, i) => {
    textos.push({ x: r.x + g.padX, y, t: l, sub: false });
    y += g.lh;
  });
  sub.linhas.forEach((l) => {
    textos.push({ x: r.x + g.padX, y, t: l, sub: true });
    y += g.lhSub;
  });
  const fimTexto = y - (sub.linhas.length ? g.lhSub : g.lh) + 8;
  const zonas = [];
  // apertado: { falta: "largura" | "altura", texto } — o primeiro texto que não coube e em qual direção
  let apertado = null;
  if (nome.apertado) apertado = { falta: "largura", texto: s.nome };
  else if (sub.apertado) apertado = { falta: "largura", texto: s.detalhe };
  const n = s.zonas.length;
  if (n) {
    const zx = r.x + g.zonaIn;
    const zw = r.w - 2 * g.zonaIn;
    const livre = r.y + r.h - g.zonaBase - fimTexto - 6;
    const zh = Math.min(g.zonaH, (livre - (n - 1) * g.zonaGap) / n);
    if (zh < 22 && !apertado) apertado = { falta: "altura", texto: s.zonas[0].nome };
    const h = Math.max(zh, 18);
    let zy = r.y + r.h - g.zonaBase - n * h - (n - 1) * g.zonaGap;
    s.zonas.forEach((z) => {
      const tx = zx + g.padX - 2;
      if (!apertado && largura(z.nome, 14, 600) > zx + zw - 6 - tx) apertado = { falta: "largura", texto: z.nome };
      zonas.push({ z, x: zx, y: zy, w: zw, h, t: z.nome, tx, ty: zy + h / 2 + 5 });
      zy += h + g.zonaGap;
    });
  }
  if (!apertado && fimTexto > r.y + r.h - 6) apertado = { falta: "altura", texto: s.nome };
  return { textos, zonas, apertado };
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

function attrsAbre(abre) {
  return abre.map((a) => " data-" + esc(a)).join("");
}

// SVG no mesmo formato do site (g.sala com data-<ingresso>, classes sala--zona/--online/--fora); secoes.js e decorar()
// acrescentam luz, porta e cadeado
export function desenharPlantaLocal(planta, ingressos, orient) {
  const d = dimensoes(planta, orient);
  const suf = orient === "larga" ? "l" : "a";
  let out = '<svg xmlns="' + NS + '" viewBox="0 0 ' + d.W + " " + d.H + '" class="acessos__planta acessos__planta--' + orient + '">';
  out += '<defs><pattern id="hachura-' + suf + '" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7"/></pattern></defs>';
  planta.salas.forEach((s) => {
    const r = geometriaSala(s, d, orient);
    const lay = layoutSala(s, r, d.g, ingressos.length);
    const cls = "sala" + (s.tipo === "online" ? " sala--online" : s.tipo === "externa" ? " sala--fora" : "");
    out += '<g class="' + cls + '" data-sala="' + esc(s.id) + '"' + attrsAbre(s.abre) + ">";
    out += '<rect x="' + r.x.toFixed(1) + '" y="' + r.y.toFixed(1) + '" width="' + r.w.toFixed(1) + '" height="' + r.h.toFixed(1) + '"/>';
    lay.textos.forEach((t) => {
      out += "<text" + (t.sub ? ' class="sala__sub"' : "") + ' x="' + t.x.toFixed(1) + '" y="' + t.y.toFixed(1) + '">' + esc(t.t) + "</text>";
    });
    out += "</g>";
    lay.zonas.forEach((z) => {
      out += '<g class="sala sala--zona" data-sala="' + esc(z.z.id) + '"' + attrsAbre(z.z.abre) + ">";
      out += '<rect x="' + z.x.toFixed(1) + '" y="' + z.y.toFixed(1) + '" width="' + z.w.toFixed(1) + '" height="' + z.h.toFixed(1) + '"/>';
      out += '<text x="' + z.tx.toFixed(1) + '" y="' + z.ty.toFixed(1) + '">' + esc(z.t) + "</text></g>";
    });
  });
  out += '<text class="acessos__escala" x="' + d.g.m + '" y="' + (d.H - 5) + '">Esquema de acessos, sem escala</text></svg>';
  return out;
}

// no celular a planta é transposta: a largura lá é a altura na grade, e vice-versa
function naGrade(orient, falta) {
  return (orient === "larga") === (falta === "largura") ? "mais larga" : "mais alta";
}

// as salas onde o texto não cabe, medidas no SVG já desenhado (vale para o desenho local e para o da Frente A):
// texto que passa da parede direita falta largura; que passa do pé da sala, ou desce sobre a primeira zona, falta altura
function medirApertos(svg, orient, planta) {
  const dono = new Map();
  planta.salas.forEach((s) => {
    dono.set(s.id, s);
    s.zonas.forEach((z) => dono.set(z.id, s));
  });
  const achados = new Map();
  let mediu = false;
  svg.querySelectorAll("g.sala[data-sala]").forEach((g) => {
    const s = dono.get(g.getAttribute("data-sala"));
    const r = g.querySelector("rect:not(.sala__luz)");
    if (!s || !r || achados.has(s.id)) return;
    const rx = +r.getAttribute("x"), ry = +r.getAttribute("y"), rw = +r.getAttribute("width"), rh = +r.getAttribute("height");
    let limiteY = ry + rh;
    if (!g.classList.contains("sala--zona")) {
      const primeira = s.zonas.length ? svg.querySelector('g.sala--zona[data-sala="' + CSS.escape(s.zonas[0].id) + '"] rect:not(.sala__luz)') : null;
      if (primeira) limiteY = Math.min(limiteY, +primeira.getAttribute("y") + 4);
    }
    for (const t of g.querySelectorAll(":scope > text")) {
      const b = t.getBBox();
      if (!b.width) continue;
      mediu = true;
      if (b.x + b.width > rx + rw - 2) {
        achados.set(s.id, { orient, sala: s, texto: t.textContent, naGrade: naGrade(orient, "largura") });
        break;
      }
      if (b.y + b.height > limiteY + 2) {
        achados.set(s.id, { orient, sala: s, texto: t.textContent, naGrade: naGrade(orient, "altura") });
        break;
      }
    }
  });
  return mediu ? [...achados.values()] : null;
}

// conta feita sem DOM (folha escondida): o layout local
function avisosCalculados(planta, nIngressos, orient) {
  const lista = [];
  const d = dimensoes(planta, orient);
  planta.salas.forEach((s) => {
    const a = layoutSala(s, geometriaSala(s, d, orient), d.g, nIngressos).apertado;
    if (a) lista.push({ orient, sala: s, texto: a.texto, naGrade: naGrade(orient, a.falta) });
  });
  return lista;
}

// as mesmas peças que secoes.js põe no site (luz, porta, cadeado) e o estado de "ver como"
function decorar(svg, ingressos, verComo, uid) {
  const el = (tag, attrs) => {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const pad = svg.querySelector("pattern");
  let hachura = null;
  if (pad) {
    hachura = pad.id + "-" + uid;
    pad.id = hachura;
  }
  svg.querySelectorAll("radialGradient").forEach((gr) => gr.remove());
  svg.querySelectorAll(".sala").forEach((g) => {
    const r = g.querySelector("rect");
    if (!r) return;
    const zona = g.classList.contains("sala--zona");
    if (hachura && !zona) r.style.fill = "url(#" + hachura + ")";
    const abre = verComo ? g.hasAttribute("data-" + verComo) : ingressos.some((i) => g.hasAttribute("data-" + i.id));
    g.classList.toggle("aberta", abre);
    g.classList.toggle("trancada", !abre && !zona);
    if (g.querySelector(".sala__luz")) return;
    const x = +r.getAttribute("x"), y = +r.getAttribute("y"), w = +r.getAttribute("width"), h = +r.getAttribute("height");
    const luz = r.cloneNode(false);
    luz.setAttribute("class", "sala__luz");
    luz.removeAttribute("style");
    g.insertBefore(luz, r);
    if (g.matches(".sala--zona, .sala--online, .sala--fora")) return;
    const L = Math.min(22, w * 0.2), px = x + w - 22 - L, yb = y + h;
    g.appendChild(el("path", { class: "porta__vao", d: "M" + px + " " + yb + " H" + (px + L) }));
    g.appendChild(el("path", { class: "porta__folha", d: "M" + px + " " + yb + " V" + (yb - L) }));
    g.appendChild(el("path", { class: "porta__arco", d: "M" + px + " " + (yb - L) + " A" + L + " " + L + " 0 0 1 " + (px + L) + " " + yb }));
    const donos = ingressos.filter((i) => g.hasAttribute("data-" + i.id));
    if (donos.length && donos.length < ingressos.length) {
      const c = el("g", { class: "sala__cadeado", transform: "translate(" + (x + 16) + " " + (yb - 30) + ")" });
      c.appendChild(el("path", { d: "M2.5 7 V4.5 a3.5 3.5 0 0 1 7 0 V7" }));
      c.appendChild(el("rect", { x: 0.5, y: 7, width: 11, height: 8.5, rx: 1.5 }));
      const tx = el("text", { x: 17, y: 14 });
      tx.textContent = donos[0].nome.toUpperCase();
      c.appendChild(tx);
      g.appendChild(c);
    }
  });
}

// ------------------------------------------------------------------ editor

export function abrirEditorPlanta(container, opcoes) {
  const uid = "pe" + ++contador;
  const ingressos = (opcoes.ingressos || []).map((i) => ({ id: String(i.id), nome: String(i.nome || i.id), cor: i.cor }));
  const aoMudar = typeof opcoes.aoMudar === "function" ? opcoes.aoMudar : () => {};
  const desenhoExterno = typeof opcoes.desenharPlanta === "function" ? opcoes.desenharPlanta : null;

  let planta = normalizar(opcoes.planta, ingressos);
  let sel = null; // id da sala selecionada
  let verComo = null; // null = todos
  const passado = [];
  const futuro = [];
  let gesto = null;
  let timerAviso = 0;
  let ultimoToque = null;

  const raiz = document.createElement("div");
  raiz.className = "pe";
  raiz.innerHTML = `
    <div class="pe-barra" role="toolbar" aria-label="Planta">
      <button type="button" class="pe-bt pe-bt--forte" data-acao="mais-sala" data-foco="mais-sala">${ICONES.mais}<span>Sala</span></button>
      <span class="pe-grupo">
        <button type="button" class="pe-bt pe-bt--icone" data-acao="desfazer" data-foco="desfazer" aria-label="Desfazer" title="Desfazer (Ctrl+Z)">${ICONES.desfazer}</button>
        <button type="button" class="pe-bt pe-bt--icone" data-acao="refazer" data-foco="refazer" aria-label="Refazer" title="Refazer (Ctrl+Y)">${ICONES.refazer}</button>
      </span>
      <span class="pe-grade-tam" role="group" aria-label="Tamanho da grade">
        <span class="pe-grade-tam__rot">Grade</span>
        <button type="button" class="pe-bt pe-bt--mini" data-acao="col-" data-foco="col-" aria-label="Menos uma coluna">${ICONES.menos}</button>
        <output class="pe-num" data-num="colunas" aria-label="colunas"></output>
        <button type="button" class="pe-bt pe-bt--mini" data-acao="col+" data-foco="col+" aria-label="Mais uma coluna">${ICONES.mais}</button>
        <span aria-hidden="true">×</span>
        <button type="button" class="pe-bt pe-bt--mini" data-acao="lin-" data-foco="lin-" aria-label="Menos uma linha">${ICONES.menos}</button>
        <output class="pe-num" data-num="linhas" aria-label="linhas"></output>
        <button type="button" class="pe-bt pe-bt--mini" data-acao="lin+" data-foco="lin+" aria-label="Mais uma linha">${ICONES.mais}</button>
      </span>
      <span class="pe-ver" role="radiogroup" aria-label="Ver como">
        <span class="pe-ver__rot">Ver como</span>
        <span class="pe-ver__opcoes"></span>
      </span>
    </div>
    <div class="pe-corpo">
      <div class="pe-palco">
        <div class="pe-folha" aria-label="Planta: arraste as salas para mover, puxe as alças para mudar o tamanho">
          <div class="pe-grade" aria-hidden="true"></div>
          <div class="pe-salas" role="listbox" aria-label="Salas"></div>
        </div>
      </div>
      <aside class="pe-inspetor" aria-label="Sala selecionada"></aside>
    </div>
    <section class="pe-previas" aria-label="Como fica no site">
      <figure class="pe-previa pe-previa--larga"><figcaption>No computador</figcaption><div class="pe-previa__folha acessos"></div></figure>
      <figure class="pe-previa pe-previa--alta"><figcaption>No celular</figcaption><div class="pe-previa__folha acessos"></div></figure>
      <ul class="pe-apertos" aria-live="polite"></ul>
    </section>
    <div class="pe-aviso" role="status" aria-live="polite" hidden><span class="pe-aviso__txt"></span><button type="button" class="pe-aviso__bt" data-acao="desfazer-aviso">Desfazer</button></div>
    <div class="pe-sr" aria-live="assertive"></div>`;
  container.appendChild(raiz);

  const $ = (s) => raiz.querySelector(s);
  const folha = $(".pe-folha");
  const grade = $(".pe-grade");
  const camada = $(".pe-salas");
  const inspetor = $(".pe-inspetor");
  const sr = $(".pe-sr");

  // ---------------------------------------------------------------- histórico

  function confirmar(nova, mensagem) {
    passado.push(JSON.stringify(planta));
    if (passado.length > 200) passado.shift();
    futuro.length = 0;
    planta = nova;
    if (sel && !planta.salas.some((s) => s.id === sel)) sel = null;
    desenhar();
    if (mensagem) falar(mensagem);
    aoMudar(copiar(planta));
  }

  function voltar(de, para, mensagem) {
    if (!de.length) return;
    para.push(JSON.stringify(planta));
    planta = JSON.parse(de.pop());
    if (sel && !planta.salas.some((s) => s.id === sel)) sel = null;
    esconderAviso();
    desenhar();
    falar(mensagem);
    aoMudar(copiar(planta));
  }
  const desfazer = () => voltar(passado, futuro, "Desfeito");
  const refazer = () => voltar(futuro, passado, "Refeito");

  function alterar(fn, mensagem) {
    const nova = copiar(planta);
    if (fn(nova) === false) return false;
    confirmar(nova, mensagem);
    return true;
  }

  function salaDe(p, id) {
    return p.salas.find((s) => s.id === id);
  }

  // ---------------------------------------------------------------- avisos

  function falar(t) {
    sr.textContent = "";
    requestAnimationFrame(() => (sr.textContent = t));
  }

  function avisar(texto, comDesfazer) {
    const av = $(".pe-aviso");
    av.querySelector(".pe-aviso__txt").textContent = texto;
    av.querySelector(".pe-aviso__bt").hidden = !comDesfazer;
    av.hidden = false;
    clearTimeout(timerAviso);
    timerAviso = setTimeout(esconderAviso, comDesfazer ? 7000 : 3500);
  }
  function esconderAviso() {
    clearTimeout(timerAviso);
    $(".pe-aviso").hidden = true;
  }

  // ---------------------------------------------------------------- desenho do editor

  function guardarFoco() {
    const a = document.activeElement;
    return a && raiz.contains(a) && a.dataset.foco ? a.dataset.foco : null;
  }
  function devolverFoco(chave) {
    if (!chave) return;
    const e = raiz.querySelector('[data-foco="' + CSS.escape(chave) + '"]');
    if (e) e.focus({ preventScroll: true });
  }

  function desenhar() {
    const foco = guardarFoco();
    desenharBarra();
    desenharFolha();
    desenharInspetor();
    desenharPrevias();
    devolverFoco(foco);
  }

  function desenharBarra() {
    $('[data-num="colunas"]').textContent = planta.colunas;
    $('[data-num="linhas"]').textContent = planta.linhas;
    $('[data-acao="desfazer"]').disabled = !passado.length;
    $('[data-acao="refazer"]').disabled = !futuro.length;
    const op = $(".pe-ver__opcoes");
    const opcoesVer = [{ id: null, nome: "Todos" }].concat(ingressos);
    op.innerHTML = opcoesVer
      .map((i) => {
        const on = verComo === i.id;
        const cor = i.id ? corDe(ingressos, i.id) : "var(--pe-tinta)";
        return `<button type="button" role="radio" class="pe-ver__op" aria-checked="${on}" tabindex="${on ? 0 : -1}" data-ver="${esc(i.id || "")}" data-foco="ver-${esc(i.id || "")}" style="--cor:${cor}">${esc(i.nome)}</button>`;
      })
      .join("");
  }

  function abreNaVisao(abre) {
    return verComo ? abre.includes(verComo) : abre.length > 0;
  }

  function pontos(abre) {
    return ingressos
      .filter((i) => abre.includes(i.id))
      .map((i) => `<span class="pe-ponto" style="--cor:${corDe(ingressos, i.id)}" title="${esc(i.nome)}">${esc(i.nome.slice(0, 1))}</span>`)
      .join("");
  }

  function descrever(s) {
    const tipo = TIPOS.find((t) => t.id === s.tipo).nome;
    const quem = s.abre.length ? ingressos.filter((i) => s.abre.includes(i.id)).map((i) => i.nome).join(" e ") : "ninguém";
    return `${s.nome || "Sem nome"}. ${tipo}, ${s.w} por ${s.h}, na coluna ${s.x + 1}, linha ${s.y + 1}. Entra: ${quem}.`;
  }

  function desenharFolha() {
    folha.style.setProperty("--cols", planta.colunas);
    folha.style.setProperty("--rows", planta.linhas);
    grade.innerHTML = "";
    camada.innerHTML = planta.salas
      .map((s) => {
        const ativa = s.id === sel;
        const aberta = abreNaVisao(s.abre);
        const donos = ingressos.filter((i) => s.abre.includes(i.id));
        const cadeado = !aberta && verComo && donos.length
          ? `<span class="pe-sala__cadeado">${ICONES.cadeado}<span>${esc(donos[0].nome)}</span></span>`
          : "";
        const zonas = s.zonas
          .map(
            (z) => `<div class="pe-zona${abreNaVisao(z.abre) ? " pe-zona--aberta" : ""}" data-zona="${esc(z.id)}">
              <span class="pe-zona__nome" data-editar="zona" data-zona="${esc(z.id)}">${esc(z.nome || "Zona sem nome")}</span>
              <span class="pe-pontos">${pontos(z.abre)}</span></div>`
          )
          .join("");
        const alcas = ativa
          ? ["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((d) => `<span class="pe-alca pe-alca--${d}" data-alca="${d}" aria-hidden="true"></span>`).join("")
          : "";
        return `<div class="pe-sala pe-sala--${s.tipo}${ativa ? " pe-sala--sel" : ""}${aberta ? " pe-sala--aberta" : " pe-sala--fechada"}"
            data-id="${esc(s.id)}" data-foco="sala-${esc(s.id)}" role="option" aria-selected="${ativa}" tabindex="${ativa || (!sel && s === planta.salas[0]) ? 0 : -1}"
            aria-label="${esc(descrever(s))}" aria-describedby="${uid}-dica"
            style="--x:${s.x};--y:${s.y};--w:${s.w};--h:${s.h}">
            <div class="pe-sala__topo">
              <span class="pe-sala__icone" title="${esc(TIPOS.find((t) => t.id === s.tipo).nome)}">${ICONES[s.tipo]}</span>
              <span class="pe-sala__textos">
                <span class="pe-sala__nome" data-editar="nome">${esc(s.nome || "Sem nome")}</span>
                <span class="pe-sala__detalhe${s.detalhe ? "" : " pe-vazio"}" data-editar="detalhe">${esc(s.detalhe || "＋ detalhe")}</span>
              </span>
            </div>
            <div class="pe-sala__zonas">${zonas}</div>
            <div class="pe-sala__pe"><span class="pe-pontos">${pontos(s.abre)}</span>${cadeado}</div>
            ${alcas}
          </div>`;
      })
      .join("") + `<span id="${uid}-dica" class="pe-sr-texto">Setas movem a sala. Shift e setas mudam o tamanho. Delete remove. F2 renomeia.</span>`;
    if (!planta.salas.length) {
      camada.insertAdjacentHTML("beforeend", `<p class="pe-vazio-folha">Planta vazia. Toque em ＋ Sala.</p>`);
    }
  }

  function chips(abre, alvo) {
    return `<div class="pe-chips" role="group" aria-label="Quem entra">${ingressos
      .map((i) => {
        const on = abre.includes(i.id);
        return `<button type="button" class="pe-chip" aria-pressed="${on}" data-chip="${esc(i.id)}" data-alvo="${esc(alvo)}" data-foco="chip-${esc(alvo)}-${esc(i.id)}" style="--cor:${corDe(ingressos, i.id)}"><span class="pe-chip__marca" aria-hidden="true">${on ? ICONES.ok : ""}</span>${esc(i.nome)}</button>`;
      })
      .join("")}</div>`;
  }

  function desenharInspetor() {
    const s = salaDe(planta, sel);
    if (!s) {
      inspetor.innerHTML = `<p class="pe-ajuda">Toque numa sala para editar.<br>Arraste para mover. Puxe os cantos para mudar o tamanho.</p>
        <p class="pe-ajuda pe-ajuda--fraca">${planta.salas.length} ${planta.salas.length === 1 ? "sala" : "salas"} na planta</p>`;
      return;
    }
    const zonas = s.zonas
      .map(
        (z, i) => `<li class="pe-zl">
          <input class="pe-campo pe-campo--zona" value="${esc(plano(z.nome))}" data-zona-nome="${esc(z.id)}" data-foco="zn-${esc(z.id)}" aria-label="Nome da zona ${i + 1}" placeholder="Nome da zona">
          <span class="pe-zl__acoes">
            <button type="button" class="pe-bt pe-bt--mini" data-acao="zona-sobe" data-zona="${esc(z.id)}" data-foco="zs-${esc(z.id)}" aria-label="Subir ${esc(z.nome)}" ${i === 0 ? "disabled" : ""}>${ICONES.cima}</button>
            <button type="button" class="pe-bt pe-bt--mini" data-acao="zona-desce" data-zona="${esc(z.id)}" data-foco="zd-${esc(z.id)}" aria-label="Descer ${esc(z.nome)}" ${i === s.zonas.length - 1 ? "disabled" : ""}>${ICONES.baixo}</button>
            <button type="button" class="pe-bt pe-bt--mini pe-bt--perigo" data-acao="zona-remove" data-zona="${esc(z.id)}" data-foco="zr-${esc(z.id)}" aria-label="Remover ${esc(z.nome)}">${ICONES.lixo}</button>
          </span>
          ${chips(z.abre, z.id)}
        </li>`
      )
      .join("");
    inspetor.innerHTML = `
      <label class="pe-rot" for="${uid}-nome">Nome</label>
      <input id="${uid}-nome" class="pe-campo pe-campo--nome" value="${esc(plano(s.nome))}" data-campo="nome" data-foco="i-nome" autocomplete="off">
      <label class="pe-rot" for="${uid}-det">Detalhe <span class="pe-rot__fraco">linha pequena embaixo do nome</span></label>
      <input id="${uid}-det" class="pe-campo" value="${esc(plano(s.detalhe))}" data-campo="detalhe" data-foco="i-det" autocomplete="off">
      <p class="pe-rot" id="${uid}-tipo">Tipo</p>
      <div class="pe-tipos" role="radiogroup" aria-labelledby="${uid}-tipo">${TIPOS.map(
        (t) => `<button type="button" role="radio" class="pe-tipo" aria-checked="${s.tipo === t.id}" data-tipo="${t.id}" data-foco="tipo-${t.id}">${ICONES[t.id]}<span>${t.nome}</span></button>`
      ).join("")}</div>
      <p class="pe-rot">Quem entra</p>
      ${chips(s.abre, "sala")}
      <p class="pe-rot">Zonas dentro da sala <span class="pe-rot__fraco">faixas, como fileiras de assento</span></p>
      <ul class="pe-zl-lista">${zonas}</ul>
      <button type="button" class="pe-bt" data-acao="mais-zona" data-foco="mais-zona">${ICONES.mais}<span>Zona</span></button>
      <hr class="pe-sep">
      <button type="button" class="pe-bt pe-bt--perigo" data-acao="remover-sala" data-foco="remover-sala">${ICONES.lixo}<span>Remover sala</span></button>`;
  }

  function desenharPrevias() {
    const lista = [];
    ["larga", "alta"].forEach((orient) => {
      const alvo = $(".pe-previa--" + orient + " .pe-previa__folha");
      let svg = null;
      if (desenhoExterno) {
        try {
          const r = desenhoExterno(copiar(planta), copiar(ingressos), orient, { marcar: true });
          if (typeof r === "string") alvo.innerHTML = r;
          else if (r && r.nodeType) alvo.replaceChildren(r);
          svg = alvo.querySelector("svg");
        } catch (e) {
          console.warn("desenharPlanta falhou; usando o desenho local", e);
        }
      }
      if (!svg) {
        alvo.innerHTML = desenharPlantaLocal(planta, ingressos, orient);
        svg = alvo.querySelector("svg");
      }
      svg.setAttribute("aria-hidden", "true");
      svg.classList.add("acessos__planta", "acessos__planta--" + orient);
      decorar(svg, ingressos, verComo, uid + orient);
      lista.push(...(medirApertos(svg, orient, planta) || avisosCalculados(planta, ingressos.length, orient)));
    });
    // um aviso por planta, com as salas apertadas como botões (tocar seleciona a sala)
    $(".pe-apertos").innerHTML = ["alta", "larga"]
      .map((orient) => {
        const daqui = lista.filter((a) => a.orient === orient);
        if (!daqui.length) return "";
        return `<li class="pe-aperto"><span class="pe-aperto__txt">${orient === "alta" ? "No celular" : "No computador"}, o texto não cabe em:</span>
          ${daqui
            .map(
              (a) => `<button type="button" class="pe-aperto__sala" data-ir="${esc(a.sala.id)}" data-foco="ap-${orient}-${esc(a.sala.id)}" title="“${esc(a.texto)}”: deixe a sala ${a.naGrade} na grade ou encurte o texto">${esc(a.sala.nome || "Sem nome")} <span aria-hidden="true">·</span> <span class="pe-aperto__dica">${a.naGrade}</span></button>`
            )
            .join("")}</li>`;
      })
      .join("");
  }

  // ---------------------------------------------------------------- ações

  function maisSala() {
    let lugar = null;
    for (const [w, h] of [[3, 2], [2, 2], [2, 1], [1, 1]]) {
      lugar = primeiroLivre(planta, w, h);
      if (lugar) break;
    }
    const nova = copiar(planta);
    const cresceu = !lugar;
    // sem espaço: a grade ganha colunas à direita. No celular (planta transposta) isso vira linhas embaixo, então as
    // salas lá não ficam mais estreitas; ganhar linhas apertaria todas as salas do celular
    if (!lugar) {
      lugar = { x: nova.colunas, y: 0, w: 3, h: Math.min(2, nova.linhas) };
      nova.colunas += 3;
    }
    const usados = new Set(nova.salas.map((s) => s.id));
    const sala = { id: novoId("sala", usados), nome: "Nova sala", detalhe: "", tipo: "sala", ...lugar, abre: ingressos.map((i) => i.id), zonas: [] };
    nova.salas.push(sala);
    sel = sala.id;
    confirmar(nova, "Sala nova adicionada");
    if (cresceu) avisar("Sem espaço livre: a grade ganhou 3 colunas.");
    focarSala(sala.id);
    editarNoLugar(sala.id, "nome");
  }

  function removerSala(id) {
    const s = salaDe(planta, id);
    if (!s) return;
    alterar((p) => {
      p.salas = p.salas.filter((x) => x.id !== id);
    }, "Sala removida");
    avisar(`“${s.nome || "Sem nome"}” removida.`, true);
    const prox = camada.querySelector(".pe-sala");
    if (prox) prox.focus({ preventScroll: true });
    else $('[data-acao="mais-sala"]').focus();
  }

  function mudarGrade(campo, delta) {
    const nova = copiar(planta);
    nova[campo] += delta;
    if (nova[campo] < 1) return;
    const fora = nova.salas.find((s) => !testarEspaco({ ...nova, salas: [] }, s).ok);
    if (fora) {
      avisar(`Não dá para diminuir: “${fora.nome || "Sem nome"}” ocupa ${campo === "colunas" ? "a última coluna" : "a última linha"}.`);
      return;
    }
    confirmar(nova, `${nova.colunas} colunas por ${nova.linhas} linhas`);
  }

  function tentarRetangulo(id, r, mensagem) {
    const t = testarEspaco(planta, r, id);
    if (!t.ok) {
      const q = t.motivo === "ocupado" ? `Não cabe: encosta em “${t.sala.nome || "Sem nome"}”.` : t.motivo === "fora" ? "Não cabe: passa da borda da grade." : "Tamanho mínimo.";
      falar(q);
      avisar(q);
      return false;
    }
    return alterar((p) => Object.assign(salaDe(p, id), r), mensagem);
  }

  function focarSala(id) {
    const e = camada.querySelector('[data-id="' + CSS.escape(id) + '"]');
    if (e) e.focus({ preventScroll: true });
  }

  function selecionar(id) {
    if (sel === id) return;
    sel = id;
    desenharFolha();
    desenharInspetor();
    if (id) focarSala(id);
  }

  // edição no lugar: o texto vira um campo por cima, Enter ou fora confirma, Esc desfaz
  function editarNoLugar(id, campo, zonaId) {
    const el = camada.querySelector('[data-id="' + CSS.escape(id) + '"]');
    if (!el) return;
    const alvo = zonaId
      ? el.querySelector('.pe-zona__nome[data-zona="' + CSS.escape(zonaId) + '"]')
      : el.querySelector('[data-editar="' + campo + '"]');
    if (!alvo) return;
    const s = salaDe(planta, id);
    const z = zonaId ? s.zonas.find((q) => q.id === zonaId) : null;
    const antes = z ? z.nome : s[campo];
    const inp = document.createElement("input");
    inp.className = "pe-no-lugar";
    inp.value = plano(antes);
    inp.setAttribute("aria-label", z ? "Nome da zona" : campo === "nome" ? "Nome da sala" : "Detalhe da sala");
    alvo.replaceWith(inp);
    inp.focus();
    inp.select();
    let feito = false;
    const fim = (salvar) => {
      if (feito) return;
      feito = true;
      const v = inp.value.trim();
      if (salvar && v !== plano(antes) && (v || campo === "detalhe")) {
        alterar((p) => {
          const ss = salaDe(p, id);
          if (zonaId) ss.zonas.find((q) => q.id === zonaId).nome = v;
          else ss[campo] = v;
        }, "Nome trocado");
      } else desenharFolha();
      focarSala(id);
    };
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") fim(true);
      else if (e.key === "Escape") fim(false);
    });
    // o toque que abriu o campo ainda solta o dedo e move o foco para a sala; nesse primeiro instante, o foco volta
    const desde = performance.now();
    inp.addEventListener("blur", () => {
      if (performance.now() - desde < 500) {
        setTimeout(() => !feito && inp.isConnected && inp.focus());
        return;
      }
      fim(true);
    });
    inp.addEventListener("pointerdown", (e) => e.stopPropagation());
  }

  // ---------------------------------------------------------------- arrastar e redimensionar

  function celula() {
    const r = folha.getBoundingClientRect();
    return { r, cw: r.width / planta.colunas, ch: r.height / planta.linhas };
  }

  function aplicarFantasma(el, ret, ok) {
    el.style.setProperty("--x", ret.x);
    el.style.setProperty("--y", ret.y);
    el.style.setProperty("--w", ret.w);
    el.style.setProperty("--h", ret.h);
    el.classList.toggle("pe-sala--nao-cabe", !ok);
  }

  function aoApertar(e) {
    if (e.button > 0) return;
    const salaEl = e.target.closest(".pe-sala");
    if (!salaEl) {
      if (e.target.closest(".pe-folha")) selecionar(null);
      return;
    }
    const id = salaEl.dataset.id;
    const toque = e.pointerType === "touch";
    // dois toques/cliques seguidos no mesmo texto: renomear ali mesmo (o DOM é refeito a cada seleção e o ponteiro fica
    // preso à folha, então o dblclick nativo não chega ao texto; a contagem é feita aqui)
    const ed = e.target.closest("[data-editar]");
    const chave = ed ? id + "|" + ed.dataset.editar + "|" + (ed.dataset.zona || "") : null;
    const agora = performance.now();
    if (chave && ultimoToque && ultimoToque.chave === chave && agora - ultimoToque.t < 450 && id === sel) {
      ultimoToque = null;
      e.preventDefault();
      editarNoLugar(id, ed.dataset.editar === "zona" ? "nome" : ed.dataset.editar, ed.dataset.zona);
      return;
    }
    ultimoToque = chave ? { chave, t: agora } : null;
    // toque numa sala não selecionada só seleciona (a página continua rolando pelo dedo)
    if (toque && id !== sel) {
      gesto = { tipo: "tocar", id, x0: e.clientX, y0: e.clientY, alvoEditar: e.target.closest("[data-editar]") };
      gesto.timer = setTimeout(() => longo(), 550);
      return;
    }
    const alca = e.target.closest("[data-alca]");
    if (id !== sel) selecionar(id);
    const el = camada.querySelector('[data-id="' + CSS.escape(id) + '"]');
    const s = salaDe(planta, id);
    gesto = {
      tipo: alca ? "redimensionar" : "mover",
      dir: alca ? alca.dataset.alca : "",
      id,
      el,
      orig: { x: s.x, y: s.y, w: s.w, h: s.h },
      atual: { x: s.x, y: s.y, w: s.w, h: s.h },
      x0: e.clientX,
      y0: e.clientY,
      mexeu: false,
      alvoEditar: alca ? null : e.target.closest("[data-editar]"),
      ponteiro: e.pointerId,
    };
    if (gesto.alvoEditar) gesto.timer = setTimeout(() => longo(), 550);
    folha.setPointerCapture(e.pointerId);
    e.preventDefault();
  }

  function longo() {
    if (!gesto || gesto.mexeu || !gesto.alvoEditar) return;
    const g = gesto;
    gesto = null;
    if (g.ponteiro != null && folha.hasPointerCapture(g.ponteiro)) folha.releasePointerCapture(g.ponteiro);
    if (g.tipo === "tocar") selecionar(g.id);
    const a = camada.querySelector('[data-id="' + CSS.escape(g.id) + '"] [data-editar="' + g.alvoEditar.dataset.editar + '"]' + (g.alvoEditar.dataset.zona ? '[data-zona="' + CSS.escape(g.alvoEditar.dataset.zona) + '"]' : ""));
    if (a) editarNoLugar(g.id, a.dataset.editar === "zona" ? "nome" : a.dataset.editar, a.dataset.zona);
  }

  function aoMover(e) {
    if (!gesto) return;
    const dx = e.clientX - gesto.x0, dy = e.clientY - gesto.y0;
    if (!gesto.mexeu && Math.hypot(dx, dy) < 5) return;
    if (gesto.tipo === "tocar") {
      clearTimeout(gesto.timer);
      gesto = null;
      return;
    }
    gesto.mexeu = true;
    clearTimeout(gesto.timer);
    const { cw, ch } = celula();
    const cx = Math.round(dx / cw), cy = Math.round(dy / ch);
    const o = gesto.orig;
    let r;
    if (gesto.tipo === "mover") {
      r = {
        x: Math.min(Math.max(0, o.x + cx), planta.colunas - o.w),
        y: Math.min(Math.max(0, o.y + cy), planta.linhas - o.h),
        w: o.w,
        h: o.h,
      };
    } else {
      const d = gesto.dir;
      let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
      if (d.includes("e")) x1 = Math.min(planta.colunas, Math.max(x0 + 1, x1 + cx));
      if (d.includes("w")) x0 = Math.max(0, Math.min(x1 - 1, x0 + cx));
      if (d.includes("s")) y1 = Math.min(planta.linhas, Math.max(y0 + 1, y1 + cy));
      if (d.includes("n")) y0 = Math.max(0, Math.min(y1 - 1, y0 + cy));
      r = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }
    gesto.atual = r;
    const t = testarEspaco(planta, r, gesto.id);
    gesto.ok = t.ok;
    aplicarFantasma(gesto.el, r, t.ok);
    folha.classList.add("pe-folha--gesto");
  }

  function aoSoltar(e) {
    if (!gesto) return;
    const g = gesto;
    gesto = null;
    clearTimeout(g.timer);
    folha.classList.remove("pe-folha--gesto");
    if (g.ponteiro != null && folha.hasPointerCapture(g.ponteiro)) folha.releasePointerCapture(g.ponteiro);
    if (g.tipo === "tocar") {
      if (e.type === "pointerup") selecionar(g.id);
      return;
    }
    if (!g.mexeu) return;
    const o = g.orig, a = g.atual;
    const mudou = o.x !== a.x || o.y !== a.y || o.w !== a.w || o.h !== a.h;
    if (!mudou || e.type === "pointercancel") return desenharFolha(), focarSala(g.id);
    if (!g.ok) {
      const t = testarEspaco(planta, a, g.id);
      desenharFolha();
      focarSala(g.id);
      avisar(t.motivo === "ocupado" ? `Não cabe aí: encosta em “${t.sala.nome || "Sem nome"}”.` : "Não cabe aí.");
      return;
    }
    alterar((p) => Object.assign(salaDe(p, g.id), a), g.tipo === "mover" ? "Sala movida" : "Tamanho mudado");
    focarSala(g.id);
  }

  // ---------------------------------------------------------------- eventos

  function aoClicar(e) {
    const b = e.target.closest("button");
    if (!b || !raiz.contains(b)) return;
    const acao = b.dataset.acao;
    if (b.dataset.ver !== undefined) {
      verComo = b.dataset.ver || null;
      desenhar();
      falar("Vendo como " + (verComo ? ingressos.find((i) => i.id === verComo).nome : "todos"));
      return;
    }
    if (b.dataset.ir) {
      selecionar(b.dataset.ir);
      return;
    }
    if (b.dataset.tipo) {
      const tipo = b.dataset.tipo;
      alterar((p) => {
        const s = salaDe(p, sel);
        if (s.tipo === tipo) return false;
        s.tipo = tipo;
      }, "Tipo: " + TIPOS.find((t) => t.id === tipo).nome);
      return;
    }
    if (b.dataset.chip) {
      const ing = b.dataset.chip, alvo = b.dataset.alvo;
      alterar((p) => {
        const s = salaDe(p, sel);
        const obj = alvo === "sala" ? s : s.zonas.find((z) => z.id === alvo);
        const tem = obj.abre.includes(ing);
        // mantém a ordem dos ingressos
        obj.abre = ingressos.map((i) => i.id).filter((id) => (id === ing ? !tem : obj.abre.includes(id)));
      }, "Acesso trocado");
      return;
    }
    switch (acao) {
      case "mais-sala": return maisSala();
      case "desfazer": return desfazer();
      case "refazer": return refazer();
      case "desfazer-aviso": esconderAviso(); return desfazer();
      case "col-": return mudarGrade("colunas", -1);
      case "col+": return mudarGrade("colunas", 1);
      case "lin-": return mudarGrade("linhas", -1);
      case "lin+": return mudarGrade("linhas", 1);
      case "remover-sala": return removerSala(sel);
      case "mais-zona": {
        const usados = new Set(planta.salas.flatMap((s) => s.zonas.map((z) => z.id)));
        const zid = novoId(sel + "-zona", usados);
        alterar((p) => {
          const s = salaDe(p, sel);
          s.zonas.push({ id: zid, nome: "Nova zona", abre: s.abre.slice() });
        }, "Zona adicionada");
        const inp = raiz.querySelector('[data-zona-nome="' + CSS.escape(zid) + '"]');
        if (inp) (inp.focus(), inp.select());
        return;
      }
      case "zona-sobe":
      case "zona-desce": {
        const zid = b.dataset.zona;
        alterar((p) => {
          const zs = salaDe(p, sel).zonas;
          const i = zs.findIndex((z) => z.id === zid), j = acao === "zona-sobe" ? i - 1 : i + 1;
          if (j < 0 || j >= zs.length) return false;
          [zs[i], zs[j]] = [zs[j], zs[i]];
        }, "Zona movida");
        return;
      }
      case "zona-remove": {
        const zid = b.dataset.zona;
        const nome = salaDe(planta, sel).zonas.find((z) => z.id === zid).nome;
        alterar((p) => {
          const s = salaDe(p, sel);
          s.zonas = s.zonas.filter((z) => z.id !== zid);
        }, "Zona removida");
        avisar(`Zona “${nome}” removida.`, true);
        return;
      }
    }
  }

  function aoTrocarCampo(e) {
    const t = e.target;
    if (t.dataset.campo) {
      const v = t.value.trim();
      const campo = t.dataset.campo;
      if (campo === "nome" && !v) return desenharInspetor();
      alterar((p) => {
        const s = salaDe(p, sel);
        if (plano(s[campo]) === v) return false;
        s[campo] = v;
      }, campo === "nome" ? "Nome trocado" : "Detalhe trocado");
    } else if (t.dataset.zonaNome) {
      const v = t.value.trim();
      alterar((p) => {
        const z = salaDe(p, sel).zonas.find((q) => q.id === t.dataset.zonaNome);
        if (plano(z.nome) === v) return false;
        z.nome = v;
      }, "Zona renomeada");
    }
  }

  function aoTeclar(e) {
    const emCampo = e.target.matches("input, textarea");
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !emCampo && e.key.toLowerCase() === "z") {
      e.preventDefault();
      return e.shiftKey ? refazer() : desfazer();
    }
    if (mod && !emCampo && e.key.toLowerCase() === "y") {
      e.preventDefault();
      return refazer();
    }
    if (emCampo && e.key === "Enter") {
      e.preventDefault();
      e.target.blur();
      return;
    }
    // ver como: setas trocam a opção (grupo de rádio)
    const radio = e.target.closest('[role="radio"]');
    if (radio && /^Arrow/.test(e.key)) {
      const irmaos = Array.from(radio.parentElement.querySelectorAll('[role="radio"]'));
      const i = irmaos.indexOf(radio) + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1);
      const prox = irmaos[(i + irmaos.length) % irmaos.length];
      e.preventDefault();
      prox.focus();
      prox.click();
      return;
    }
    const salaEl = e.target.closest(".pe-sala");
    if (!salaEl || e.target !== salaEl) return;
    const id = salaEl.dataset.id;
    const s = salaDe(planta, id);
    const passo = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (passo) {
      e.preventDefault();
      if (sel !== id) selecionar(id);
      const r = e.shiftKey
        ? { x: s.x, y: s.y, w: s.w + passo[0], h: s.h + passo[1] }
        : { x: s.x + passo[0], y: s.y + passo[1], w: s.w, h: s.h };
      if (tentarRetangulo(id, r, e.shiftKey ? `Tamanho ${r.w} por ${r.h}` : `Coluna ${r.x + 1}, linha ${r.y + 1}`)) focarSala(id);
      return;
    }
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      return removerSala(id);
    }
    if (e.key === "F2" || e.key === "Enter") {
      e.preventDefault();
      if (sel !== id) selecionar(id);
      return editarNoLugar(id, "nome");
    }
    if (e.key === " ") {
      e.preventDefault();
      return selecionar(id);
    }
    if (e.key === "Escape") return selecionar(null);
    if (e.key === "Home" || e.key === "End" || e.key === "Tab") return;
  }

  function aoFocar(e) {
    // roving tabindex: a sala focada é a que recebe o Tab
    const salaEl = e.target.closest && e.target.closest(".pe-sala");
    if (salaEl && e.target === salaEl) {
      camada.querySelectorAll(".pe-sala").forEach((x) => (x.tabIndex = x === salaEl ? 0 : -1));
    }
  }


  folha.addEventListener("pointerdown", aoApertar);
  folha.addEventListener("pointermove", aoMover);
  folha.addEventListener("pointerup", aoSoltar);
  folha.addEventListener("pointercancel", aoSoltar);
  folha.addEventListener("contextmenu", (e) => {
    if (e.target.closest(".pe-sala")) e.preventDefault();
  });
  raiz.addEventListener("click", aoClicar);
  raiz.addEventListener("change", aoTrocarCampo);
  raiz.addEventListener("keydown", aoTeclar);
  raiz.addEventListener("focusin", aoFocar);

  desenhar();
  // a medida do texto depende da fonte: redesenha a prévia quando ela chega
  let vivo = true;
  if (document.fonts && document.fonts.load) {
    Promise.all([document.fonts.load('500 14px "Proza Libre"'), document.fonts.load('400 12px "Proza Libre"')])
      .then(() => vivo && desenharPrevias())
      .catch(() => {});
  }

  return {
    fechar() {
      vivo = false;
      clearTimeout(timerAviso);
      raiz.remove();
    },
    obter() {
      return copiar(planta);
    },
  };
}
