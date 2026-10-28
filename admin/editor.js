/* Editor na própria página: a prévia é a página real (renderizar(dados, { edicao: true }) num iframe) e cada coisa
   se edita onde aparece. Texto: clique e escreva (Enter confirma, Esc desfaz). Foto: painel "Trocar foto".
   Lista: barra ＋ ⧉ ↑ ↓ 🗑 no item. O que não aparece na página: painel lateral curto e "Configurações da edição".
   Desfazer/refazer, rascunho salvo sozinho no Supabase, "Publicar". */
import { h, $, ICONE, aviso, anunciar, confirmar, dialogo, local, quando, diaDaSemana, msgDeErro, botaoCarregando } from "./ui.js";
import { noDe, partes, juntar, obter, definir, usarSchema, usarDados, limitesDaLista, itemVazio, rotuloDe, ajudaDe, tipoDe, opcoesDe, nomeDoItem, nomeDaCoisa, contextoDe } from "./campos.js";
import { prepararHtml, criarPrevia } from "./previa.js";
import { criarLugares } from "./lugares.js";
import { criarAbaEvento } from "./evento.js";
import { TIPOS_IMAGEM, LIMITE_MB, enviarFoto } from "./midia.js";

const ESCONDER = /^(\$schema|versao)$/;
const ehImagem = (v) => !!v && typeof v === "object" && !Array.isArray(v) && typeof v.src === "string";
const ehPlanta = (c) => /(^|\.)planta(\.|$)/.test(c);
const SALVAR_APOS = 1200;
const LARGURA = { celular: 390, computador: 1440 };

/* estilo injetado na página da prévia: contornos do que é editável */
const ESTILO_PREVIA = `
  html { scroll-behavior: auto !important; }
  [data-campo], [data-campo-img], [data-planta] { cursor: pointer; }
  [data-campo] { cursor: text; }
  @media (hover: hover) {
    [data-campo]:hover:not(.ed-editando) { outline: 2px dashed rgba(180,138,69,.95); outline-offset: 3px; border-radius: 2px; }
    [data-campo-img]:hover { outline: 3px solid rgba(180,138,69,.95); outline-offset: -3px; }
    [data-planta]:hover { outline: 3px solid rgba(180,138,69,.95); outline-offset: 4px; }
  }
  .ed-sel { outline: 2px solid #b48a45 !important; outline-offset: 3px !important; }
  img.ed-sel { outline-offset: -3px !important; }
  .ed-editando { outline: 2px solid #1a5a46 !important; outline-offset: 4px !important; cursor: text !important;
    -webkit-user-select: text !important; user-select: text !important; caret-color: currentColor; min-width: 1ch; }
  .ed-editando:empty::before, [data-campo]:empty::before { content: "Escreva aqui"; opacity: .45; font-style: italic; }
  [data-campo]:empty { display: inline-block; min-width: 6ch; min-height: 1em; outline: 1px dashed rgba(180,138,69,.7); }
  @keyframes ed-pisca { 0%, 100% { outline-color: rgba(180,138,69,0); } 50% { outline-color: rgba(180,138,69,1); } }
  .ed-pisca { outline: 3px solid #b48a45 !important; outline-offset: 6px !important; border-radius: 4px; animation: ed-pisca .8s ease-in-out 3; }
  .ed-token { background: rgba(180,138,69,.22); border-radius: 4px; padding: 0 .12em; cursor: pointer; }
  [data-previa-sem-mapa] { background: #e7ebe6; }
  ::selection { background: rgba(185,142,74,.35); }
`;

/* barra do item e afins, dentro do iframe mas isolada do CSS do site (shadow DOM) */
const ESTILO_SOBRE = `
  :host { all: initial; }
  .camada { position: absolute; left: 0; top: 0; width: 0; height: 0; z-index: 2147483000; font: 500 13px/1.2 "Proza Libre", "Segoe UI", system-ui, sans-serif; color: #071613; }
  .caixa { position: absolute; border: 1.5px dashed rgba(26,90,70,.75); border-radius: 6px; pointer-events: none; display: none; }
  .barra { position: absolute; display: none; align-items: center; gap: 2px; padding: 3px; background: #0c2420; color: #f8f4ec;
    border-radius: 10px; box-shadow: 0 6px 18px rgba(7,22,19,.28), 0 1px 3px rgba(7,22,19,.3); white-space: nowrap; }
  .barra .nome { padding: 0 8px 0 9px; font-size: 12px; letter-spacing: .01em; color: #d4b073; max-width: 160px; overflow: hidden; text-overflow: ellipsis; }
  button { all: unset; box-sizing: border-box; display: inline-grid; place-items: center; width: 34px; height: 34px; border-radius: 7px; cursor: pointer; color: inherit; }
  button:hover { background: rgba(248,244,236,.14); }
  button:focus-visible { outline: 2px solid #d4b073; outline-offset: 1px; }
  button[disabled] { opacity: .32; cursor: default; background: none; }
  button.perigo:hover { background: #a3271b; }
  svg { width: 18px; height: 18px; }
  .toque button { width: 44px; height: 44px; }
  .toque svg { width: 20px; height: 20px; }
  .vazia { position: absolute; display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px 8px 10px; border-radius: 999px;
    background: #f8f4ec; color: #1a5a46; border: 1.5px dashed #1a5a46; cursor: pointer; font: inherit; width: auto; height: auto; }
  .vazia:hover { background: #fff; }
  .dica { position: absolute; display: none; gap: 10px; align-items: center; padding: 6px 6px 6px 10px; border-radius: 8px; background: #1a5a46; color: #fff;
    font-size: 12px; box-shadow: 0 4px 14px rgba(7,22,19,.25); white-space: nowrap; }
  .dica kbd { font: inherit; padding: 1px 5px; border-radius: 4px; background: rgba(255,255,255,.18); }
  .dica button { width: auto; height: 26px; padding: 0 9px; border-radius: 6px; background: rgba(255,255,255,.16); font-size: 12px; }
  .dica button:hover { background: rgba(255,255,255,.28); }
`;

export function abrirEditor(app, { linha, R, schema }) {
  const { sb, CONFIG } = app;
  usarSchema(schema);

  /* ---------------------------------------------------------------- estado */
  const E = {
    edicao: { id: linha.id, slug: linha.slug, nome: linha.nome, ativa: linha.ativa },
    dados: structuredClone(linha.dados || {}),
    base: linha.atualizado_em,
    hist: [], futuro: [],
    ultimoGrupo: null, ultimoEm: 0,
    salvo: "salvo", salvarTimer: 0, salvando: false, tentativas: 0,
    disp: local.ler("painel-disp") || (matchMedia("(max-width: 699px)").matches ? "celular" : "computador"),
    editando: null,     // { el, caminho, original, ... }
    sel: null,          // elemento de item selecionado (data-item) na prévia
    hover: null,
    painel: null,       // { tipo, ... }
    renderTimer: 0,
    enviando: 0,
    visiveis: new Set(), inline: new Set(),
    fotosEnviadas: new Map(), // ref midia: -> { larguras, url(l) }
    vivo: true,
  };
  usarDados(E.dados);
  const toque = matchMedia("(hover: none), (pointer: coarse)").matches;

  /* ---------------------------------------------------------------- moldura */
  const estadoEl = h("span", { class: "ed__estado", role: "status", "aria-live": "polite" });
  const btnDesfazer = h("button", { type: "button", class: "icone-botao", "aria-label": "Desfazer", title: "Desfazer (Ctrl+Z)", html: ICONE.desfazer, onclick: () => desfazer() });
  const btnRefazer = h("button", { type: "button", class: "icone-botao", "aria-label": "Refazer", title: "Refazer (Ctrl+Shift+Z)", html: ICONE.refazer, onclick: () => refazer() });
  const btnDisp = ["celular", "computador"].map((d) => h("button", {
    type: "button", class: "alternar__op", "aria-pressed": String(E.disp === d), "data-disp": d,
    onclick: () => trocarDisp(d),
  }, h("span", { html: ICONE[d] }), h("span", { class: "alternar__txt", text: d === "celular" ? "Celular" : "Computador" })));
  // duas abas: a página (editar onde aparece) e o evento (datas, locais, Google: muda no site inteiro)
  const btnAbas = [["pagina", "Página"], ["evento", "Evento"]].map(([id, nome]) => h("button", {
    type: "button", role: "tab", class: "abas__aba", id: "aba-" + id, "aria-selected": String(id === "pagina"),
    "aria-controls": id === "pagina" ? "aba-pagina-painel" : "aba-evento-painel", "data-aba": id, onclick: () => trocarAba(id),
  }, nome));
  const abas = h("div", { class: "abas", role: "tablist", "aria-label": "O que editar" }, ...btnAbas);
  const btnPublicar = h("button", { type: "button", class: "botao botao--ouro botao--pequeno", id: "publicar", text: "Publicar", onclick: () => publicar() });

  const topo = h("header", { class: "ed__topo" },
    h("a", { class: "ed__voltar", href: "#/", "aria-label": "Voltar para as edições", html: ICONE.voltar }),
    h("div", { class: "ed__nome" }, h("strong", { class: "ed__titulo", text: E.edicao.nome || E.edicao.slug }), estadoEl),
    abas,
    h("div", { class: "ed__ferramentas" },
      h("div", { class: "ed__historico" }, btnDesfazer, btnRefazer),
      h("div", { class: "alternar", role: "group", "aria-label": "Ver a prévia como" }, ...btnDisp)),
    btnPublicar);

  const aparelho = h("div", { class: "ed__aparelho" });
  const carregando = h("div", { class: "ed__carregando" }, h("span", { class: "giro", "aria-hidden": "true" }), "Montando a página…");
  const palco = h("div", { class: "ed__palco", role: "tabpanel", id: "aba-pagina-painel", "aria-labelledby": "aba-pagina" }, aparelho, carregando);
  const painelCorpo = h("div", { class: "painel-lado__corpo" });
  const painelTitulo = h("h2", { class: "painel-lado__titulo", id: "painel-lado-titulo" });
  const painelSub = h("p", { class: "painel-lado__sub" });
  const painel = h("aside", { class: "painel-lado", "aria-labelledby": "painel-lado-titulo", hidden: true },
    h("div", { class: "painel-lado__alca", "aria-hidden": "true" }),
    h("header", { class: "painel-lado__cabeca" },
      h("div", null, painelTitulo, painelSub),
      h("button", { type: "button", class: "icone-botao", "aria-label": "Fechar painel", html: ICONE.fechar, onclick: () => fecharPainel() })),
    painelCorpo);
  const primeiraVez = !local.ler("painel-dica-vista");
  const dica = h("div", { class: "ed__dica", hidden: !primeiraVez, role: "note" },
    h("p", null, h("strong", { text: toque ? "Toque" : "Clique" }), ` em qualquer texto ou foto da página para mudar. Para itens de lista (horários, benefícios, palestrantes), ${toque ? "toque" : "passe o mouse"} no item. Tudo salva sozinho; o site só muda quando você publicar.`),
    h("button", { type: "button", class: "botao botao--pequeno", text: "Entendi", onclick: () => { dica.hidden = true; local.gravar("painel-dica-vista", 1); medir(); } }));
  // barra de baixo (celular): desfazer, refazer, configurações, aparelho
  const barraBaixo = h("nav", { class: "ed__baixo", "aria-label": "Ferramentas" },
    h("button", { type: "button", class: "ed__baixo-btn", onclick: () => desfazer(), "aria-label": "Desfazer" }, h("span", { html: ICONE.desfazer }), h("span", { text: "Desfazer" })),
    h("button", { type: "button", class: "ed__baixo-btn", onclick: () => refazer(), "aria-label": "Refazer" }, h("span", { html: ICONE.refazer }), h("span", { text: "Refazer" })),
    h("button", { type: "button", class: "ed__baixo-btn", onclick: () => trocarDisp(E.disp === "celular" ? "computador" : "celular") },
      h("span", { class: "ed__baixo-disp", html: ICONE.computador }), h("span", { class: "ed__baixo-disp-txt", text: "Computador" })));
  // barra de edição de texto (celular): aparece com o teclado
  const btnMais = h("button", { type: "button", class: "botao botao--claro botao--pequeno", hidden: true, onclick: () => maisOpcoesDoEditando() });
  const barraTexto = h("div", { class: "ed__texto-barra", hidden: true },
    h("button", { type: "button", class: "botao botao--claro botao--pequeno", text: "Cancelar", onpointerdown: (e) => e.preventDefault(), onclick: () => terminarEdicao(false) }),
    btnMais,
    h("button", { type: "button", class: "botao botao--pequeno", text: "Pronto", onpointerdown: (e) => e.preventDefault(), onclick: () => terminarEdicao(true) }));
  const lugaresMotor = criarLugares(R, { edicao: true, midiaBase: R.MIDIA_URL, validar: false });
  const evento = criarAbaEvento({
    E, R, toque, contextoDe, urlDaMidia: (v) => urlDaMidia(v), baseSite: CONFIG.baseSite,
    mudar: (fn, o) => mudar(fn, o),
    desfazer: () => desfazer(),
    lugaresDe: (cs) => lugaresMotor.lugares(E.dados, cs),
    irParaLugar: (sel, rotulo) => irParaLugar(sel, rotulo),
    irParaCampo: async (c) => { trocarAba("pagina"); await esperarPrevia(); irPara(c); },
    abrirPainelFoto: (img, c) => abrirPainelFoto(img, c),
    grupoDeCampos: (cs) => grupoDeCampos(cs),
    camposSemLugar: () => camposDeConfig(),
    renomear: (v) => renomear(v),
  });
  const raiz = h("div", { class: "ed", "data-disp": E.disp, "data-aba": "pagina" }, topo, dica, h("div", { class: "ed__corpo" }, palco, evento.el, painel), barraBaixo, barraTexto);

  function trocarAba(aba) {
    if (raiz.dataset.aba === aba) return;
    terminarEdicao(true);
    fecharPainel();
    raiz.dataset.aba = aba;
    btnAbas.forEach((b) => b.setAttribute("aria-selected", String(b.dataset.aba === aba)));
    // a prévia continua montada por baixo (escondida): ao voltar, ela já está em dia
    if (aba === "evento") evento.mostrar();
    else { evento.esconder(); medir(); posicionarSobre(); }
    anunciar(aba === "evento" ? "Aba Evento" : "Aba Página");
  }

  // leva até um lugar da página: troca de aba, rola até lá e pisca o contorno
  async function irParaLugar(seletor, rotulo) {
    trocarAba("pagina");
    await esperarPrevia();
    const doc = previa.doc;
    const el = doc?.querySelector(seletor);
    if (!el || !el.getClientRects().length) { aviso(`${rotulo || "Esse lugar"} não aparece na tela agora.`); return; }
    el.scrollIntoView({ block: "center" });
    el.classList.remove("ed-pisca");
    void el.offsetWidth;
    el.classList.add("ed-pisca");
    setTimeout(() => el.classList.remove("ed-pisca"), 2600);
    anunciar(rotulo || "");
  }

  // a prévia em dia: espera o redesenho que estiver agendado ou em andamento
  async function esperarPrevia() {
    await new Promise((r) => setTimeout(r, 120));
    await renderizando;
  }

  async function renomear(v) {
    if (!v || v === E.edicao.nome) return;
    const { error } = await sb.from("edicoes").update({ nome: v }).eq("id", E.edicao.id);
    if (error) { aviso("Não foi possível trocar o nome. " + msgDeErro(error), "erro"); return; }
    E.edicao.nome = v;
    topo.querySelector(".ed__titulo").textContent = v;
    aviso("Nome da edição trocado.");
  }

  /* ---------------------------------------------------------------- prévia */
  const previa = criarPrevia(aparelho, { aoCarregar: ligarPagina, estilo: ESTILO_PREVIA });

  function medir() {
    const r = palco.getBoundingClientRect();
    const W = r.width, H = r.height;
    if (!W || !H) return;
    const estreito = W < 560;
    const topoM = estreito ? 0 : 24;
    if (E.disp === "celular") {
      // no celular de verdade a página ocupa a largura toda (sem moldura); no computador, um aparelho de 390
      const w = estreito ? W : LARGURA.celular;
      const altura = estreito ? H : Math.min(H - topoM * 2, 900);
      aparelho.style.cssText = `width:${w}px;height:${altura}px;transform:translateX(-50%);`;
      aparelho.dataset.escala = "1";
    } else {
      const m = estreito ? 12 : 24;
      const s = Math.min(1, (W - m * 2) / LARGURA.computador);
      const altura = (H - m * 2) / s;
      aparelho.style.cssText = `width:${LARGURA.computador}px;height:${altura}px;transform:translateX(-50%) scale(${s});`;
      aparelho.dataset.escala = String(s);
    }
  }
  const obsTamanho = new ResizeObserver(() => { medir(); posicionarSobre(); });

  function trocarDisp(d) {
    if (E.disp === d) return;
    terminarEdicao(true);
    E.disp = d;
    local.gravar("painel-disp", d);
    raiz.dataset.disp = d;
    btnDisp.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.disp === d)));
    barraBaixo.querySelector(".ed__baixo-disp").innerHTML = d === "celular" ? ICONE.computador : ICONE.celular;
    barraBaixo.querySelector(".ed__baixo-disp-txt").textContent = d === "celular" ? "Computador" : "Celular";
    medir();
    anunciar(d === "celular" ? "Prévia no celular" : "Prévia no computador");
  }

  let renderizando = Promise.resolve();
  function agendarRender(ancora, depois) {
    clearTimeout(E.renderTimer);
    return new Promise((ok) => {
      E.renderTimer = setTimeout(() => { renderizando = renderizar1(ancora).then(() => { depois?.(); ok(); }); }, 60);
    });
  }

  function estadoDoSite() {
    const d = previa.doc;
    if (!d) return null;
    return {
      abas: [...d.querySelectorAll('[role="tab"][aria-selected="true"]')].map((b) => b.id).filter(Boolean),
      detalhes: [...d.querySelectorAll("details")].map((x) => x.open),
    };
  }

  async function renderizar1(ancora) {
    let html;
    try {
      html = R.renderizar(E.dados, { edicao: true, midiaBase: R.MIDIA_URL || CONFIG.urlPublica(""), validar: false });
    } catch (e) {
      console.warn("painel: renderizador falhou", e);
      aviso("A prévia não conseguiu mostrar esta mudança. " + (e?.message ? "Detalhe: " + e.message : ""), "erro");
      return;
    }
    const pronto = await prepararHtml(html, { base: CONFIG.baseSite });
    const r = await previa.mostrar(pronto, { ancora, estado: estadoDoSite() });
    if (r) carregando.hidden = true;
  }

  function urlDaMidia(ref, largura) {
    if (ehImagem(ref)) { largura ??= ref.larguras?.length ? ref.larguras.at(-1) : null; ref = ref.src; }
    if (typeof ref !== "string") return "";
    if (ref.startsWith("blob:") || /^https?:/.test(ref)) return ref;
    if (ref.startsWith("midia:")) {
      const c = ref.slice(6);
      const reg = E.fotosEnviadas.get(ref);
      const l = largura || reg?.larguras?.at(-1) || 800;
      return CONFIG.urlPublica(l && !/\.\w+$/.test(c) ? `${c}-${l}.webp` : c);
    }
    return new URL(ref, CONFIG.baseSite).href;
  }

  /* ---------------------------------------------------------------- ligar a página carregada */
  let sobre = null; // { raiz, camada, caixa, barra, dica, vazias }
  let repetindo = false;

  function ligarPagina(win, doc, estado) {
    // volta a aba de ingresso e os "ver tudo" abertos como estavam antes de redesenhar
    if (estado) {
      repetindo = true;
      try {
        for (const id of estado.abas) doc.getElementById(id)?.click();
        doc.querySelectorAll("details").forEach((d, i) => { if (estado.detalhes[i]) d.open = true; });
      } finally { repetindo = false; }
    }
    corrigirMidia(doc);
    // o que aparece na página e o que dá para editar escrevendo
    E.visiveis = new Set();
    E.inline = new Set();
    for (const el of doc.querySelectorAll("[data-campo]")) {
      const cs = el.getAttribute("data-campo").trim().split(/\s+/);
      cs.forEach((c) => E.visiveis.add(juntar(c)));
      if (cs.length === 1 && editavelEscrevendo(cs[0])) E.inline.add(juntar(cs[0]));
    }
    for (const el of doc.querySelectorAll("[data-campo-img]")) E.visiveis.add(juntar(el.getAttribute("data-campo-img")));
    for (const el of doc.querySelectorAll("img[data-campo-img]")) el.setAttribute("draggable", "false");

    // camada da barra (shadow DOM)
    const host = doc.createElement("div");
    host.setAttribute("data-painel-sobre", "");
    const sombra = host.attachShadow({ mode: "open" });
    sombra.innerHTML = `<style>${ESTILO_SOBRE}</style><div class="camada${toque ? " toque" : ""}"><div class="caixa"></div><div class="barra" role="toolbar"></div><div class="dica"></div></div>`;
    doc.body.append(host);
    sobre = { host, sombra, camada: sombra.querySelector(".camada"), caixa: sombra.querySelector(".caixa"), barra: sombra.querySelector(".barra"), dica: sombra.querySelector(".dica"), vazias: [] };
    // listas vazias ganham um botão "Adicionar"
    for (const lista of doc.querySelectorAll("[data-lista]")) {
      if (lista.querySelector(":scope > [data-item]")) continue;
      const caminho = lista.getAttribute("data-lista");
      const b = doc.createElement("button");
      b.className = "vazia";
      b.innerHTML = ICONE.mais + `<span>Adicionar ${nomeDaCoisa(caminho)}</span>`;
      b.addEventListener("click", (e) => { e.stopPropagation(); acaoLista("adicionar", caminho, -1); });
      sobre.camada.append(b);
      sobre.vazias.push({ b, lista });
    }
    sobre.barra.addEventListener("pointerdown", (e) => e.preventDefault()); // não tira o foco do texto em edição
    sobre.barra.addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b || b.disabled) return;
      e.stopPropagation();
      const item = E.sel || E.hover;
      if (!item) return;
      const lista = item.parentElement.closest("[data-lista]");
      acaoLista(b.dataset.acao, lista.getAttribute("data-lista"), Number(item.getAttribute("data-item")));
    });
    sobre.barra.addEventListener("mouseenter", () => clearTimeout(E.hoverTimer));
    sobre.barra.addEventListener("mouseleave", () => agendarSairHover());

    doc.addEventListener("click", aoClicar, true);
    doc.addEventListener("submit", (e) => e.preventDefault(), true);
    doc.addEventListener("keydown", aoTeclar, true);
    doc.addEventListener("pointerover", aoPassar, true);
    doc.addEventListener("dragstart", (e) => e.preventDefault(), true);
    win.addEventListener("scroll", posicionarSobre, { passive: true });
    win.addEventListener("resize", posicionarSobre);
    doc.addEventListener("focusout", (e) => {
      if (E.editando && e.target === E.editando.el) setTimeout(() => { if (E.editando && previa.doc?.activeElement !== E.editando.el) terminarEdicao(true); }, 0);
    });

    // a seleção sobrevive ao redesenho (o mesmo item, pelo caminho)
    if (E.selChave) {
      const el = doc.querySelector(`[data-lista="${E.selChave.lista}"] > [data-item="${E.selChave.i}"]`);
      selecionar(el || null);
    } else selecionar(null);
    posicionarSobre();
    // pedido pendente: começar a editar um campo assim que a página nova estiver pronta
    if (E.depoisDeCarregar) { const f = E.depoisDeCarregar; E.depoisDeCarregar = null; f(doc); }
  }

  // fotos que existem só no bucket (enviadas agora): a página da prévia aponta para lá
  function corrigirMidia(doc) {
    for (const img of doc.querySelectorAll("img")) {
      const src = img.getAttribute("src") || "";
      const m = src.match(/(?:^midia:|assets\/midia\/)(.+?)$/);
      if (!m) continue;
      let c = m[1];
      if (!/\.\w+$/.test(c)) {
        const reg = E.fotosEnviadas.get("midia:" + c);
        c = `${c}-${reg?.larguras?.at(-1) || 800}.webp`;
      }
      img.setAttribute("src", CONFIG.urlPublica(c));
      img.removeAttribute("srcset");
      img.closest("picture")?.querySelectorAll("source").forEach((s) => s.remove());
    }
  }

  function editavelEscrevendo(c) {
    const v = obter(E.dados, c);
    const t = tipoDe(c, v);
    return t === "texto" || t === "texto-longo" || t === "numero";
  }

  /* ---------------------------------------------------------------- cliques e teclas na página */
  function aoClicar(e) {
    if (repetindo) return;
    const doc = previa.doc;
    const t = e.target;
    if (!(t instanceof doc.defaultView.Element)) return;
    if (t.closest("[data-painel-sobre]")) return;
    const ed = E.editando;
    if (ed && ed.el.contains(t)) {
      const tok = t.closest(".ed-token");
      if (tok) { e.preventDefault(); abrirPainelCampos([juntar(ed.caminho)], { dicaToken: tok.dataset.token }); }
      return;
    }
    const link = t.closest("a[href]");
    const img = t.closest("[data-campo-img]");
    let campo = t.closest("[data-campo]");
    const config = t.closest("[data-config]");
    if (campo && config && !config.contains(campo)) campo = null; // o bloco derivado está dentro do texto: vale o mais de dentro
    const planta = t.closest("[data-planta]");
    const item = t.closest("[data-item]");
    const controle = t.closest("button, summary, [role='tab'], label, select, input");
    if (link) e.preventDefault();
    if (ed) terminarEdicao(true);

    if (planta && !campo) {
      e.preventDefault(); e.stopPropagation();
      selecionar(item);
      abrirPlanta(planta.getAttribute("data-planta") || "ingressos.planta");
      return;
    }
    if (config && !campo && !img && !(controle && !link)) {
      e.preventDefault(); e.stopPropagation();
      selecionar(item, config);
      abrirPainelBloco(config.getAttribute("data-config"));
      return;
    }
    if (img) {
      e.preventDefault(); e.stopPropagation();
      selecionar(item, img);
      abrirPainelFoto(img);
      return;
    }
    if (campo) {
      // texto dentro de um botão do site (aba de ingresso, "ver tudo"): o primeiro toque usa o botão, o segundo edita
      if (controle && !link && !campo.classList.contains("ed-sel")) {
        selecionar(item, campo);
        if (!local.ler("painel-dica-botao")) { aviso(`${toque ? "Toque" : "Clique"} de novo no texto para editar.`); local.gravar("painel-dica-botao", 1); }
        return; // deixa o site trocar a aba
      }
      e.preventDefault(); e.stopPropagation();
      selecionar(item, campo);
      comecarEdicao(campo, e);
      return;
    }
    if (item) {
      if (!controle) { e.preventDefault(); e.stopPropagation(); }
      selecionar(item);
      return;
    }
    if (!controle || link) { e.stopPropagation(); }
    selecionar(null);
    if (E.painel?.tipo !== "config") fecharPainel();
  }

  function aoTeclar(e) {
    if (E.editando) return; // o próprio texto em edição trata as teclas
    atalhos(e);
  }

  function atalhos(e) {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) {
      if (e.key === "Escape") { if (E.painel) fecharPainel(); else selecionar(null); }
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); desfazer(); }
    else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); refazer(); }
    else if (k === "s") { e.preventDefault(); salvarAgora(); }
  }

  function aoPassar(e) {
    if (toque || e.pointerType === "touch") return;
    const t = e.target;
    if (t.closest?.("[data-painel-sobre]")) return;
    const item = t.closest?.("[data-item]") || null;
    if (item === E.hover) { clearTimeout(E.hoverTimer); return; }
    if (!item) { agendarSairHover(); return; }
    clearTimeout(E.hoverTimer);
    E.hover = item;
    posicionarSobre();
  }
  function agendarSairHover() {
    clearTimeout(E.hoverTimer);
    E.hoverTimer = setTimeout(() => { E.hover = null; posicionarSobre(); }, 350);
  }

  /* ---------------------------------------------------------------- seleção e barra do item */
  function selecionar(item, alvo) {
    const doc = previa.doc;
    doc?.querySelectorAll(".ed-sel").forEach((x) => x.classList.remove("ed-sel"));
    E.sel = item || null;
    E.selChave = item ? { lista: item.parentElement.closest("[data-lista]")?.getAttribute("data-lista"), i: item.getAttribute("data-item") } : null;
    if (alvo) alvo.classList.add("ed-sel");
    posicionarSobre();
  }

  function posicionarSobre() {
    if (!sobre || !previa.win) return;
    const win = previa.win;
    const sx = win.scrollX, sy = win.scrollY;
    const item = E.sel || E.hover;
    const { caixa, barra } = sobre;
    if (item && item.isConnected && item.getClientRects().length) {
      const r = item.getBoundingClientRect();
      caixa.style.cssText = `display:block;left:${r.left + sx - 6}px;top:${r.top + sy - 6}px;width:${r.width + 12}px;height:${r.height + 12}px;`;
      montarBarra(item);
      const bw = barra.offsetWidth || 220, bh = barra.offsetHeight || 40;
      const vw = win.document.documentElement.clientWidth || win.innerWidth;
      let x = r.right + sx - bw + 6;
      x = Math.max(sx + 6, Math.min(x, sx + vw - bw - 6));
      let y = r.top + sy - bh - 10;
      if (r.top - bh - 10 < 4) y = r.bottom + sy + 10; // sem espaço em cima: vai para baixo
      barra.style.left = x + "px";
      barra.style.top = y + "px";
      barra.style.display = "flex";
    } else {
      caixa.style.display = "none";
      barra.style.display = "none";
    }
    for (const { b, lista } of sobre.vazias) {
      const r = lista.getBoundingClientRect();
      const visivel = lista.getClientRects().length > 0;
      b.style.display = visivel ? "inline-flex" : "none";
      b.style.left = r.left + sx + "px";
      b.style.top = r.top + sy + "px";
    }
    posicionarDicaEdicao();
  }

  function montarBarra(item) {
    const listaEl = item.parentElement.closest("[data-lista]");
    const caminho = listaEl.getAttribute("data-lista");
    const i = Number(item.getAttribute("data-item"));
    const arr = obter(E.dados, caminho) || [];
    const lim = limitesDaLista(caminho);
    const coisa = nomeDaCoisa(caminho);
    const chave = `${caminho}|${i}|${arr.length}`;
    if (sobre.barra.dataset.chave === chave) return;
    sobre.barra.dataset.chave = chave;
    const cheio = arr.length >= lim.max, minimo = arr.length <= lim.min;
    const nome = nomeDoItem(caminho, i, arr[i]);
    sobre.barra.setAttribute("aria-label", `${coisa}: ${nome}`);
    const b = (acao, icone, rotulo, desligado, classe = "") =>
      `<button type="button" data-acao="${acao}" class="${classe}" aria-label="${rotulo}" title="${rotulo}" ${desligado ? "disabled" : ""}>${icone}</button>`;
    const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    sobre.barra.innerHTML =
      `<span class="nome">${esc(coisa.charAt(0).toUpperCase() + coisa.slice(1))}</span>` +
      b("adicionar", ICONE.mais, `Adicionar ${coisa} abaixo`, cheio) +
      b("duplicar", ICONE.duplicar, `Duplicar ${coisa}`, cheio) +
      b("subir", ICONE.cima, "Mover para cima", i === 0) +
      b("descer", ICONE.baixo, "Mover para baixo", i >= arr.length - 1) +
      b("remover", ICONE.lixo, `Remover ${coisa}`, minimo, "perigo");
  }

  /* ---------------------------------------------------------------- ações de lista */
  function acaoLista(acao, caminho, i) {
    terminarEdicao(true);
    const arr = obter(E.dados, caminho);
    if (!Array.isArray(arr)) return;
    const lim = limitesDaLista(caminho);
    const coisa = nomeDaCoisa(caminho);
    let foco = i, editarNovo = false;
    if ((acao === "adicionar" || acao === "duplicar") && arr.length >= lim.max) { aviso(`Esta lista aceita no máximo ${lim.max}.`); return; }
    if (acao === "remover" && arr.length <= lim.min) { aviso(lim.min === 1 ? "Precisa ficar pelo menos 1." : `Precisa ficar pelo menos ${lim.min}.`); return; }
    mudar((d) => {
      const a = obter(d, caminho);
      if (acao === "adicionar") { a.splice(i + 1, 0, itemVazio(caminho, a[Math.max(0, i)])); foco = i + 1; editarNovo = true; }
      else if (acao === "duplicar") { a.splice(i + 1, 0, structuredClone(a[i])); foco = i + 1; }
      else if (acao === "subir" && i > 0) { [a[i - 1], a[i]] = [a[i], a[i - 1]]; foco = i - 1; }
      else if (acao === "descer" && i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; foco = i + 1; }
      else if (acao === "remover") { a.splice(i, 1); foco = Math.min(i, a.length - 1); }
    }, { rotulo: `${acao} ${coisa}`, ancora: `[data-lista="${caminho}"]` });
    E.selChave = foco >= 0 ? { lista: caminho, i: String(foco) } : null;
    if (sobre) sobre.barra.dataset.chave = "";
    if (editarNovo) {
      E.depoisDeCarregar = (doc) => {
        const item = doc.querySelector(`[data-lista="${caminho}"] > [data-item="${foco}"]`);
        const alvo = item && (item.matches("[data-campo]") ? item : item.querySelector("[data-campo]"));
        if (alvo && E.inline.has(juntar(alvo.getAttribute("data-campo")))) { alvo.scrollIntoView({ block: "center" }); comecarEdicao(alvo); }
      };
    }
    if (acao === "remover") aviso(`${coisa.charAt(0).toUpperCase() + coisa.slice(1)} removido.`, null, { rotulo: "Desfazer", fazer: desfazer });
  }

  /* ---------------------------------------------------------------- edição de texto no lugar */
  const escHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const plano = (s) => String(s).replace(/\*([^*]+)\*/g, "$1").replace(/\s+/g, " ").trim();

  // o pedaço que cada {marcador} virou na página (para mostrar a data de verdade dentro do texto em edição)
  function tokensResolvidos(bruto, textoNaPagina) {
    const nomes = [...String(bruto).matchAll(/\{([a-z_0-9]+)\}/gi)].map((m) => m[1]);
    if (!nomes.length) return {};
    const re = new RegExp("^" + plano(bruto).split(/\{[a-z_0-9]+\}/i).map(reEsc).join("(.+?)") + "$");
    const m = textoNaPagina.replace(/\s+/g, " ").trim().match(re);
    const r = {};
    if (m) nomes.forEach((n, i) => (r[n] = m[i + 1]));
    return r;
  }

  function brutoParaHtml(bruto, tokens) {
    return escHtml(bruto)
      .replace(/\*([^*\n]+)\*/g, "<em>$1</em>")
      .replace(/\n/g, "<br>")
      .replace(/\{([a-z_0-9]+)\}/gi, (t, n) => `<span class="ed-token" contenteditable="false" data-token="${n}" title="Preenchido sozinho pelas datas do Clube">${escHtml(tokens[n] || n)}</span>`);
  }

  function serializar(el) {
    let s = "";
    for (const n of el.childNodes) {
      if (n.nodeType === 3) s += n.data;
      else if (n.nodeType === 1) {
        const t = n.tagName;
        if (n.dataset?.token) s += `{${n.dataset.token}}`;
        else if (t === "BR") s += "\n";
        else if (t === "EM" || t === "I") { const x = serializar(n); s += x.trim() ? `*${x}*` : x; }
        else if (t === "DIV" || t === "P") s += (s && !s.endsWith("\n") ? "\n" : "") + serializar(n);
        else s += serializar(n);
      }
    }
    return s;
  }

  function comecarEdicao(el, evento) {
    const doc = previa.doc;
    const caminho = el.getAttribute("data-campo").trim().split(/\s+/);
    // texto montado de vários campos ou campo que não se escreve (data, hora): painel
    if (caminho.length > 1 || !E.inline.has(juntar(caminho[0]))) {
      abrirPainelCampos(caminho.map(juntar), { el });
      return;
    }
    const c = juntar(caminho[0]);
    const valor = obter(E.dados, c);
    const numero = typeof valor === "number";
    const bruto = numero ? String(valor) : String(valor ?? "");
    const multilinha = tipoDe(c, valor) === "texto-longo" && /\n/.test(bruto) || /nome|detalhe/.test(c) && /\n/.test(bruto);
    const original = el.innerHTML;
    const tokens = tokensResolvidos(bruto, el.textContent);
    el.innerHTML = numero ? escHtml(bruto) : brutoParaHtml(bruto, tokens);
    el.setAttribute("contenteditable", numero ? "plaintext-only" : "true");
    el.setAttribute("spellcheck", "true");
    el.classList.add("ed-editando");
    el.classList.remove("ed-sel");
    E.editando = { el, caminho: c, original, bruto, numero, multilinha };
    el.focus({ preventScroll: true });
    // cursor onde a pessoa clicou (ou no fim)
    const sel = doc.getSelection();
    let r = null;
    if (evento && doc.caretRangeFromPoint) r = doc.caretRangeFromPoint(evento.clientX, evento.clientY);
    if (!r || !el.contains(r.startContainer)) { r = doc.createRange(); r.selectNodeContents(el); r.collapse(false); }
    sel.removeAllRanges(); sel.addRange(r);
    el.addEventListener("keydown", teclaNoTexto);
    el.addEventListener("paste", colarTexto);
    el.addEventListener("input", aoDigitar);
    const extras = camposRelacionados([c]).length;
    btnMais.hidden = !extras;
    btnMais.textContent = `Mais opções (${extras})`;
    if (toque) { barraTexto.hidden = false; barraBaixo.hidden = true; }
    mostrarDicaEdicao(extras);
    anunciar(`Editando ${rotuloDe(c)}. Enter confirma, Esc desfaz.`);
  }

  function aoDigitar() { posicionarSobre(); }

  function teclaNoTexto(e) {
    const ed = E.editando;
    if (!ed) return;
    if (e.key === "Escape") { e.preventDefault(); terminarEdicao(false); return; }
    if (e.key === "Enter") {
      if (e.shiftKey && ed.multilinha) { e.preventDefault(); previa.doc.execCommand("insertLineBreak"); return; }
      e.preventDefault();
      terminarEdicao(true);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "i" && !ed.numero) { e.preventDefault(); previa.doc.execCommand("italic"); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") e.preventDefault();
    if ((e.ctrlKey || e.metaKey) && ["z", "y"].includes(e.key.toLowerCase())) {
      // desfazer dentro do texto: o navegador cuida; com o texto intocado, desfaz a última mudança da página
      if (serializar(ed.el) === ed.bruto) { e.preventDefault(); terminarEdicao(false); atalhos(e); }
    }
  }

  function colarTexto(e) {
    e.preventDefault();
    const t = (e.clipboardData?.getData("text/plain") || "").replace(/\r/g, "");
    previa.doc.execCommand("insertText", false, E.editando?.multilinha ? t : t.replace(/\s*\n\s*/g, " "));
  }

  function terminarEdicao(confirmarMudanca) {
    const ed = E.editando;
    if (!ed) return;
    E.editando = null;
    const { el } = ed;
    el.removeEventListener("keydown", teclaNoTexto);
    el.removeEventListener("paste", colarTexto);
    el.removeEventListener("input", aoDigitar);
    el.removeAttribute("contenteditable");
    el.classList.remove("ed-editando");
    barraTexto.hidden = true; barraBaixo.hidden = false;
    esconderDicaEdicao();
    let novo = serializar(el).replace(/ /g, " ");
    if (!ed.multilinha) novo = novo.replace(/\s*\n\s*/g, " ");
    novo = novo.replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim().replace(/\*\*/g, "");
    if (!confirmarMudanca || novo === ed.bruto.trim()) {
      el.innerHTML = ed.original;
      previa.doc?.getSelection()?.removeAllRanges();
      return;
    }
    let valor = novo;
    if (ed.numero) {
      const n = Number(novo.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""));
      if (!novo.trim() || !Number.isFinite(n)) { el.innerHTML = ed.original; aviso("Aqui vai só um número.", "erro"); return; }
      valor = n;
    }
    previa.doc?.getSelection()?.removeAllRanges();
    mudar((d) => definir(d, ed.caminho, valor), { rotulo: rotuloDe(ed.caminho), ancora: `[data-campo="${el.getAttribute("data-campo")}"]` });
  }

  function mostrarDicaEdicao(extras) {
    if (!sobre || toque) return;
    sobre.dica.innerHTML = `<span><kbd>Enter</kbd> confirma · <kbd>Esc</kbd> desfaz${E.editando?.multilinha ? " · <kbd>Shift+Enter</kbd> nova linha" : ""}</span>` +
      (extras ? `<button type="button" data-mais>Mais opções (${extras})</button>` : "");
    sobre.dica.querySelector("[data-mais]")?.addEventListener("pointerdown", (e) => { e.preventDefault(); maisOpcoesDoEditando(); });
    sobre.dica.style.display = "flex";
    posicionarDicaEdicao();
  }
  function esconderDicaEdicao() { if (sobre) sobre.dica.style.display = "none"; }
  function posicionarDicaEdicao() {
    const ed = E.editando;
    if (!sobre || !ed || sobre.dica.style.display === "none") return;
    const win = previa.win;
    const r = ed.el.getBoundingClientRect();
    const w = sobre.dica.offsetWidth;
    sobre.dica.style.left = Math.max(win.scrollX + 6, Math.min(r.left + win.scrollX, win.scrollX + win.innerWidth - w - 6)) + "px";
    sobre.dica.style.top = r.bottom + win.scrollY + 10 + "px";
  }
  function maisOpcoesDoEditando() {
    const ed = E.editando;
    if (!ed) return;
    const c = ed.caminho;
    terminarEdicao(true);
    abrirPainelCampos([c], { soRelacionados: true });
  }

  /* ---------------------------------------------------------------- campos sem lugar na página */
  // folhas de um objeto (sem entrar em listas de objetos), como caminhos
  function folhasDe(caminhoObj) {
    const o = obter(E.dados, caminhoObj);
    const out = [];
    if (!o || typeof o !== "object" || Array.isArray(o)) return out;
    for (const [k, v] of Object.entries(o)) {
      if (ESCONDER.test(k)) continue;
      const c = caminhoObj ? `${caminhoObj}.${k}` : k;
      if (ehImagem(v)) out.push(c);
      else if (v && typeof v === "object" && !Array.isArray(v)) out.push(...folhasDe(c));
      else if (Array.isArray(v) && v.some((x) => x && typeof x === "object")) continue;
      else out.push(c);
    }
    return out;
  }
  const precisaPainel = (c) => !E.inline.has(c) && !(E.visiveis.has(c) && tipoDe(c, obter(E.dados, c)) === "imagem");
  const ehAlt = (c) => /(_alt|\.alt)$/.test(c);

  // campos do mesmo bloco que só se mudam pelo painel
  function camposRelacionados(caminhos) {
    const conj = new Set();
    for (const c of caminhos) {
      const p = partes(c);
      const pai = p.slice(0, -1).join(".");
      for (const f of folhasDe(pai)) {
        if (caminhos.includes(f) || !precisaPainel(f) || ehAlt(f) || ehPlanta(f)) continue;
        if (tipoDe(f, obter(E.dados, f)) === "imagem" || tipoDe(f, obter(E.dados, f)) === "video") continue;
        conj.add(f);
      }
    }
    return [...conj];
  }

  function abrirPainelCampos(caminhos, { el, soRelacionados, dicaToken } = {}) {
    const principais = soRelacionados ? [] : caminhos.filter((c) => !E.inline.has(c) || caminhos.length > 1);
    const extras = camposRelacionados(caminhos).filter((c) => !principais.includes(c));
    const todos = [...principais, ...extras];
    if (!todos.length) { aviso("Este texto se muda escrevendo direto na página."); return; }
    const titulo = principais.some((c) => /\.data$/.test(c)) ? "Datas" : contextoDe(todos[0] + ".x") || rotuloDe(todos[0]);
    abrirPainel({
      tipo: "campos",
      titulo: soRelacionados ? `Mais opções · ${contextoDe(caminhos[0]) || rotuloDe(partes(caminhos[0]).slice(0, -1).join("."))}` : titulo,
      sub: dicaToken ? "A parte destacada no texto sai destas datas. Mude aqui e o texto acompanha." : principais.length ? "O que aparece neste trecho da página." : "Dados deste bloco que não aparecem escritos na página.",
      corpo: [
        principais.length ? grupoDeCampos(principais) : null,
        extras.length ? (principais.length
          ? h("details", { class: "painel-mais" }, h("summary", { text: `Outros dados deste bloco (${extras.length})` }), grupoDeCampos(extras))
          : grupoDeCampos(extras)) : null,
      ],
    });
    painelCorpo.querySelector("input, select, textarea")?.focus({ preventScroll: true });
  }

  // agrupa pelo bloco (Dia 1, Dia 2...) e desenha cada campo
  function grupoDeCampos(caminhos) {
    const grupos = new Map();
    for (const c of caminhos) {
      const g = contextoDe(c);
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(c);
    }
    const frag = h("div", { class: "campos" });
    for (const [g, cs] of grupos) {
      const bloco = h("div", { class: "campos__grupo" }, g ? h("h3", { class: "campos__titulo", text: g }) : null);
      for (const c of cs) bloco.append(campoDoPainel(c));
      frag.append(bloco);
    }
    return frag;
  }

  let seq = 0;
  function campoDoPainel(c) {
    const valor = obter(E.dados, c);
    const tipo = tipoDe(c, valor);
    const id = "pc-" + (++seq);
    const rotulo = rotuloDe(c);
    const ajuda = ajudaDe(c);
    const wrap = h("div", { class: "campo campo--painel", "data-caminho": c });
    const lab = h("label", { class: "campo__rotulo", for: id, text: rotulo });
    const aj = ajuda ? h("span", { class: "campo__ajuda", id: id + "-a", text: ajuda }) : null;
    const gravar = (v, grupo) => mudar((d) => definir(d, c, v), { rotulo, grupo: grupo || c, semRender: false });
    let entrada;
    if (tipo === "data") {
      const semana = h("span", { class: "campo__extra", text: diaDaSemana(valor) });
      entrada = h("input", { class: "campo__entrada", id, type: "date", value: valor || "", "aria-describedby": aj ? id + "-a" : null });
      entrada.addEventListener("change", () => { if (!entrada.value) return; semana.textContent = diaDaSemana(entrada.value); gravar(entrada.value); });
      wrap.append(lab, aj, h("div", { class: "campo__linha" }, entrada, semana));
      return wrap;
    }
    if (tipo === "hora") {
      entrada = h("input", { class: "campo__entrada campo__entrada--curta", id, type: "time", value: valor || "", step: 300 });
      entrada.addEventListener("change", () => entrada.value && gravar(entrada.value));
    } else if (tipo === "numero") {
      entrada = h("input", { class: "campo__entrada campo__entrada--curta", id, type: "number", value: valor ?? "", inputmode: "decimal", step: "any" });
      entrada.addEventListener("change", () => { const n = Number(entrada.value); if (entrada.value !== "" && Number.isFinite(n)) gravar(n); });
    } else if (tipo === "escolha") {
      const ops = opcoesDe(c) || [];
      entrada = h("select", { class: "campo__entrada", id }, ...ops.map((o) => h("option", { value: o.valor, text: o.rotulo, selected: o.valor === valor })));
      entrada.addEventListener("change", () => gravar(entrada.value));
    } else if (tipo === "ingressos") {
      const ings = obter(E.dados, "ingressos.lista") || [];
      const marcado = new Set(Array.isArray(valor) ? valor : []);
      entrada = h("div", { class: "fichas", role: "group", "aria-label": rotulo },
        ...ings.map((ing) => {
          const b = h("button", { type: "button", class: "ficha", "aria-pressed": String(marcado.has(ing.id)), text: ing.nome || ing.id });
          b.addEventListener("click", () => {
            const on = b.getAttribute("aria-pressed") !== "true";
            b.setAttribute("aria-pressed", String(on));
            const novo = ings.map((x) => x.id).filter((x) => (x === ing.id ? on : marcado.has(x)));
            on ? marcado.add(ing.id) : marcado.delete(ing.id);
            gravar(novo);
          });
          return b;
        }));
      wrap.append(h("p", { class: "campo__rotulo", text: rotulo }), aj, entrada);
      return wrap;
    } else if (tipo === "lista-numeros") {
      const dias = obter(E.dados, "datas.dias") || [];
      entrada = h("div", { class: "campo__linha" }, ...valor.map((n, i) => {
        const inp = h("input", { class: "campo__entrada campo__entrada--curta", type: "number", value: n, inputmode: "numeric", "aria-label": `${rotulo}: ${dias[i] ? "Dia " + (i + 1) : "valor " + (i + 1)}` });
        inp.addEventListener("change", () => { const arr = [...obter(E.dados, c)]; arr[i] = Number(inp.value) || 0; gravar(arr); });
        return h("label", { class: "campo__mini" }, h("span", { text: dias[i] ? `Dia ${i + 1}` : `${i + 1}` }), inp);
      }));
      wrap.append(h("p", { class: "campo__rotulo", text: rotulo }), aj, entrada);
      return wrap;
    } else if (tipo === "imagem") {
      const url = urlDaMidia(valor, 480);
      const b = h("button", { type: "button", class: "miniatura" }, url ? h("img", { src: url, alt: "" }) : h("span", { text: "Sem foto" }), h("span", { class: "miniatura__txt", text: "Trocar foto" }));
      b.addEventListener("click", () => abrirPainelFoto(null, c));
      wrap.append(h("p", { class: "campo__rotulo", text: rotulo }), b);
      return wrap;
    } else {
      const longo = tipo === "texto-longo";
      entrada = h(longo ? "textarea" : "input", { class: "campo__entrada", id, rows: longo ? 3 : null, type: longo ? null : "text", "aria-describedby": aj ? id + "-a" : null });
      entrada.value = valor ?? "";
      let t = 0;
      const enviar = () => { clearTimeout(t); if (entrada.value !== obter(E.dados, c)) gravar(entrada.value, c); };
      entrada.addEventListener("input", () => { clearTimeout(t); t = setTimeout(enviar, 700); });
      entrada.addEventListener("change", enviar);
    }
    wrap.append(lab, aj, entrada);
    return wrap;
  }

  /* ---------------------------------------------------------------- painel lateral (folha no celular) */
  function abrirPainel({ tipo, titulo, sub, corpo }) {
    E.painel = { tipo };
    painelTitulo.textContent = titulo;
    painelSub.textContent = sub || "";
    painelSub.hidden = !sub;
    painelCorpo.replaceChildren(...[corpo].flat().filter(Boolean));
    painelCorpo.scrollTop = 0;
    painel.hidden = false;
    raiz.classList.add("ed--painel");
    requestAnimationFrame(() => painel.classList.add("painel-lado--aberto"));
  }
  function fecharPainel() {
    if (!E.painel) return;
    E.painel = null;
    painel.classList.remove("painel-lado--aberto");
    raiz.classList.remove("ed--painel");
    painel.hidden = true;
    painelCorpo.replaceChildren();
  }

  /* ---------------------------------------------------------------- configurações da edição */
  function camposDeConfig() {
    return folhasProfundas("").filter((f) => precisaPainel(f) && !ehAlt(f) && !ehPlanta(f) && !/\.(id)$/.test(f));
  }

  function abrirConfiguracoes() {
    terminarEdicao(true);
    const todos = folhasProfundas("").filter((f) => precisaPainel(f) && !ehAlt(f) && !ehPlanta(f) && !/\.(id)$/.test(f));
    const datas = todos.filter((c) => c.startsWith("datas."));
    const seo = todos.filter((c) => c.startsWith("textos.seo."));
    const outros = todos.filter((c) => !datas.includes(c) && !seo.includes(c));
    const nome = h("input", { class: "campo__entrada", id: "cfg-nome", type: "text", value: E.edicao.nome || "", maxlength: 80 });
    nome.addEventListener("change", async () => {
      const v = nome.value.trim();
      if (!v || v === E.edicao.nome) return;
      const { error } = await sb.from("edicoes").update({ nome: v }).eq("id", E.edicao.id);
      if (error) { aviso("Não foi possível trocar o nome. " + msgDeErro(error), "erro"); return; }
      E.edicao.nome = v;
      topo.querySelector(".ed__titulo").textContent = v;
      aviso("Nome da edição trocado.");
    });
    const secao = (titulo, sub, cs, aberta) => cs.length ? h("details", { class: "painel-secao", open: aberta },
      h("summary", null, h("span", { class: "painel-secao__titulo", text: titulo }), h("span", { class: "painel-secao__sub", text: sub })),
      grupoDeCampos(cs)) : null;
    abrirPainel({
      tipo: "config",
      titulo: "Configurações da edição",
      sub: "O que não aparece escrito na página.",
      corpo: [
        h("div", { class: "campo campo--painel" }, h("label", { class: "campo__rotulo", for: "cfg-nome", text: "Nome da edição (só no painel)" }), nome),
        secao("Datas e locais", "Dias, horários, endereços e mapa", datas, true),
        secao("Google e WhatsApp", "Título, descrição e imagem ao compartilhar", seo, false),
        secao("Outros", "Códigos e ajustes", outros, false),
      ],
    });
  }

  /* ---------------------------------------------------------------- foto */
  // a foto do JSON v2 é { src, w, h, larguras, foco? }; foco [x%, y%] vira object-position na página
  function abrirPainelFoto(img, caminhoDado) {
    terminarEdicao(true);
    const c = juntar(caminhoDado || img.getAttribute("data-campo-img"));
    const p = partes(c);
    const k = p.at(-1);
    const pai = p.slice(0, -1).join(".");
    const paiObj = obter(E.dados, pai) || {};
    const altC = `${k}_alt` in paiObj ? `${pai}.${k}_alt` : "alt" in paiObj && k !== "alt" ? `${pai}.alt` : null;
    const valor0 = obter(E.dados, c);
    const ehObjeto = ehImagem(valor0);
    const ehSeo = c === "textos.seo.imagem";
    const atual = img ? (img.currentSrc || img.src || img.poster) : urlDaMidia(valor0);
    const fotoEl = h("img", { class: "foto__img", src: atual, alt: "" });
    const ponto = h("span", { class: "foto__ponto", "aria-hidden": "true" });
    const caixaFoto = h("div", { class: "foto__caixa" + (ehObjeto ? " foto__caixa--foco" : "") }, fotoEl, ehObjeto ? ponto : null);
    const focoDe = () => { const f = obter(E.dados, c)?.foco; return Array.isArray(f) && f.length === 2 ? f : [50, 50]; };
    const desenharPonto = () => { const [x, y] = focoDe(); ponto.style.left = x + "%"; ponto.style.top = y + "%"; };
    const marcarFoco = (e) => {
      const r = fotoEl.getBoundingClientRect();
      const x = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 100);
      const y = Math.round(Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) * 100);
      mudar((d) => { const o = obter(d, c); if (ehImagem(o)) o.foco = [x, y]; }, { rotulo: "ponto de foco", grupo: c + ".foco", ancora: `[data-campo-img="${c}"]` });
      desenharPonto();
    };
    if (ehObjeto) {
      desenharPonto();
      caixaFoto.addEventListener("click", marcarFoco);
    }
    const arquivo = h("input", { type: "file", accept: TIPOS_IMAGEM.join(","), class: "sr", tabindex: "-1", "aria-hidden": "true" });
    const progresso = h("div", { class: "foto__progresso", hidden: true, role: "status" }, h("span", { class: "foto__barra" }), h("span", { class: "foto__progresso-txt" }));
    const trocar = h("button", { type: "button", class: "botao botao--largo", onclick: () => arquivo.click() }, h("span", { html: ICONE.foto }), " Escolher outra foto");
    arquivo.addEventListener("change", () => { const f = arquivo.files?.[0]; arquivo.value = ""; if (f) enviar(f); });

    async function enviar(f) {
      if (!TIPOS_IMAGEM.includes(f.type)) {
        aviso(/heic|heif/i.test(f.type + f.name) ? "Fotos HEIC do iPhone não entram. No iPhone: Ajustes › Câmera › Formatos › Mais Compatível, ou envie em JPG." : "Envie a foto em JPG, PNG ou WebP.", "erro");
        return;
      }
      if (f.size > LIMITE_MB * 1048576) { aviso(`Foto grande demais (${(f.size / 1048576).toFixed(1).replace(".", ",")} MB). O limite é ${LIMITE_MB} MB.`, "erro"); return; }
      const blobUrl = URL.createObjectURL(f);
      fotoEl.src = blobUrl;
      // a página mostra a foto nova na hora, antes de o envio terminar
      for (const el of previa.doc?.querySelectorAll(`[data-campo-img="${c}"]`) || []) {
        el.removeAttribute("srcset"); el.closest("picture")?.querySelectorAll("source").forEach((x) => x.remove());
        if (el.tagName === "VIDEO") el.poster = blobUrl; else el.src = blobUrl;
      }
      trocar.disabled = true;
      progresso.hidden = false;
      const txt = progresso.querySelector(".foto__progresso-txt"), barra = progresso.querySelector(".foto__barra");
      txt.textContent = "Preparando a foto…";
      E.enviando++;
      atualizarEstado();
      try {
        const r = await enviarFoto(sb, {
          bucket: CONFIG.bucket, slug: E.edicao.slug, arquivo: f, larguras: R.LARGURAS_MIDIA || [800, 1280, 1400, 1600],
          jpg: ehSeo ? 1200 : null,
          aoProgresso: (x) => { barra.style.width = Math.round(x * 100) + "%"; txt.textContent = x < 0.08 ? "Preparando a foto…" : `Enviando… ${Math.round(x * 100)}%`; },
        });
        E.fotosEnviadas.set(r.src, r);
        mudar((d) => definir(d, c, ehObjeto || !valor0 ? r : r.src), { rotulo: "foto", ancora: `[data-campo-img="${c}"]` });
        txt.textContent = "Foto trocada.";
        if (ehObjeto) desenharPonto();
        aviso(ehObjeto ? `Foto trocada. ${toque ? "Toque" : "Clique"} no rosto para o corte nunca pegar nele.` : "Foto trocada.");
      } catch (e) {
        const t = String(e?.message || "");
        aviso(/row-level|unauthorized|403|permission/i.test(t) ? "Sua conta não tem permissão para enviar fotos." : "Não foi possível enviar a foto. " + msgDeErro(e), "erro");
        progresso.hidden = true;
        fotoEl.src = atual;
        agendarRender();
      } finally {
        E.enviando--;
        trocar.disabled = false;
        setTimeout(() => URL.revokeObjectURL(blobUrl), 5000);
        atualizarEstado();
      }
    }

    let alt = null;
    if (altC) {
      alt = h("textarea", { class: "campo__entrada", id: "foto-alt", rows: 2 });
      alt.value = obter(E.dados, altC) || "";
      let t = 0;
      const ir = () => { clearTimeout(t); if (alt.value !== obter(E.dados, altC)) mudar((d) => definir(d, altC, alt.value), { rotulo: "descrição da foto", grupo: altC }); };
      alt.addEventListener("input", () => { clearTimeout(t); t = setTimeout(ir, 700); });
      alt.addEventListener("change", ir);
    }
    abrirPainel({
      tipo: "foto",
      titulo: "Foto",
      sub: [contextoDe(c), rotuloDe(c)].filter(Boolean).join(" · "),
      corpo: [
        caixaFoto,
        ehObjeto ? h("p", { class: "campo__ajuda", text: `${toque ? "Toque" : "Clique"} na foto no ponto que nunca pode ser cortado (o rosto, por exemplo).` }) : null,
        trocar, arquivo, progresso,
        h("p", { class: "campo__ajuda", text: ehSeo ? "Melhor em 1200 × 630, com a data da edição escrita na imagem." : "JPG, PNG ou WebP. O painel ajusta o tamanho sozinho." }),
        altC ? h("div", { class: "campo campo--painel" },
          h("label", { class: "campo__rotulo", for: "foto-alt", text: "O que aparece na foto" }),
          h("span", { class: "campo__ajuda", text: "Lido para quem não enxerga e usado pelo Google. Uma frase." }), alt) : null,
      ],
    });
    trocar.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------- bloco derivado (data-config) */
  // texto montado a partir de um bloco (datas, horários, mapa): o painel mostra os campos daquele bloco
  function folhasProfundas(raizC) {
    const out = [];
    const andar = (c) => {
      for (const f of folhasDe(c)) out.push(f);
      const o = obter(E.dados, c);
      if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) {
        const ck = c ? `${c}.${k}` : k;
        if (ehPlanta(ck) || ESCONDER.test(k)) continue;
        if (Array.isArray(v) && v.some((x) => x && typeof x === "object" && !ehImagem(x))) v.forEach((_, i) => andar(`${ck}.${i}`));
        else if (v && typeof v === "object" && !Array.isArray(v) && !ehImagem(v)) andarSoListas(ck);
      }
    };
    // objetos aninhados: as folhas já vieram de folhasDe; falta entrar nas listas de objetos que eles têm
    const andarSoListas = (c) => {
      const o = obter(E.dados, c);
      for (const [k, v] of Object.entries(o || {})) {
        const ck = `${c}.${k}`;
        if (ehPlanta(ck)) continue;
        if (Array.isArray(v) && v.some((x) => x && typeof x === "object" && !ehImagem(x))) v.forEach((_, i) => andar(`${ck}.${i}`));
        else if (v && typeof v === "object" && !Array.isArray(v) && !ehImagem(v)) andarSoListas(ck);
      }
    };
    const o = obter(E.dados, raizC);
    if (Array.isArray(o)) o.forEach((_, i) => andar(`${raizC}.${i}`)); else andar(raizC);
    return [...new Set(out)];
  }

  function abrirPainelBloco(raizC) {
    raizC = juntar(raizC);
    const t = (c) => tipoDe(c, obter(E.dados, c));
    const todos = folhasProfundas(raizC).filter((c) => precisaPainel(c) && !ehAlt(c) && !ehPlanta(c) && !["imagem", "video"].includes(t(c)) && !/\.id$/.test(c));
    if (!todos.length) { aviso("Isto se muda escrevendo direto nos textos da página."); return; }
    // nas datas, o principal são os dias e horários; o resto (endereços, mapa) fica recolhido
    let principais = todos;
    if (todos.length > 8) {
      const dh = todos.filter((c) => ["data", "hora"].includes(t(c)));
      if (dh.length) principais = dh;
    }
    const extras = todos.filter((c) => !principais.includes(c));
    const titulo = raizC === "datas" ? "Datas do Clube" : contextoDe(raizC + ".x") || rotuloDe(raizC);
    abrirPainel({
      tipo: "campos",
      titulo,
      sub: raizC === "datas" ? "Todas as datas da página saem daqui." : "Este trecho da página é montado com estes dados.",
      corpo: [
        grupoDeCampos(principais),
        extras.length ? h("details", { class: "painel-mais" }, h("summary", { text: `Outros dados (${extras.length})` }), grupoDeCampos(extras)) : null,
      ],
    });
    painelCorpo.querySelector("input, select, textarea")?.focus({ preventScroll: true });
  }

  /* ---------------------------------------------------------------- planta */
  let telaPlanta = null;
  async function abrirPlanta(caminhoPlanta = "ingressos.planta") {
    terminarEdicao(true);
    if (CONFIG.cssPlanta && !document.querySelector(`link[href="${CONFIG.cssPlanta}"]`)) {
      document.head.append(h("link", { rel: "stylesheet", href: CONFIG.cssPlanta }));
    }
    fecharPainel();
    if (telaPlanta) return;
    const caixa = h("div", { class: "planta-tela__caixa" });
    const fechar = h("button", { type: "button", class: "botao botao--pequeno", text: "Concluir" });
    telaPlanta = h("div", { class: "planta-tela", role: "dialog", "aria-modal": "true", "aria-label": "Editar a planta dos ingressos" },
      h("header", { class: "planta-tela__topo" },
        h("div", null, h("strong", { text: "Planta dos ingressos" }), h("span", { class: "planta-tela__sub", text: "Mudanças aparecem na página ao concluir" })),
        fechar),
      caixa);
    document.body.append(telaPlanta);
    let ctl = null;
    const sair = () => { try { ctl?.fechar?.(); } catch { /* já fechado */ } telaPlanta?.remove(); telaPlanta = null; agendarRender("[data-planta]"); };
    fechar.addEventListener("click", sair);
    telaPlanta.addEventListener("keydown", (e) => { if (e.key === "Escape" && !e.defaultPrevented) sair(); });
    try {
      const mod = await import(CONFIG.editorPlanta);
      ctl = mod.abrirEditorPlanta(caixa, {
        planta: structuredClone(obter(E.dados, caminhoPlanta) ?? null),
        ingressos: structuredClone(obter(E.dados, "ingressos.lista") || []),
        aoMudar: (nova) => mudar((d) => definir(d, caminhoPlanta, structuredClone(nova)), { rotulo: "planta", grupo: "planta", semRender: true }),
        desenharPlanta: R.desenharPlanta,
      });
    } catch (e) {
      console.warn("painel: editor da planta indisponível", e);
      caixa.replaceChildren(h("div", { class: "vazio" }, h("p", { text: "O editor da planta ainda não está disponível nesta versão do painel." })));
    }
    fechar.focus();
  }

  /* ---------------------------------------------------------------- mudar, desfazer, refazer */
  // toda mudança passa aqui: guarda o antes (para desfazer), aplica, redesenha e agenda o salvamento
  function mudar(fn, { rotulo, grupo, ancora, semRender } = {}) {
    const agora = Date.now();
    const junta = grupo && E.ultimoGrupo === grupo && agora - E.ultimoEm < 1500;
    if (!junta) E.hist.push(JSON.stringify(E.dados));
    if (E.hist.length > 200) E.hist.shift();
    E.ultimoGrupo = grupo || null;
    E.ultimoEm = agora;
    E.futuro = [];
    fn(E.dados);
    usarDados(E.dados);
    depoisDeMudar(ancora, semRender);
  }
  function depoisDeMudar(ancora, semRender) {
    atualizarHistorico();
    marcarPendente();
    if (!semRender) agendarRender(ancora);
  }
  function desfazer() {
    terminarEdicao(false);
    if (!E.hist.length) { aviso("Nada para desfazer."); return; }
    E.futuro.push(JSON.stringify(E.dados));
    E.dados = JSON.parse(E.hist.pop());
    E.ultimoGrupo = null;
    usarDados(E.dados);
    reabrirPainel();
    depoisDeMudar();
    anunciar("Desfeito");
  }
  function refazer() {
    terminarEdicao(false);
    if (!E.futuro.length) { aviso("Nada para refazer."); return; }
    E.hist.push(JSON.stringify(E.dados));
    E.dados = JSON.parse(E.futuro.pop());
    E.ultimoGrupo = null;
    usarDados(E.dados);
    reabrirPainel();
    depoisDeMudar();
    anunciar("Refeito");
  }
  function reabrirPainel() {
    evento.atualizar();
    // os campos do painel mostram valores velhos depois de desfazer: o jeito simples e certo é fechar
    if (E.painel && E.painel.tipo !== "config") fecharPainel();
    else if (E.painel?.tipo === "config") abrirConfiguracoes();
  }
  function atualizarHistorico() {
    btnDesfazer.disabled = !E.hist.length;
    btnRefazer.disabled = !E.futuro.length;
  }

  /* ---------------------------------------------------------------- salvar sozinho */
  const chaveRascunho = "painel-rascunho:" + E.edicao.id;
  function marcarPendente() {
    E.salvo = "pendente";
    local.gravar(chaveRascunho, { dados: E.dados, base: E.base, em: Date.now() });
    atualizarEstado();
    clearTimeout(E.salvarTimer);
    E.salvarTimer = setTimeout(salvar, SALVAR_APOS);
  }
  function salvarAgora() { clearTimeout(E.salvarTimer); return salvar(); }

  async function salvar({ forcar = false } = {}) {
    if (!E.vivo) return true;
    if (E.salvando) { E.deNovo = true; return E.promessaSalvar; }
    if (E.salvo === "salvo" && !forcar) return true;
    E.salvando = true;
    E.salvo = "salvando";
    atualizarEstado();
    const enviado = JSON.stringify(E.dados);
    E.promessaSalvar = (async () => {
      const agora = new Date().toISOString();
      let q = sb.from("edicoes").update({ dados: JSON.parse(enviado), atualizado_em: agora }).eq("id", E.edicao.id);
      if (!forcar && E.base) q = q.eq("atualizado_em", E.base);
      let data, error;
      try { ({ data, error } = await q.select("atualizado_em").maybeSingle()); } catch (e) { error = e; }
      E.salvando = false;
      if (error) {
        E.salvo = "erro";
        E.tentativas++;
        atualizarEstado(msgDeErro(error));
        clearTimeout(E.salvarTimer);
        E.salvarTimer = setTimeout(salvar, Math.min(30000, 2000 * 2 ** Math.min(E.tentativas, 4)));
        return false;
      }
      if (!data) {
        const atual = await sb.from("edicoes").select("atualizado_em,atualizado_por").eq("id", E.edicao.id).maybeSingle();
        if (atual.data && atual.data.atualizado_em !== E.base) {
          E.salvo = "erro";
          atualizarEstado("Outra pessoa salvou");
          const substituir = await confirmar("Outra pessoa mexeu nesta edição",
            [`Ela foi salva ${quando(atual.data.atualizado_em)}${atual.data.atualizado_por ? " por " + atual.data.atualizado_por : ""}, depois que você abriu.`,
              "Se continuar, as mudanças da outra pessoa são trocadas pelas suas. Ou recarregue para ver a versão dela (as suas se perdem)."],
            "Manter as minhas", "botao--perigo");
          if (substituir) return salvar({ forcar: true });
          atualizarEstado("Não salvo");
          return false;
        }
        E.salvo = "erro";
        atualizarEstado("Sem permissão para salvar");
        aviso("Sua conta não tem permissão para salvar esta edição. Peça para conferirem seu acesso.", "erro");
        return false;
      }
      E.base = data.atualizado_em;
      E.tentativas = 0;
      if (JSON.stringify(E.dados) === enviado) {
        E.salvo = "salvo";
        local.apagar(chaveRascunho);
      } else E.salvo = "pendente";
      atualizarEstado();
      if (E.salvo === "pendente" || E.deNovo) { E.deNovo = false; clearTimeout(E.salvarTimer); E.salvarTimer = setTimeout(salvar, 300); }
      return E.salvo === "salvo";
    })();
    return E.promessaSalvar;
  }

  function atualizarEstado(detalhe) {
    const s = E.enviando ? "enviando" : E.salvo;
    const txt = { salvo: "Salvo", pendente: "Salvando…", salvando: "Salvando…", erro: "Não salvo", enviando: "Enviando foto…" }[s];
    estadoEl.className = "ed__estado ed__estado--" + s;
    estadoEl.replaceChildren(h("span", { class: "ed__estado-ponto", "aria-hidden": "true" }), txt);
    estadoEl.title = s === "erro" ? (detalhe || "") + " Tentando de novo…" : s === "salvo" ? "Rascunho salvo. O site só muda ao publicar." : "";
    if (s === "erro" && detalhe) estadoEl.append(h("button", { type: "button", class: "link-botao ed__tentar", text: "Tentar agora", onclick: () => salvar() }));
  }

  /* ---------------------------------------------------------------- publicar */
  function problemas() {
    const lista = [];
    const dias = obter(E.dados, "datas.dias");
    if (Array.isArray(dias)) dias.forEach((d, i) => { if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.data || "")) lista.push({ msg: `Falta a data do Dia ${i + 1}.`, caminho: `datas.dias.${i}.data` }); });
    // textos visíveis que ficaram vazios
    for (const c of E.inline) {
      const v = obter(E.dados, c);
      if (typeof v === "string" && !v.trim() && !/selo|nota|subir|detalhe|fonte/.test(c)) lista.push({ msg: `Ficou um texto vazio: ${rotuloDe(c)}${contextoDe(c) ? " (" + contextoDe(c) + ")" : ""}.`, caminho: c });
    }
    // a mesma validação do build (renderizador): o que ela recusar, a publicação também recusaria
    let erros = [];
    try { erros = typeof R.validar === "function" ? R.validar(E.dados) : []; } catch (e) { erros = [String(e?.message || e)]; }
    for (const m of erros) {
      const [cam, ...resto] = String(m).split(": ");
      const c = /^[\w.[\]-]+$/.test(cam) && resto.length ? juntar(cam) : null;
      if (c && lista.some((x) => x.caminho === c)) continue;
      const onde = c ? `${rotuloDe(c)}${contextoDe(c) ? " (" + contextoDe(c) + ")" : ""}` : "";
      lista.push({ msg: onde ? `${onde}: ${resto.join(": ")}` : String(m), caminho: c });
    }
    return lista;
  }

  async function publicar() {
    terminarEdicao(true);
    if (E.enviando) { aviso("Espere a foto terminar de enviar."); return; }
    const pr = problemas();
    if (pr.length) {
      const ir = await dialogo({
        titulo: pr.length === 1 ? "Falta 1 coisa antes de publicar" : `Faltam ${pr.length} coisas antes de publicar`,
        corpo: [h("ul", { class: "lista-problemas" }, ...pr.slice(0, 6).map((p) => h("li", { text: p.msg })))],
        botoes: [{ rotulo: "Fechar", valor: "cancelar", classe: "botao--claro" }, { rotulo: "Mostrar onde", valor: "ir" }],
      });
      const alvo = pr.find((x) => x.caminho);
      if (ir === "ir" && alvo) irPara(alvo.caminho);
      return;
    }
    await app.publicarEdicao(E.edicao, { antes: async () => (E.salvo === "salvo" ? true : salvarAgora()) , sujo: E.salvo !== "salvo" });
  }

  function irPara(c) {
    const doc = previa.doc;
    const el = doc && [...doc.querySelectorAll("[data-campo]")].find((x) => x.getAttribute("data-campo").split(/\s+/).map(juntar).includes(c));
    if (el && E.inline.has(c)) { el.scrollIntoView({ block: "center" }); comecarEdicao(el); return; }
    if (el) { el.scrollIntoView({ block: "center" }); selecionar(null, el); }
    abrirPainelCampos([c]);
  }

  /* ---------------------------------------------------------------- teclado no painel e saída */
  const teclaGlobal = (e) => {
    if (!E.vivo || app.dialogoAberto() || telaPlanta) return;
    const emCampo = e.target.closest?.("input, textarea, select, [contenteditable]");
    if (emCampo && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y") && (e.ctrlKey || e.metaKey)) return;
    if (e.key === "Escape" && E.painel) { fecharPainel(); return; }
    atalhos(e);
  };
  document.addEventListener("keydown", teclaGlobal);
  const antesDeSair = (e) => { if (E.salvo !== "salvo" || E.enviando) { e.preventDefault(); e.returnValue = ""; } };
  window.addEventListener("beforeunload", antesDeSair);

  /* ---------------------------------------------------------------- montar */
  atualizarHistorico();
  atualizarEstado();
  medir();
  obsTamanho.observe(palco);
  agendarRender();

  return {
    raiz,
    get pendente() { return E.salvo !== "salvo" || E.enviando > 0; },
    salvarAgora,
    recuperar(dados) { E.hist.push(JSON.stringify(E.dados)); E.dados = dados; usarDados(E.dados); depoisDeMudar(); },
    marcarAtiva() { E.edicao.ativa = true; },
    ao_montar() { medir(); },
    fechar() {
      E.vivo = false;
      clearTimeout(E.salvarTimer); clearTimeout(E.renderTimer);
      obsTamanho.disconnect();
      document.removeEventListener("keydown", teclaGlobal);
      window.removeEventListener("beforeunload", antesDeSair);
      telaPlanta?.remove(); telaPlanta = null;
    },
    // para os testes e para depurar: estado atual
    _E: E,
  };
}
