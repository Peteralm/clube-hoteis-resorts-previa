/* Painel do Clube: edita as edições da landing page guardadas no Supabase.
   Telas: entrar (e-mail e senha, recuperação de senha), lista de edições, editor gerado a partir de
   ../conteudo/edicao.schema.json, publicação acompanhada pela tabela publicacoes.
   JS puro, sem build. Depende de window.supabase (supabase-js v2 em UMD, carregado no index.html). */
(() => {
  "use strict";

  const CONFIG = {
    url: "https://xfylbdxeciujemyavbaq.supabase.co",
    // chave pública (publishable) do projeto: feita para ir no navegador; o acesso real é decidido pelo RLS
    chave: "sb_publishable_GrGwrqg-z-51fDMsxBwOsg_GRxzA2We",
    bucket: "midia",
    schema: "../conteudo/edicao.schema.json",
    site: "../",
    intervaloPublicacao: 3000,
    publicacaoDemorada: 5 * 60 * 1000,
    publicacaoDesiste: 20 * 60 * 1000,
    limiteImagemMB: 15,
    limiteVideoMB: 50,
  };

  const GRUPOS_ORDEM = ["Datas e locais", "Ingressos", "Palestrantes", "Fotos e textos"];
  const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];
  const TIPOS_VIDEO = ["video/mp4", "video/webm"];
  const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
  const RE_HORA = /^\d{2}:\d{2}$/;
  const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

  const ICONES = {
    cima: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 15V5M5 10l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    baixo: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 5v10M5 10l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    lixo: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  /* ------------------------------------------------------------ utilidades de DOM */
  const $ = (sel, raiz = document) => raiz.querySelector(sel);

  function h(tag, props, ...filhos) {
    const e = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === "class") e.className = v;
        else if (k === "text") e.textContent = v;
        else if (k === "html") e.innerHTML = v; // só com constantes deste arquivo
        else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
        else if (k in e && typeof v !== "string") e[k] = v;
        else e.setAttribute(k, v === true ? "" : v);
      }
    }
    for (const f of filhos.flat()) {
      if (f == null || f === false) continue;
      e.append(f instanceof Node ? f : document.createTextNode(String(f)));
    }
    return e;
  }

  function anexar(el, ...filhos) {
    for (const f of filhos.flat()) if (f != null && f !== false) el.append(f);
    return el;
  }

  const main = () => $("#conteudo");

  // a barra do editor e a faixa de publicação ficam presas embaixo; o resto da tela abre espaço para elas
  const medidor = new ResizeObserver(() => {
    const barra = document.querySelector(".barra");
    const faixaEl = $("#faixa-publicacao");
    const raiz = document.documentElement.style;
    raiz.setProperty("--barra-h", (barra ? barra.offsetHeight : 0) + "px");
    raiz.setProperty("--faixa-h", (faixaEl && !faixaEl.hidden ? faixaEl.offsetHeight : 0) + "px");
  });
  const medir = () => {
    medidor.disconnect();
    medidor.observe(document.body);
    const barra = document.querySelector(".barra");
    if (barra) medidor.observe(barra);
    medidor.observe($("#faixa-publicacao"));
  };

  function trocarTela(...nos) {
    const m = main();
    m.replaceChildren(...nos);
    medir();
    window.scrollTo(0, 0);
    const alvo = m.querySelector("h1");
    if (alvo) {
      alvo.setAttribute("tabindex", "-1");
      alvo.focus({ preventScroll: true });
    }
  }

  let avisoTimer = 0;
  function aviso(msg, tipo) {
    const caixa = $("#avisos");
    clearTimeout(avisoTimer);
    caixa.replaceChildren(h("div", { class: "aviso" + (tipo === "erro" ? " aviso--erro" : ""), text: msg }));
    avisoTimer = setTimeout(() => caixa.replaceChildren(), tipo === "erro" ? 7000 : 4000);
  }

  function anunciar(msg) {
    const r = $("#anuncio");
    r.textContent = "";
    setTimeout(() => { r.textContent = msg; }, 50);
  }

  /* ------------------------------------------------------------ armazenamento local (só conveniência) */
  const local = {
    ler(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
    gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço ou bloqueado */ } },
    apagar(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
  };

  /* ------------------------------------------------------------ datas e textos */
  const fmtHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const fmtDia = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });
  const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

  function quando(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d)) return "";
    const hoje = new Date();
    const ontem = new Date(hoje); ontem.setDate(hoje.getDate() - 1);
    const mesmoDia = (a, b) => a.toDateString() === b.toDateString();
    if (mesmoDia(d, hoje)) return "hoje às " + fmtHora.format(d);
    if (mesmoDia(d, ontem)) return "ontem às " + fmtHora.format(d);
    return "em " + fmtDia.format(d);
  }

  function datasPorExtenso(isos) {
    const ds = [...new Set(isos)].filter((s) => RE_DATA.test(s)).sort().map((s) => s.split("-").map(Number));
    if (!ds.length) return "";
    const mesmoMes = ds.every(([a, m]) => a === ds[0][0] && m === ds[0][1]);
    if (mesmoMes) {
      const dias = ds.map((d) => d[2]);
      const lista = dias.length > 1 ? dias.slice(0, -1).join(", ") + " e " + dias.at(-1) : String(dias[0]);
      return `${lista} de ${MESES[ds[0][1] - 1]} de ${ds[0][0]}`;
    }
    return ds.map(([a, m, d]) => `${d} de ${MESES[m - 1]} de ${a}`).join(" e ");
  }

  function slugificar(s) {
    return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
  }

  function humanizar(chave) {
    const s = String(chave).replace(/[_-]+/g, " ").trim();
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function plural(n, um, varios) { return n === 1 ? `1 ${um}` : `${n} ${varios}`; }

  /* ------------------------------------------------------------ caminhos dentro dos dados */
  function obter(obj, caminho) {
    let o = obj;
    for (const k of caminho) { if (o == null) return undefined; o = o[k]; }
    return o;
  }

  function definir(obj, caminho, valor) {
    let o = obj;
    for (let i = 0; i < caminho.length - 1; i++) {
      const k = caminho[i];
      if (o[k] == null || typeof o[k] !== "object") o[k] = typeof caminho[i + 1] === "number" ? [] : {};
      o = o[k];
    }
    const u = caminho[caminho.length - 1];
    if (valor === undefined && !Array.isArray(o)) delete o[u];
    else o[u] = valor;
  }

  const chaveDe = (caminho) => caminho.join(".");

  /* ------------------------------------------------------------ schema */
  let SCHEMA = null;
  let schemaErro = null;

  async function carregarSchema() {
    try {
      const r = await fetch(CONFIG.schema, { cache: "no-cache" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      SCHEMA = await r.json();
    } catch (e) {
      schemaErro = e;
    }
  }

  function resolverRef(ref) {
    if (!ref.startsWith("#/")) return {};
    let o = SCHEMA;
    for (const parte of ref.slice(2).split("/")) {
      o = o?.[parte.replace(/~1/g, "/").replace(/~0/g, "~")];
    }
    return o || {};
  }

  // nó "resolvido": $ref expandido (irmãos do $ref valem por cima), allOf mesclado, tipo único
  function res(no) {
    if (!no || typeof no !== "object") return {};
    let r = no;
    let guarda = 0;
    while (r.$ref && guarda++ < 20) {
      const { $ref, ...resto } = r;
      r = { ...res(resolverRef($ref)), ...resto };
    }
    if (Array.isArray(r.allOf)) {
      const { allOf, ...resto } = r;
      r = Object.assign({}, ...allOf.map(res), resto);
    }
    if (Array.isArray(r.type)) r = { ...r, type: r.type.find((t) => t !== "null") || r.type[0], aceitaNulo: r.type.includes("null") };
    return r;
  }

  function opcoesDe(no) {
    if (Array.isArray(no.enum)) {
      const rot = no["x-rotulos"] || no["x-enum-titulos"] || {};
      return no.enum.filter((v) => v !== null).map((v, i) => ({ valor: v, rotulo: (Array.isArray(rot) ? rot[i] : rot[v]) || humanizar(v) }));
    }
    const alts = no.oneOf || no.anyOf;
    if (Array.isArray(alts) && alts.every((a) => a && "const" in a)) {
      return alts.map((a) => ({ valor: a.const, rotulo: a.title || humanizar(a.const) }));
    }
    return null;
  }

  function widgetDe(no) {
    const w = no["x-widget"];
    // array com x-widget "escolha" = várias opções marcáveis; o tipo manda sobre o x-widget em número e booleano
    if (no.type === "array") return w === "escolha" ? "multipla" : "lista";
    if (no.type === "object" || (no.properties && !w)) return "objeto";
    if (no.type === "number" || no.type === "integer") return opcoesDe(no) ? "escolha" : "numero";
    if (no.type === "boolean") return "interruptor";
    if (w) return w;
    if (opcoesDe(no)) return "escolha";
    if (no.format === "date") return "data";
    if (no.format === "time") return "hora";
    if (no.maxLength > 200) return "texto-longo";
    return "texto";
  }

  function propriedadesOrdenadas(no) {
    const props = Object.entries(no.properties || {});
    // fora do formulário: "$schema" e afins, campos só de leitura e constantes (o valor nos dados é preservado)
    return props
      .map(([k, v], i) => ({ k, no: res(v), i }))
      .filter(({ k, no: n }) => !k.startsWith("$") && !n.readOnly && !("const" in n))
      .sort((a, b) => (a.no["x-ordem"] ?? 1e6) - (b.no["x-ordem"] ?? 1e6) || a.i - b.i);
  }

  function grupos() {
    const raiz = res(SCHEMA);
    const mapa = new Map();
    for (const p of propriedadesOrdenadas(raiz)) {
      const g = p.no["x-grupo"] || "Outros";
      if (!mapa.has(g)) mapa.set(g, []);
      mapa.get(g).push(p);
    }
    const ordem = Array.isArray(raiz["x-grupos"]) ? raiz["x-grupos"] : GRUPOS_ORDEM;
    const nomes = [...mapa.keys()].sort((a, b) => {
      const ia = ordem.indexOf(a), ib = ordem.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return nomes.map((nome) => ({ nome, props: mapa.get(nome), id: "aba-" + slugificar(nome) }));
  }

  // o vazio ("") é aceito pelo schema neste campo? Se não, um campo opcional esvaziado sai do JSON.
  function vazioAceito(no) {
    if (no.minLength > 0) return false;
    if (no.pattern && !new RegExp(no.pattern, "u").test("")) return false;
    if (no.format === "date" || no.format === "time" || no.format === "uri") return false;
    const ops = opcoesDe(no);
    if (ops && !ops.some((o) => o.valor === "")) return false;
    return true;
  }

  // "required" do JSON Schema só exige a chave; se o vazio vale ou não, quem diz é minLength/pattern/format/enum
  function exigePreencher(no, obrigatorio) {
    if (!obrigatorio) return false;
    if (no.type === "string" || no.type == null) return !vazioAceito(no);
    return true;
  }

  // antes de salvar: chaves obrigatórias ausentes ganham o valor vazio do tipo (o vazio que não vale é apontado na validação)
  function completar(no, valor) {
    no = res(no);
    const w = widgetDe(no);
    if (w === "objeto" && valor && typeof valor === "object" && !Array.isArray(valor)) {
      for (const k of no.required || []) {
        const f = no.properties?.[k];
        if (!f || valor[k] !== undefined || k.startsWith("$")) continue;
        const nv = valorNovo(f);
        if (nv !== undefined) valor[k] = nv;
      }
      for (const { k, no: f } of propriedadesOrdenadas(no)) if (valor[k] !== undefined) completar(f, valor[k]);
    } else if (w === "lista" && Array.isArray(valor)) {
      valor.forEach((v) => completar(no.items, v));
    }
  }

  function valorNovo(no) {
    no = res(no);
    if ("default" in no) return structuredClone(no.default);
    const w = widgetDe(no);
    if (w === "objeto") {
      const o = {};
      const req = no.required || [];
      for (const { k, no: f } of propriedadesOrdenadas(no)) {
        const fw = widgetDe(f);
        if ("default" in f) o[k] = structuredClone(f.default);
        else if (fw === "objeto" || fw === "lista" || fw === "multipla") o[k] = valorNovo(f);
        else if (req.includes(k) && f.type === "string") o[k] = "";
      }
      return o;
    }
    if (w === "lista" || w === "multipla") return [];
    if (no.type === "string") return "";
    return undefined;
  }

  /* ------------------------------------------------------------ validação (mensagens em PT-BR) */
  function validarValor(no, v, obrigatorio) {
    const w = widgetDe(no);
    const vazio = v === undefined || v === null || v === "";
    if (vazio) {
      if (!exigePreencher(no, obrigatorio)) return null;
      if (w === "imagem") return "Escolha uma imagem.";
      if (w === "video") return "Escolha um vídeo.";
      if (w === "escolha") return "Escolha uma das opções.";
      return "Preencha este campo.";
    }
    if (no.type === "string" || typeof v === "string") {
      if (typeof v !== "string") return "Valor inválido.";
      const n = [...v].length;
      if (no.minLength && n < no.minLength) return `Use pelo menos ${plural(no.minLength, "caractere", "caracteres")}.`;
      if (no.maxLength && n > no.maxLength) return `Use no máximo ${no.maxLength} caracteres (agora são ${n}).`;
      if ((w === "data" || no.format === "date") && (!RE_DATA.test(v) || isNaN(new Date(v + "T12:00:00")))) return "Informe uma data válida.";
      if ((w === "hora" || no.format === "time") && !RE_HORA.test(v.slice(0, 5))) return "Informe a hora no formato 08:30.";
      if (no.pattern) {
        let ok = true;
        try { ok = new RegExp(no.pattern, "u").test(v); } catch { /* padrão que o navegador não entende: não bloqueia */ }
        if (!ok) return no["x-erro"] || (w === "hora" ? "Informe a hora no formato 08:30." : "Formato inválido. " + (no.description || "")).trim();
      }
    }
    if (no.type === "number" || no.type === "integer") {
      if (typeof v !== "number" || isNaN(v)) return "Informe um número.";
      if (no.type === "integer" && !Number.isInteger(v)) return "Informe um número inteiro.";
      if (no.minimum != null && v < no.minimum) return `O mínimo é ${no.minimum}.`;
      if (no.maximum != null && v > no.maximum) return `O máximo é ${no.maximum}.`;
      if (no.multipleOf && Math.abs(v / no.multipleOf - Math.round(v / no.multipleOf)) > 1e-9) return `Use um múltiplo de ${no.multipleOf}.`;
    }
    const ops = opcoesDe(no);
    if (ops && !ops.some((o) => o.valor === v)) return "Escolha uma das opções.";
    return null;
  }

  function validarLista(no, arr) {
    const n = Array.isArray(arr) ? arr.length : 0;
    const um = (res(no.items).title || "item").toLowerCase();
    if (no.minItems && n < no.minItems) return `Adicione pelo menos ${plural(no.minItems, um, um + "s")}.`;
    if (no.maxItems && n > no.maxItems) return `Use no máximo ${plural(no.maxItems, um, um + "s")}.`;
    return null;
  }

  // percorre schema + dados e devolve todos os erros, na ordem do formulário
  function coletarErros(no, valor, caminho, obrigatorio, saida) {
    no = res(no);
    const w = widgetDe(no);
    if (w === "objeto") {
      const req = no.required || [];
      for (const { k, no: f } of propriedadesOrdenadas(no)) {
        coletarErros(f, valor?.[k], [...caminho, k], req.includes(k), saida);
      }
    } else if (w === "multipla") {
      const n = Array.isArray(valor) ? valor.length : 0;
      if (no.minItems && n < no.minItems) saida.push({ caminho, msg: no.minItems === 1 ? "Marque pelo menos uma opção." : `Marque pelo menos ${no.minItems} opções.` });
      else if (no.maxItems && n > no.maxItems) saida.push({ caminho, msg: `Marque no máximo ${no.maxItems} opções.` });
    } else if (w === "lista") {
      const msg = validarLista(no, valor);
      if (msg) saida.push({ caminho, msg });
      if (Array.isArray(valor)) valor.forEach((item, i) => coletarErros(no.items, item, [...caminho, i], true, saida));
      else if (obrigatorio && valor === undefined && !no.minItems) { /* lista vazia é aceita */ }
    } else {
      const msg = validarValor(no, valor, obrigatorio);
      if (msg) saida.push({ caminho, msg });
    }
    return saida;
  }

  /* ------------------------------------------------------------ Supabase */
  let sb = null;
  let usuario = null;

  function msgDeErro(e, contexto) {
    const t = String(e?.message || e || "");
    if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(t) && !e?.status) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    if (/JWT|token is expired|not authenticated/i.test(t)) return "Sua sessão expirou. Entre de novo.";
    if (e?.code === "42501" || /permission denied|row-level security/i.test(t)) return "Sua conta não tem permissão para isso. Peça para conferirem seu acesso.";
    return (contexto ? contexto + " " : "") + (t ? `Detalhe: ${t}` : "Tente de novo em instantes.");
  }

  /* ------------------------------------------------------------ estado do editor */
  const ed = {
    edicao: null,       // linha de edicoes (sem dados)
    dados: null,        // objeto em edição
    base: null,         // atualizado_em do que está no servidor (detecta salvamento por outra pessoa)
    sujo: false,
    salvando: false,
    salvoEm: null,
    mostrarTudo: false, // depois de uma tentativa de salvar com erro, todos os erros aparecem
    campos: new Map(),  // chave -> { no, caminho, obrigatorio, wrap, erroEl, tocado, entrada }
    aberto: new WeakMap(), // item de lista (objeto) -> aberto?
    enviando: 0,        // envios de arquivo em andamento
    abaAtiva: null,
    rascunhoTimer: 0,
    secoesAbertas: new Set(), // seções (details) abertas, por caminho
    multiplas: new Set(),     // grupos de opções que dependem de outros dados (ex.: códigos de ingresso)
  };

  const chaveRascunho = (id) => "painel-rascunho:" + id;

  function marcarSujo() {
    ed.sujo = true;
    atualizarBarra();
    clearTimeout(ed.rascunhoTimer);
    ed.rascunhoTimer = setTimeout(() => {
      if (ed.sujo && ed.edicao) local.gravar(chaveRascunho(ed.edicao.id), { dados: ed.dados, base: ed.base, em: Date.now() });
    }, 800);
  }

  window.addEventListener("beforeunload", (e) => {
    if (ed.sujo || ed.enviando) { e.preventDefault(); e.returnValue = ""; }
  });

  /* ------------------------------------------------------------ diálogo genérico */
  let dialogoAberto = null;

  // botoes: [{ rotulo, valor, classe }]; o último é o principal. validar(valor, corpo) -> string de erro | false | true
  function dialogo({ titulo, corpo, botoes, validar }) {
    const dlg = $("#dialogo");
    const anterior = document.activeElement;
    $("#dialogo-titulo").textContent = titulo;
    const corpoEl = $("#dialogo-corpo");
    const erroEl = h("p", { class: "dialogo__erro", role: "alert" });
    corpoEl.replaceChildren(erroEl, ...(Array.isArray(corpo) ? corpo : [corpo]).map((c) => (typeof c === "string" ? h("p", { text: c }) : c)));
    const caixaBotoes = $("#dialogo-botoes");
    caixaBotoes.replaceChildren(...botoes.map((b) => h("button", { type: "submit", class: "botao " + (b.classe || ""), value: b.valor, text: b.rotulo })));
    return new Promise((resolve) => {
      const form = $("#dialogo-form");
      let ocupado = false;
      const fechar = (v) => {
        form.removeEventListener("submit", aoEnviar);
        dlg.removeEventListener("cancel", aoCancelar);
        dlg.close();
        dialogoAberto = null;
        if (anterior && anterior.isConnected) anterior.focus({ preventScroll: true });
        resolve(v);
      };
      const aoCancelar = (e) => { e.preventDefault(); if (!ocupado) fechar(null); };
      const aoEnviar = async (e) => {
        e.preventDefault();
        if (ocupado) return;
        const valor = e.submitter?.value ?? botoes.at(-1).valor;
        if (valor === "cancelar") return fechar(null);
        if (validar) {
          ocupado = true;
          const btns = [...caixaBotoes.querySelectorAll("button")];
          btns.forEach((b) => (b.disabled = true));
          const ativo = e.submitter;
          const rotulo = ativo?.textContent;
          if (ativo) ativo.replaceChildren(h("span", { class: "giro", "aria-hidden": "true" }), " " + rotulo);
          let r;
          try { r = await validar(valor, corpoEl); } catch (err) { r = msgDeErro(err); }
          ocupado = false;
          btns.forEach((b) => (b.disabled = false));
          if (ativo) ativo.textContent = rotulo;
          if (typeof r === "string") { erroEl.textContent = r; return; }
          if (r === false) return;
        }
        fechar(valor);
      };
      form.addEventListener("submit", aoEnviar);
      dlg.addEventListener("cancel", aoCancelar);
      dialogoAberto = dlg;
      dlg.showModal();
      const foco = corpoEl.querySelector("input, select, textarea") || caixaBotoes.lastElementChild;
      foco?.focus();
    });
  }

  const confirmar = (titulo, corpo, rotuloSim, classe = "") =>
    dialogo({ titulo, corpo, botoes: [{ rotulo: "Cancelar", valor: "cancelar", classe: "botao--claro" }, { rotulo: rotuloSim, valor: "sim", classe }] })
      .then((v) => v === "sim");

  /* ------------------------------------------------------------ campos simples (usados no login e nos diálogos) */
  function campoSimples({ id, rotulo, tipo = "text", valor = "", ajuda, autocomplete, obrigatorio, inputmode, maxlength }) {
    const entrada = h("input", {
      class: "campo__entrada", id, name: id, type: tipo, value: valor, autocomplete, inputmode, maxlength,
      required: !!obrigatorio, "aria-describedby": [ajuda ? id + "-ajuda" : null, id + "-erro"].filter(Boolean).join(" "),
    });
    let nucleo = entrada;
    if (tipo === "password") {
      const mostrar = h("button", { type: "button", class: "senha__mostrar", text: "Mostrar", "aria-controls": id, "aria-pressed": "false" });
      mostrar.addEventListener("click", () => {
        const ver = entrada.type === "password";
        entrada.type = ver ? "text" : "password";
        mostrar.textContent = ver ? "Ocultar" : "Mostrar";
        mostrar.setAttribute("aria-pressed", String(ver));
        entrada.focus();
      });
      nucleo = h("div", { class: "senha" }, entrada, mostrar);
    }
    const wrap = h("div", { class: "campo" },
      h("label", { class: "campo__rotulo", for: id, text: rotulo }),
      ajuda ? h("span", { class: "campo__ajuda", id: id + "-ajuda", text: ajuda }) : null,
      nucleo,
      h("span", { class: "campo__erro", id: id + "-erro" }));
    return { wrap, entrada, erro: (msg) => {
      wrap.classList.toggle("campo--invalido", !!msg);
      entrada.setAttribute("aria-invalid", msg ? "true" : "false");
      wrap.querySelector(".campo__erro").textContent = msg || "";
    } };
  }

  /* ------------------------------------------------------------ telas de entrada */
  function telaEntradaBase(...conteudo) {
    $("#topo").hidden = true;
    $("#faixa-publicacao").hidden = true;
    const logo = h("img", { class: "entrada__logo", src: "../assets/brand/logo-vertical-creme.svg", alt: "Clube de Negócios Hotéis & Resorts", width: 260, height: 160 });
    trocarTela(h("section", { class: "entrada" }, h("div", { class: "entrada__caixa" }, logo, ...conteudo)));
  }

  function traduzirErroAuth(e) {
    const t = String(e?.message || "");
    if (e?.status === 429 || /rate limit|too many/i.test(t)) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
    if (/Invalid login credentials/i.test(t)) return "E-mail ou senha incorretos.";
    if (/Email not confirmed/i.test(t)) return "Este e-mail ainda não foi confirmado. Peça um novo convite.";
    if (/should be different/i.test(t)) return "A nova senha precisa ser diferente da anterior.";
    if (/Password should be at least|weak/i.test(t)) return "Senha fraca. Use pelo menos 8 caracteres, misturando letras e números.";
    if (/redirect/i.test(t)) return "Este endereço do painel ainda não foi autorizado para recuperar senha. Avise o suporte técnico.";
    if (/fetch|network|Load failed/i.test(t) || e?.name === "AuthRetryableFetchError") return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
    return "Não foi possível concluir. " + (t ? `Detalhe: ${t}` : "Tente de novo.");
  }

  function botaoCarregando(botao, sim, rotulo) {
    botao.disabled = sim;
    botao.setAttribute("aria-busy", String(sim));
    botao.replaceChildren(...(sim ? [h("span", { class: "giro", "aria-hidden": "true" }), " " + rotulo] : [rotulo]));
  }

  function telaLogin({ mensagem, erro } = {}) {
    const email = campoSimples({ id: "email", rotulo: "E-mail", tipo: "email", autocomplete: "username", obrigatorio: true, inputmode: "email", valor: local.ler("painel-email") || "" });
    const senha = campoSimples({ id: "senha", rotulo: "Senha", tipo: "password", autocomplete: "current-password", obrigatorio: true });
    const msg = h("p", { class: "entrada__msg" + (erro ? " entrada__msg--erro" : ""), role: erro ? "alert" : "status", text: erro || mensagem || "", hidden: !(erro || mensagem) });
    const botao = h("button", { type: "submit", class: "botao botao--ouro botao--largo", text: "Entrar" });
    const form = h("form", { novalidate: true },
      msg, email.wrap, senha.wrap, botao,
      h("p", { class: "entrada__rodape" }, h("button", { type: "button", class: "link-botao", text: "Esqueci a senha", onclick: () => telaEsqueci(email.entrada.value) })));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const ve = email.entrada.value.trim();
      const vs = senha.entrada.value;
      email.erro(!ve ? "Informe seu e-mail." : !/^\S+@\S+\.\S+$/.test(ve) ? "Confira o e-mail: falta algo como nome@empresa.com.br." : "");
      senha.erro(!vs ? "Informe sua senha." : "");
      if (!ve || !vs || !/^\S+@\S+\.\S+$/.test(ve)) { (!ve || !/^\S+@\S+\.\S+$/.test(ve) ? email.entrada : senha.entrada).focus(); return; }
      msg.hidden = true;
      botaoCarregando(botao, true, "Entrando…");
      const { data, error } = await sb.auth.signInWithPassword({ email: ve, password: vs });
      botaoCarregando(botao, false, "Entrar");
      if (error) {
        msg.className = "entrada__msg entrada__msg--erro";
        msg.setAttribute("role", "alert");
        msg.textContent = traduzirErroAuth(error);
        msg.hidden = false;
        senha.entrada.select();
        senha.entrada.focus();
        return;
      }
      local.gravar("painel-email", ve);
      entrar(data.session);
    });
    telaEntradaBase(
      h("h1", { class: "entrada__titulo", text: "Painel do Clube" }),
      h("p", { class: "entrada__sub", text: "Entre para editar as datas, ingressos, palestrantes e fotos do site." }),
      form);
  }

  function telaEsqueci(emailInicial) {
    const email = campoSimples({ id: "email-rec", rotulo: "E-mail da sua conta", tipo: "email", autocomplete: "username", obrigatorio: true, inputmode: "email", valor: emailInicial || "" });
    const msg = h("p", { class: "entrada__msg", role: "status", hidden: true });
    const botao = h("button", { type: "submit", class: "botao botao--ouro botao--largo", text: "Enviar link" });
    const form = h("form", { novalidate: true }, msg, email.wrap, botao,
      h("p", { class: "entrada__rodape" }, h("button", { type: "button", class: "link-botao", text: "Voltar para entrar", onclick: () => telaLogin() })));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const ve = email.entrada.value.trim();
      if (!/^\S+@\S+\.\S+$/.test(ve)) { email.erro("Informe um e-mail válido, como nome@empresa.com.br."); email.entrada.focus(); return; }
      email.erro("");
      botaoCarregando(botao, true, "Enviando…");
      const { error } = await sb.auth.resetPasswordForEmail(ve, { redirectTo: location.origin + location.pathname });
      botaoCarregando(botao, false, "Enviar link");
      msg.hidden = false;
      if (error && !(error.status === 400 && /not found/i.test(error.message))) {
        msg.className = "entrada__msg entrada__msg--erro";
        msg.textContent = traduzirErroAuth(error);
        return;
      }
      msg.className = "entrada__msg";
      msg.textContent = "Pronto. Se este e-mail tiver acesso ao painel, chega em instantes um link para criar uma senha nova. Confira também a caixa de spam.";
      botao.textContent = "Enviar de novo";
    });
    telaEntradaBase(
      h("h1", { class: "entrada__titulo", text: "Esqueci a senha" }),
      h("p", { class: "entrada__sub", text: "Enviamos um link para o seu e-mail. Ele abre esta página para você criar uma senha nova." }),
      form);
  }

  function telaNovaSenha() {
    const s1 = campoSimples({ id: "nova-senha", rotulo: "Nova senha", tipo: "password", autocomplete: "new-password", obrigatorio: true, ajuda: "Pelo menos 8 caracteres." });
    const s2 = campoSimples({ id: "nova-senha-2", rotulo: "Repita a nova senha", tipo: "password", autocomplete: "new-password", obrigatorio: true });
    const msg = h("p", { class: "entrada__msg entrada__msg--erro", role: "alert", hidden: true });
    const botao = h("button", { type: "submit", class: "botao botao--ouro botao--largo", text: "Salvar nova senha" });
    const form = h("form", { novalidate: true }, msg, s1.wrap, s2.wrap, botao);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const a = s1.entrada.value, b = s2.entrada.value;
      s1.erro(a.length < 8 ? "Use pelo menos 8 caracteres." : "");
      s2.erro(a.length >= 8 && a !== b ? "As duas senhas não são iguais." : "");
      if (a.length < 8) return s1.entrada.focus();
      if (a !== b) return s2.entrada.focus();
      botaoCarregando(botao, true, "Salvando…");
      const { error } = await sb.auth.updateUser({ password: a });
      botaoCarregando(botao, false, "Salvar nova senha");
      if (error) { msg.textContent = traduzirErroAuth(error); msg.hidden = false; return; }
      aviso("Senha nova salva. Você já está dentro do painel.");
      const { data } = await sb.auth.getSession();
      location.hash = "#/";
      entrar(data.session);
    });
    telaEntradaBase(
      h("h1", { class: "entrada__titulo", text: "Criar senha nova" }),
      h("p", { class: "entrada__sub", text: "Escolha a senha que você vai usar para entrar no painel." }),
      form);
  }

  /* ------------------------------------------------------------ navegação */
  let ignorarProximaRota = false;
  let rotaAtual = null;

  function rota() {
    const m = location.hash.match(/^#\/edicao\/([\w-]+)/);
    return m ? { tela: "editor", id: m[1] } : { tela: "lista" };
  }

  async function aoMudarRota() {
    if (ignorarProximaRota) { ignorarProximaRota = false; return; }
    if (!usuario) return;
    const r = rota();
    if (rotaAtual?.tela === "editor" && !(r.tela === "editor" && r.id === rotaAtual.id) && (ed.sujo || ed.enviando)) {
      const sair = await confirmar(
        "Sair sem salvar?",
        ed.enviando ? "Um arquivo ainda está sendo enviado. Se sair agora, ele se perde." : "Você fez alterações nesta edição que ainda não foram salvas.",
        "Sair sem salvar", "botao--perigo");
      if (!sair) {
        ignorarProximaRota = true;
        location.hash = "#/edicao/" + rotaAtual.id;
        return;
      }
      ed.sujo = false;
      local.apagar(chaveRascunho(rotaAtual.id));
    }
    rotaAtual = r;
    if (r.tela === "editor") telaEditor(r.id);
    else telaLista();
  }

  window.addEventListener("hashchange", aoMudarRota);

  // falha inesperada (ex.: servidor devolveu página de erro em vez de dados): avisa em vez de deixar a tela muda
  window.addEventListener("unhandledrejection", (e) => {
    console.warn("painel: falha não tratada", e.reason);
    aviso("Algo falhou na comunicação com o servidor. Tente de novo; se continuar, recarregue a página.", "erro");
  });

  /* ------------------------------------------------------------ sessão */
  function entrar(sessao) {
    usuario = sessao?.user || null;
    if (!usuario) return telaLogin();
    $("#topo").hidden = false;
    retomarPublicacao();
    rotaAtual = null;
    aoMudarRota();
  }

  /* ------------------------------------------------------------ lista de edições */
  function datasDaEdicao(dados) {
    if (!SCHEMA || !dados) return "";
    const achadas = [];
    const andar = (no, valor) => {
      no = res(no);
      const w = widgetDe(no);
      if (w === "objeto") for (const { k, no: f } of propriedadesOrdenadas(no)) andar(f, valor?.[k]);
      else if (w === "lista" && Array.isArray(valor)) valor.forEach((v) => andar(no.items, v));
      else if (w === "data" && typeof valor === "string") achadas.push(valor);
    };
    andar(SCHEMA, dados);
    return datasPorExtenso(achadas);
  }

  async function telaLista() {
    $("#topo").hidden = false;
    ed.edicao = null;
    trocarTela(h("div", { class: "carregando" }, h("span", { class: "giro", "aria-hidden": "true" }), "Carregando edições…"));
    const { data, error } = await sb.from("edicoes")
      .select("id,slug,nome,ativa,dados,criado_em,atualizado_em,atualizado_por")
      .order("ativa", { ascending: false })
      .order("atualizado_em", { ascending: false });
    if (rota().tela !== "lista") return;
    if (error) {
      trocarTela(h("div", { class: "pagina" },
        h("h1", { class: "pagina__titulo", text: "Edições" }),
        h("div", { class: "erro-tela", role: "alert" },
          h("p", { text: "Não foi possível carregar as edições. " + msgDeErro(error) }),
          h("button", { type: "button", class: "botao", text: "Tentar de novo", onclick: telaLista }))));
      return;
    }
    const itens = data.map((e) => {
      const datas = datasDaEdicao(e.dados);
      const por = typeof e.atualizado_por === "string" && e.atualizado_por.includes("@") ? " por " + e.atualizado_por : "";
      const tituloId = "ed-" + e.id;
      return h("li", { class: "edicao" + (e.ativa ? " edicao--ativa" : ""), "aria-labelledby": tituloId },
        h("div", null,
          h("h2", { class: "edicao__nome", id: tituloId },
            h("a", { href: "#/edicao/" + e.id, text: e.nome || e.slug }),
            e.ativa ? h("span", { class: "selo", text: "No site agora" }) : null),
          h("p", { class: "edicao__meta" },
            h("span", { text: datas || "Datas ainda não definidas" }),
            h("span", { text: e.atualizado_em ? `Alterada ${quando(e.atualizado_em)}${por}` : `Criada ${quando(e.criado_em)}` }))),
        h("div", { class: "edicao__acoes" },
          h("button", { type: "button", class: "botao botao--claro botao--pequeno", text: "Nova edição a partir desta", "aria-describedby": tituloId, onclick: () => duplicar(e) }),
          h("a", { class: "botao botao--pequeno", href: "#/edicao/" + e.id, text: "Editar", "aria-describedby": tituloId })));
    });
    trocarTela(h("div", { class: "pagina" },
      h("div", { class: "pagina__cabeca" },
        h("div", null,
          h("h1", { class: "pagina__titulo", text: "Edições" }),
          h("p", { class: "pagina__sub", text: "Cada edição guarda as datas, ingressos, palestrantes e fotos de um Clube. A marcada com “No site agora” é a que aparece no site." }))),
      itens.length ? h("ul", { class: "edicoes" }, itens)
        : h("div", { class: "vazio" },
          h("p", { text: "Nenhuma edição encontrada." }),
          h("p", { text: "Se você acabou de receber o acesso, peça para conferirem se o seu e-mail está liberado no painel." }))));
  }

  async function duplicar(origem) {
    const nome = campoSimples({ id: "dup-nome", rotulo: "Nome da nova edição", valor: "", ajuda: "Ex.: Clube de março de 2027", obrigatorio: true, maxlength: 80 });
    const slug = campoSimples({ id: "dup-slug", rotulo: "Endereço curto", ajuda: "Só letras minúsculas, números e hífen. Organiza as fotos desta edição.", obrigatorio: true, maxlength: 60, autocomplete: "off" });
    let slugTocado = false;
    nome.entrada.addEventListener("input", () => { if (!slugTocado) slug.entrada.value = slugificar(nome.entrada.value); });
    slug.entrada.addEventListener("input", () => { slugTocado = true; });
    slug.entrada.addEventListener("blur", () => { slug.entrada.value = slugificar(slug.entrada.value); });
    const r = await dialogo({
      titulo: "Nova edição a partir desta",
      corpo: [
        h("p", null, "Copia tudo de ", h("strong", { text: origem.nome || origem.slug }), ": datas, ingressos, palestrantes e fotos. Depois você ajusta o que mudou. O site não muda até você publicar."),
        nome.wrap, slug.wrap,
      ],
      botoes: [{ rotulo: "Cancelar", valor: "cancelar", classe: "botao--claro" }, { rotulo: "Criar edição", valor: "criar" }],
      validar: async () => {
        const vn = nome.entrada.value.trim();
        const vs = slugificar(slug.entrada.value);
        slug.entrada.value = vs;
        nome.erro(vn ? "" : "Dê um nome para a edição.");
        slug.erro(!vs ? "Preencha o endereço curto." : !RE_SLUG.test(vs) ? "Use só letras minúsculas, números e hífen." : "");
        if (!vn) { nome.entrada.focus(); return false; }
        if (!vs || !RE_SLUG.test(vs)) { slug.entrada.focus(); return false; }
        let dados = origem.dados;
        if (dados === undefined) {
          const q = await sb.from("edicoes").select("dados").eq("id", origem.id).single();
          if (q.error) return "Não foi possível copiar a edição. " + msgDeErro(q.error);
          dados = q.data.dados;
        }
        const { data, error } = await sb.from("edicoes")
          .insert({ nome: vn, slug: vs, dados: structuredClone(dados ?? {}), ativa: false })
          .select("id").single();
        if (error) {
          if (error.code === "23505" || /duplicate|unique/i.test(error.message)) {
            slug.erro("Já existe uma edição com este endereço curto. Escolha outro.");
            slug.entrada.focus();
            return false;
          }
          return "Não foi possível criar a edição. " + msgDeErro(error);
        }
        duplicar.novoId = data.id;
        return true;
      },
    });
    if (r === "criar" && duplicar.novoId) {
      aviso("Edição criada. Agora é só ajustar o que mudou.");
      location.hash = "#/edicao/" + duplicar.novoId;
    }
  }

  /* ------------------------------------------------------------ editor */
  async function telaEditor(id) {
    $("#topo").hidden = false;
    trocarTela(h("div", { class: "carregando" }, h("span", { class: "giro", "aria-hidden": "true" }), "Abrindo edição…"));
    const [q] = await Promise.all([
      sb.from("edicoes").select("id,slug,nome,ativa,dados,atualizado_em,atualizado_por").eq("id", id).maybeSingle(),
      schemaPronto,
    ]);
    if (rota().id !== id) return;
    const voltar = h("a", { class: "voltar", href: "#/", text: "← Todas as edições" });
    if (q.error || !q.data || !SCHEMA) {
      const texto = !SCHEMA ? "Não foi possível carregar o modelo do formulário (edicao.schema.json). Recarregue a página; se continuar, avise o suporte técnico."
        : q.error ? "Não foi possível abrir esta edição. " + msgDeErro(q.error)
        : "Esta edição não existe mais ou você não tem acesso a ela.";
      trocarTela(h("div", { class: "pagina" }, voltar, h("h1", { class: "pagina__titulo", text: "Edição" }),
        h("div", { class: "erro-tela", role: "alert" }, h("p", { text: texto }),
          h("button", { type: "button", class: "botao", text: "Tentar de novo", onclick: () => telaEditor(id) }))));
      return;
    }
    const linha = q.data;
    ed.edicao = { id: linha.id, slug: linha.slug, nome: linha.nome, ativa: linha.ativa };
    ed.dados = linha.dados && typeof linha.dados === "object" ? structuredClone(linha.dados) : {};
    ed.base = linha.atualizado_em;
    ed.sujo = false;
    ed.salvoEm = null;
    ed.mostrarTudo = false;
    ed.campos = new Map();
    ed.aberto = new WeakMap();
    ed.enviando = 0;
    ed.multiplas = new Set();

    const rasc = local.ler(chaveRascunho(id));
    if (rasc && rasc.dados && JSON.stringify(rasc.dados) !== JSON.stringify(ed.dados)) {
      const mudou = rasc.base !== linha.atualizado_em;
      const recuperar = await confirmar(
        "Recuperar alterações não salvas?",
        [`Neste aparelho ficaram alterações desta edição que não foram salvas (${quando(new Date(rasc.em).toISOString())}).`,
          mudou ? "Atenção: a edição foi salva por alguém depois disso. Recuperar vai trocar essa versão pelas suas alterações quando você salvar." : "Você pode recuperá-las e salvar, ou descartá-las."],
        "Recuperar");
      if (recuperar) { ed.dados = rasc.dados; ed.sujo = true; }
      else local.apagar(chaveRascunho(id));
    }

    montarEditor();
  }

  function montarEditor() {
    const gs = grupos();
    if (!gs.some((g) => g.nome === ed.abaAtiva)) ed.abaAtiva = gs[0]?.nome;

    const abas = gs.map((g) => {
      const b = h("button", {
        type: "button", role: "tab", class: "aba", id: g.id, "aria-controls": g.id + "-painel",
        "aria-selected": String(g.nome === ed.abaAtiva), tabindex: g.nome === ed.abaAtiva ? "0" : "-1",
      }, g.nome, h("span", { class: "aba__erros", hidden: true }));
      b.addEventListener("click", () => mostrarAba(g.nome));
      return b;
    });
    const trilho = h("div", { class: "abas__trilho", role: "tablist", "aria-label": "Partes da edição" }, abas);
    trilho.addEventListener("keydown", (e) => {
      const i = abas.indexOf(document.activeElement);
      if (i < 0) return;
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % abas.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + abas.length) % abas.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = abas.length - 1;
      if (j == null) return;
      e.preventDefault();
      mostrarAba(gs[j].nome);
      abas[j].focus();
    });

    const raiz = res(SCHEMA);
    const req = raiz.required || [];
    const paineis = gs.map((g) => h("section", {
      class: "painel", role: "tabpanel", id: g.id + "-painel", "aria-labelledby": g.id, tabindex: "-1",
      hidden: g.nome !== ed.abaAtiva,
    }, g.props.map(({ k, no }) => renderNo(no, [k], req.includes(k), 0))));
    for (const p of paineis) {
      p.addEventListener("change", (e) => {
        if (e.target.type === "checkbox") return;
        atualizarMultiplas();
      });
    }

    const estado = h("div", { class: "barra__estado", role: "status", "aria-live": "polite" }, h("span", { class: "ponto" }), h("span", { class: "barra__texto" }));
    const salvar = h("button", { type: "button", class: "botao botao--claro", id: "salvar", text: "Salvar", onclick: () => salvarEdicao() });
    const publicar = h("button", { type: "button", class: "botao botao--ouro", id: "publicar", text: "Publicar", onclick: () => publicarEdicao() });
    const barra = h("div", { class: "barra" }, h("div", { class: "barra__miolo" }, estado, h("div", { class: "barra__botoes" }, salvar, publicar)));

    trocarTela(
      h("div", { class: "editor__cabeca" },
        h("a", { class: "voltar", href: "#/", text: "← Todas as edições" }),
        h("h1", { class: "editor__titulo" }, ed.edicao.nome || ed.edicao.slug, ed.edicao.ativa ? h("span", { class: "selo", id: "selo-ativa", text: "No site agora" }) : null),
        h("p", { class: "editor__sub" },
          `Endereço curto: ${ed.edicao.slug} · `,
          h("a", { href: CONFIG.site, target: "_blank", rel: "noopener", text: "Ver o site publicado" }, h("span", { class: "sr", text: " (abre em nova aba)" })))),
      h("nav", { class: "abas" }, trilho),
      ...paineis,
      barra);
    atualizarBarra();
  }

  function mostrarAba(nome) {
    ed.abaAtiva = nome;
    for (const g of grupos()) {
      const sel = g.nome === nome;
      const b = document.getElementById(g.id);
      if (!b) continue;
      b.setAttribute("aria-selected", String(sel));
      b.tabIndex = sel ? 0 : -1;
      document.getElementById(g.id + "-painel").hidden = !sel;
      if (sel) b.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }

  function atualizarBarra(erro) {
    const est = $(".barra__estado");
    if (!est) return;
    const txt = est.querySelector(".barra__texto");
    est.classList.toggle("barra__estado--sujo", ed.sujo && !erro);
    est.classList.toggle("barra__estado--erro", !!erro);
    if (erro) txt.textContent = erro;
    else if (ed.salvando) txt.textContent = "Salvando…";
    else if (ed.enviando) txt.textContent = "Enviando arquivo…";
    else if (ed.sujo) txt.textContent = "Alterações não salvas";
    else if (ed.salvoEm) txt.textContent = "Salvo às " + fmtHora.format(ed.salvoEm);
    else txt.textContent = "Tudo salvo";
    const s = $("#salvar");
    if (s) {
      s.disabled = ed.salvando;
      s.className = "botao " + (ed.sujo ? "" : "botao--claro");
    }
  }

  /* ------------------------------------------------------------ geração do formulário */
  function idDe(caminho) { return "f-" + caminho.join("-").replace(/[^\w-]/g, "_"); }

  function cabecalhoCampo(no, caminho, obrigatorio, idEntrada) {
    const titulo = no.title || humanizar(caminho[caminho.length - 1]);
    return [
      h("label", { class: "campo__rotulo", for: idEntrada }, titulo, exigePreencher(no, obrigatorio) ? h("span", { class: "campo__obrig", text: "(obrigatório)" }) : null),
      no.description ? h("span", { class: "campo__ajuda", id: idEntrada + "-ajuda", text: no.description }) : null,
    ];
  }

  function registrarCampo(no, caminho, obrigatorio, wrap, entrada) {
    const reg = { no, caminho, obrigatorio, wrap, entrada, erroEl: wrap.querySelector(":scope > .campo__erro, :scope > .lista__erro"), tocado: false };
    ed.campos.set(chaveDe(caminho), reg);
    if (ed.mostrarTudo) checarCampo(reg);
    return reg;
  }

  function mostrarErro(reg, msg) {
    reg.wrap.classList.toggle("campo--invalido", !!msg);
    if (reg.entrada) reg.entrada.setAttribute("aria-invalid", msg ? "true" : "false");
    if (reg.erroEl) reg.erroEl.textContent = msg || "";
  }

  function checarCampo(reg) {
    const v = obter(ed.dados, reg.caminho);
    const w = widgetDe(reg.no);
    const msg = w === "lista" ? validarLista(reg.no, v)
      : w === "multipla" ? coletarErros(reg.no, v, [], reg.obrigatorio, [])[0]?.msg || null
      : validarValor(reg.no, v, reg.obrigatorio);
    mostrarErro(reg, msg);
    return msg;
  }

  function aoEditar(reg, valor) {
    if (valor === "" && (widgetDe(reg.no) === "numero" || (!reg.obrigatorio && !vazioAceito(reg.no)))) valor = undefined;
    definir(ed.dados, reg.caminho, valor);
    marcarSujo();
    if (reg.tocado || ed.mostrarTudo) checarCampo(reg);
    if (ed.mostrarTudo) contarErrosNasAbas();
  }

  function renderNo(no, caminho, obrigatorio, nivel) {
    no = res(no);
    const w = widgetDe(no);
    if (w === "objeto") return renderObjeto(no, caminho, nivel);
    if (w === "lista") return renderLista(no, caminho, obrigatorio, nivel);
    if (w === "multipla") return renderMultipla(no, caminho, obrigatorio);
    return renderCampo(no, caminho, obrigatorio, w);
  }

  function renderObjeto(no, caminho, nivel) {
    const req = no.required || [];
    const filhos = propriedadesOrdenadas(no).map(({ k, no: f }) => renderNo(f, [...caminho, k], req.includes(k), nivel + 1));
    // nível 0 = a própria aba; objeto que é item de lista = o item já é a moldura
    if (nivel === 0 || typeof caminho[caminho.length - 1] === "number") return h("div", null, filhos);
    const titulo = no.title || humanizar(caminho[caminho.length - 1]);
    if (nivel === 1) {
      // seções da aba: fechadas por padrão, viram um índice curto no celular
      const chave = chaveDe(caminho);
      const sec = h("details", { class: "secao", "data-caminho": chave, open: ed.secoesAbertas.has(chave) },
        h("summary", { class: "secao__cabeca" },
          h("span", { class: "secao__titulo", role: "heading", "aria-level": "2", text: titulo }),
          h("span", { class: "item__erro-marca", hidden: true, title: "Esta seção tem campos para corrigir" })),
        h("div", { class: "secao__corpo" }, no.description ? h("p", { class: "grupo__ajuda", text: no.description }) : null, filhos));
      sec.addEventListener("toggle", () => { if (sec.open) ed.secoesAbertas.add(chave); else ed.secoesAbertas.delete(chave); });
      return sec;
    }
    return h("fieldset", { class: "grupo" },
      h("legend", { text: titulo }),
      no.description ? h("p", { class: "grupo__ajuda", text: no.description }) : null,
      filhos);
  }

  function renderCampo(no, caminho, obrigatorio, w) {
    const id = idDe(caminho);
    const valor = obter(ed.dados, caminho);
    const erroEl = h("span", { class: "campo__erro", id: id + "-erro", role: "alert" });
    const descr = [no.description ? id + "-ajuda" : null, id + "-erro"].filter(Boolean).join(" ");
    const wrap = h("div", { class: "campo", "data-caminho": chaveDe(caminho) });
    let entrada = null;
    let reg = null;

    if (w === "imagem" || w === "video") {
      anexar(wrap, ...cabecalhoCampo(no, caminho, obrigatorio, id + "-trocar"));
      const midia = renderMidia(no, caminho, w, id, () => reg);
      anexar(wrap, midia.el, erroEl);
      reg = registrarCampo(no, caminho, obrigatorio, wrap, midia.foco);
      return wrap;
    }

    if (w === "escolha") {
      const ops = opcoesDe(no) || [];
      const curtas = ops.length <= 4 && ops.every((o) => String(o.rotulo).length <= 18);
      if (curtas) {
        const titulo = no.title || humanizar(caminho[caminho.length - 1]);
        const grupo = h("fieldset", { class: "opcoes", "aria-describedby": descr },
          h("legend", { class: "sr", text: titulo }),
          ops.map((o, i) => {
            const inp = h("input", { type: "radio", name: id, id: id + "-" + i, value: String(o.valor), checked: o.valor === valor });
            inp.addEventListener("change", () => { reg.tocado = true; aoEditar(reg, o.valor); });
            return h("label", { class: "opcao" }, inp, h("span", { text: o.rotulo }));
          }));
        anexar(wrap, h("span", { class: "campo__rotulo", "aria-hidden": "true" }, titulo, exigePreencher(no, obrigatorio) ? h("span", { class: "campo__obrig", text: "(obrigatório)" }) : null),
          no.description ? h("span", { class: "campo__ajuda", id: id + "-ajuda", text: no.description }) : null,
          grupo, erroEl);
        entrada = grupo.querySelector("input");
      } else {
        entrada = h("select", { class: "campo__entrada", id, "aria-describedby": descr },
          h("option", { value: "", text: "Escolha…", disabled: obrigatorio, selected: valor == null || valor === "" }),
          ops.map((o, i) => h("option", { value: String(i), text: o.rotulo, selected: o.valor === valor })));
        entrada.addEventListener("change", () => { reg.tocado = true; aoEditar(reg, entrada.value === "" ? "" : ops[Number(entrada.value)].valor); });
        anexar(wrap, ...cabecalhoCampo(no, caminho, obrigatorio, id), entrada, erroEl);
      }
      reg = registrarCampo(no, caminho, obrigatorio, wrap, entrada);
      return wrap;
    }

    if (w === "interruptor") {
      entrada = h("input", { type: "checkbox", id, checked: valor === true, "aria-describedby": descr });
      entrada.addEventListener("change", () => aoEditar(reg, entrada.checked));
      anexar(wrap, h("label", { class: "interruptor", for: id }, entrada, h("span", { class: "campo__rotulo", style: "margin:0", text: no.title || humanizar(caminho.at(-1)) })),
        no.description ? h("span", { class: "campo__ajuda", id: id + "-ajuda", text: no.description }) : null, erroEl);
      reg = registrarCampo(no, caminho, obrigatorio, wrap, entrada);
      return wrap;
    }

    const texto = valor == null ? "" : String(valor);
    // valor antigo fora do formato do seletor de data/hora: vira texto para não sumir na tela
    const formatoOk = (w === "data" && (texto === "" || RE_DATA.test(texto))) || (w === "hora" && (texto === "" || RE_HORA.test(texto.slice(0, 5))));
    const props = { class: "campo__entrada", id, "aria-describedby": descr, autocomplete: "off" };
    if (w === "texto-longo") {
      entrada = h("textarea", { ...props, rows: Math.min(8, Math.max(3, Math.ceil(texto.length / 60))) });
      entrada.value = texto;
    } else if ((w === "data" || w === "hora") && formatoOk) {
      entrada = h("input", { ...props, type: w === "data" ? "date" : "time", value: w === "hora" ? texto.slice(0, 5) : texto });
    } else if (w === "numero") {
      entrada = h("input", { ...props, type: "number", inputmode: no.type === "integer" ? "numeric" : "decimal", value: texto, step: no.type === "integer" ? "1" : "any" });
    } else {
      entrada = h("input", { ...props, type: "text", value: texto, autocomplete: "off", spellcheck: "true" });
    }
    let contador = null;
    if (no.maxLength && (w === "texto" || w === "texto-longo")) {
      contador = h("span", { class: "campo__contador", "aria-hidden": "true" });
      const atual = () => {
        const n = [...entrada.value].length;
        contador.textContent = `${n} de ${no.maxLength}`;
        contador.classList.toggle("campo__contador--estouro", n > no.maxLength);
      };
      atual();
      entrada.addEventListener("input", atual);
    }
    entrada.addEventListener("input", () => {
      let v = entrada.value;
      if (w === "numero") v = v === "" ? "" : Number(v);
      aoEditar(reg, v);
    });
    entrada.addEventListener("blur", () => { reg.tocado = true; checarCampo(reg); });
    anexar(wrap, ...cabecalhoCampo(no, caminho, obrigatorio, id), entrada, contador, erroEl);
    reg = registrarCampo(no, caminho, obrigatorio, wrap, entrada);
    return wrap;
  }

  /* ------------------------------------------------------------ imagem e vídeo */
  function urlDaMidia(v) {
    if (!v || typeof v !== "string") return "";
    if (v.startsWith("midia:")) {
      return `${CONFIG.url}/storage/v1/object/public/${CONFIG.bucket}/${v.slice(6).split("/").map(encodeURIComponent).join("/")}`;
    }
    if (/^(https?:|data:|blob:)/.test(v)) return v;
    return CONFIG.site + v.replace(/^\.?\//, "");
  }

  function nomeUnico(arquivo) {
    const ponto = arquivo.name.lastIndexOf(".");
    const ext = (ponto > 0 ? arquivo.name.slice(ponto + 1) : (arquivo.type.split("/")[1] || "bin")).toLowerCase().replace(/[^a-z0-9]/g, "").replace("jpeg", "jpg");
    const base = slugificar(ponto > 0 ? arquivo.name.slice(0, ponto) : arquivo.name).slice(0, 40) || "arquivo";
    const sorte = Math.random().toString(36).slice(2, 6);
    return `${base}-${Date.now().toString(36)}${sorte}.${ext}`;
  }

  function renderMidia(no, caminho, w, id, pegarReg) {
    const ehVideo = w === "video";
    const tipos = ehVideo ? TIPOS_VIDEO : TIPOS_IMAGEM;
    const limite = ehVideo ? CONFIG.limiteVideoMB : CONFIG.limiteImagemMB;
    const previa = h("div", { class: "midia__previa" });
    const caminhoEl = h("p", { class: "midia__caminho" });
    const envio = h("div", { class: "midia__envio", role: "status", hidden: true });
    const arquivo = h("input", { type: "file", class: "midia__arquivo", accept: tipos.join(","), tabindex: "-1", "aria-hidden": "true" });
    const trocar = h("button", { type: "button", class: "botao botao--claro botao--pequeno", id: id + "-trocar" });
    const remover = h("button", { type: "button", class: "link-botao", text: ehVideo ? "Remover vídeo" : "Remover imagem" });

    const desenhar = (src) => {
      const v = obter(ed.dados, caminho);
      const url = src || urlDaMidia(v);
      trocar.textContent = v ? (ehVideo ? "Trocar vídeo" : "Trocar imagem") : (ehVideo ? "Escolher vídeo" : "Escolher imagem");
      remover.hidden = !v || pegarReg()?.obrigatorio;
      caminhoEl.textContent = !v ? "" : v.startsWith("midia:") ? "Arquivo enviado pelo painel" : "Arquivo do site: " + v.split("/").pop();
      previa.className = "midia__previa";
      if (!url) {
        previa.classList.add("midia__previa--vazia");
        previa.replaceChildren(ehVideo ? "Sem vídeo" : "Sem imagem");
        return;
      }
      const falhou = () => {
        previa.classList.add("midia__previa--vazia");
        previa.replaceChildren("Prévia indisponível");
      };
      const midia = ehVideo
        ? h("video", { src: url, muted: true, playsInline: true, preload: "metadata", controls: true })
        : h("img", { src: url, alt: "Prévia: " + (no.title || ""), loading: "lazy", decoding: "async" });
      midia.addEventListener("error", falhou);
      previa.replaceChildren(midia);
    };

    trocar.addEventListener("click", () => arquivo.click());
    remover.addEventListener("click", () => { aoEditar(pegarReg(), ""); desenhar(); trocar.focus(); });
    arquivo.addEventListener("change", async () => {
      const f = arquivo.files?.[0];
      arquivo.value = "";
      if (!f) return;
      const reg = pegarReg();
      reg.tocado = true;
      if (!tipos.includes(f.type)) {
        const heic = /heic|heif/i.test(f.type + f.name);
        mostrarErro(reg, heic ? "Fotos HEIC do iPhone não são aceitas aqui. Envie em JPG, PNG ou WebP."
          : ehVideo ? "Envie o vídeo em MP4 ou WebM." : "Envie a imagem em JPG, PNG ou WebP.");
        return;
      }
      if (f.size > limite * 1024 * 1024) {
        mostrarErro(reg, `Arquivo grande demais (${(f.size / 1048576).toFixed(1).replace(".", ",")} MB). O limite é ${limite} MB.`);
        return;
      }
      mostrarErro(reg, "");
      const local = URL.createObjectURL(f);
      desenhar(local);
      envio.hidden = false;
      envio.replaceChildren(h("span", { class: "giro", "aria-hidden": "true" }), "Enviando " + (ehVideo ? "vídeo" : "imagem") + "…");
      trocar.disabled = true;
      ed.enviando++;
      atualizarBarra();
      const destino = `${ed.edicao.slug}/${nomeUnico(f)}`;
      const { error } = await sb.storage.from(CONFIG.bucket).upload(destino, f, { cacheControl: "31536000", upsert: false, contentType: f.type });
      ed.enviando--;
      trocar.disabled = false;
      envio.hidden = true;
      URL.revokeObjectURL(local);
      if (error) {
        desenhar();
        const t = String(error.message || "");
        mostrarErro(reg, /exceeded|too large|413/i.test(t) ? `O servidor recusou: arquivo maior que o permitido.`
          : /row-level|unauthorized|403|permission/i.test(t) ? "Sua conta não tem permissão para enviar arquivos."
          : "Não foi possível enviar o arquivo. " + msgDeErro(error));
        atualizarBarra();
        return;
      }
      aoEditar(reg, "midia:" + destino);
      desenhar();
      aviso((ehVideo ? "Vídeo enviado" : "Imagem enviada") + ". Salve para guardar a troca.");
      trocar.focus();
    });

    desenhar();
    const el = h("div", { class: "midia" }, previa,
      h("div", { class: "midia__lado" }, caminhoEl, h("div", { class: "midia__botoes" }, trocar, remover), envio, arquivo));
    return { el, foco: trocar };
  }

  /* ------------------------------------------------------------ várias opções marcáveis (array com x-widget "escolha") */
  // De onde vêm as opções quando o schema não lista (enum): "x-opcoes": "ingressos.lista[].id" (+ "x-opcoes-rotulo": "nome").
  // Enquanto o schema v1 não traz x-opcoes, "abre" (salas da planta) usa os códigos dos ingressos.
  const FONTES_OPCOES = { abre: { caminho: "ingressos.lista[].id", rotulo: "nome" } };

  function opcoesMultipla(no, chave) {
    const fixas = opcoesDe(res(no.items || {}));
    if (fixas) return fixas;
    const fonte = no["x-opcoes"] ? { caminho: no["x-opcoes"], rotulo: no["x-opcoes-rotulo"] } : FONTES_OPCOES[chave];
    if (!fonte) return [];
    const [antes, campo] = fonte.caminho.split("[].");
    const arr = obter(ed.dados, antes.split("."));
    if (!Array.isArray(arr)) return [];
    const vistos = new Set();
    return arr.filter((x) => x && typeof x[campo] === "string" && x[campo] && !vistos.has(x[campo]) && vistos.add(x[campo]))
      .map((x) => ({ valor: x[campo], rotulo: fonte.rotulo && x[fonte.rotulo] ? String(x[fonte.rotulo]) : x[campo] }));
  }

  function atualizarMultiplas(exceto) {
    for (const g of ed.multiplas) if (g !== exceto && g.wrap.isConnected) g.desenhar();
  }

  function renderMultipla(no, caminho, obrigatorio) {
    const id = idDe(caminho);
    const titulo = no.title || humanizar(caminho[caminho.length - 1]);
    const erroEl = h("span", { class: "campo__erro", id: id + "-erro", role: "alert" });
    const grupo = h("fieldset", { class: "opcoes", "aria-describedby": [no.description ? id + "-ajuda" : null, id + "-erro"].filter(Boolean).join(" ") });
    const wrap = h("div", { class: "campo", "data-caminho": chaveDe(caminho) },
      h("span", { class: "campo__rotulo", id: id + "-rotulo", text: titulo }),
      no.description ? h("span", { class: "campo__ajuda", id: id + "-ajuda", text: no.description }) : null,
      grupo, erroEl);
    grupo.setAttribute("aria-labelledby", id + "-rotulo");
    let reg = null;
    const g = { wrap, desenhar: null };
    g.desenhar = () => {
      const atual = Array.isArray(obter(ed.dados, caminho)) ? obter(ed.dados, caminho) : [];
      const ops = opcoesMultipla(no, caminho[caminho.length - 1]);
      // valor marcado que não existe mais nas opções continua visível (e marcado) até a pessoa desmarcar
      for (const v of atual) if (!ops.some((o) => o.valor === v)) ops.push({ valor: v, rotulo: `${v} (não existe mais)` });
      const focado = grupo.contains(document.activeElement) ? document.activeElement.value : null;
      grupo.replaceChildren(...(ops.length ? ops.map((o, i) => {
        const inp = h("input", { type: "checkbox", id: `${id}-${i}`, value: String(o.valor), checked: atual.includes(o.valor) });
        inp.addEventListener("change", () => {
          const marcados = [...grupo.querySelectorAll("input:checked")].map((x) => ops[Number(x.id.slice(id.length + 1))].valor);
          reg.tocado = true;
          aoEditar(reg, marcados);
        });
        return h("label", { class: "opcao opcao--marca" }, inp, h("span", { text: o.rotulo }));
      }) : [h("span", { class: "campo__ajuda", text: "Nenhuma opção disponível ainda." })]));
      if (focado != null) [...grupo.querySelectorAll("input")].find((x) => x.value === focado)?.focus();
    };
    g.desenhar();
    ed.multiplas.add(g);
    reg = registrarCampo(no, caminho, obrigatorio, wrap, grupo.querySelector("input"));
    return wrap;
  }

  /* ------------------------------------------------------------ listas */
  function resumoDoItem(itemNo, valor) {
    if (valor == null) return "";
    if (typeof valor !== "object") return String(valor);
    // até duas partes curtas: a data (se houver) e o primeiro texto; códigos ("id") ficam de fora
    let data = "";
    const textos = [];
    for (const { k, no } of propriedadesOrdenadas(itemNo)) {
      const w = widgetDe(no);
      const v = typeof valor[k] === "string" ? valor[k].trim() : "";
      if (!v || k === "id" || v.length > 80) continue;
      if (w === "data" && !data && RE_DATA.test(v)) data = v.split("-").reverse().join("/");
      else if (w === "texto" || w === "hora" || w === "escolha") textos.push(v);
    }
    const partes = data ? [data, textos.find((t) => !/^\d/.test(t))] : textos.slice(0, 2);
    const r = partes.filter(Boolean).join(" · ");
    if (r) return r;
    for (const { k, no } of propriedadesOrdenadas(itemNo)) {
      if (widgetDe(no) === "texto-longo" && typeof valor[k] === "string" && valor[k].trim()) return valor[k].trim();
    }
    return "";
  }

  function renderLista(no, caminho, obrigatorio, nivel) {
    const itemNo = res(no.items || {});
    const itemObjeto = widgetDe(itemNo) === "objeto";
    const singular = (itemNo.title || "item").toLowerCase();
    const id = idDe(caminho);
    const titulo = no.title || humanizar(caminho[caminho.length - 1]);
    const wrap = h("section", { class: "lista", "data-caminho": chaveDe(caminho), "aria-labelledby": id + "-titulo" });
    const ul = h("ul", { class: "lista__itens" });
    const conta = h("span", { class: "lista__conta" });
    const erroEl = h("span", { class: "campo__erro lista__erro", role: "alert" });
    const adicionar = h("button", { type: "button", class: "botao botao--claro botao--pequeno" }, "+ Adicionar " + singular);
    const tag = nivel <= 1 ? "h2" : "h3";
    const tamanhoFixo = no.minItems && no.minItems === no.maxItems;
    anexar(wrap, 
      h("div", { class: "lista__cabeca" }, h(tag, { class: "lista__titulo", id: id + "-titulo", text: titulo }), conta),
      no.description ? h("p", { class: "grupo__ajuda", text: no.description }) : null,
      ul, erroEl, adicionar);
    const reg = registrarCampo(no, caminho, obrigatorio, wrap, adicionar);

    const arr = () => {
      let a = obter(ed.dados, caminho);
      if (!Array.isArray(a)) { a = []; definir(ed.dados, caminho, a); }
      return a;
    };

    const desenhar = (focar) => {
      // tira do registro os campos dos itens antigos; os novos se registram ao renderizar
      const prefixo = chaveDe(caminho) + ".";
      for (const k of [...ed.campos.keys()]) if (k.startsWith(prefixo)) ed.campos.delete(k);
      const a = Array.isArray(obter(ed.dados, caminho)) ? obter(ed.dados, caminho) : [];
      conta.textContent = a.length ? plural(a.length, singular, singular + "s") : "";
      adicionar.disabled = !!(no.maxItems && a.length >= no.maxItems);
      adicionar.hidden = !!(tamanhoFixo && a.length === no.maxItems);
      adicionar.title = adicionar.disabled ? `No máximo ${no.maxItems}` : "";
      ul.replaceChildren(...a.map((valor, i) => renderItem(i, valor, a.length)));
      if (ed.mostrarTudo || reg.tocado) checarCampo(reg);
      atualizarMultiplas();
      if (focar) focar();
    };

    const mover = (i, d) => {
      const a = arr();
      const j = i + d;
      if (j < 0 || j >= a.length) return;
      [a[i], a[j]] = [a[j], a[i]];
      marcarSujo();
      desenhar(() => {
        const alvo = ul.children[j]?.querySelector(d < 0 ? "[data-acao=cima]" : "[data-acao=baixo]");
        (alvo && !alvo.disabled ? alvo : ul.children[j]?.querySelector("button"))?.focus();
      });
      anunciar(`Movido para a posição ${j + 1}.`);
    };

    const remover = async (i) => {
      const a = arr();
      const nome = resumoDoItem(itemNo, a[i]) || `${singular} ${i + 1}`;
      const temConteudo = itemObjeto ? Object.values(a[i] || {}).some((v) => v !== "" && v != null && !(Array.isArray(v) && !v.length)) : a[i] !== "";
      if (temConteudo && !(await confirmar(`Remover ${singular}?`, `“${nome}” sai desta edição quando você salvar.`, "Remover", "botao--perigo"))) return;
      a.splice(i, 1);
      reg.tocado = true;
      marcarSujo();
      desenhar(() => {
        const prox = ul.children[Math.min(i, a.length - 1)];
        (prox?.querySelector(".item__abrir, input, textarea") || adicionar).focus();
      });
      if (ed.mostrarTudo) contarErrosNasAbas();
    };

    const ferramentas = (i, total) => h("div", { class: "ferramentas" },
      h("button", { type: "button", class: "icone", "data-acao": "cima", html: ICONES.cima, disabled: i === 0, "aria-label": `Mover ${singular} ${i + 1} para cima`, onclick: () => mover(i, -1) }),
      h("button", { type: "button", class: "icone", "data-acao": "baixo", html: ICONES.baixo, disabled: i === total - 1, "aria-label": `Mover ${singular} ${i + 1} para baixo`, onclick: () => mover(i, 1) }),
      h("button", { type: "button", class: "icone icone--perigo", html: ICONES.lixo, disabled: !!(no.minItems && total <= no.minItems), "aria-label": `Remover ${singular} ${i + 1}`, onclick: () => remover(i) }));

    const renderItem = (i, valor, total) => {
      const cam = [...caminho, i];
      if (!itemObjeto) {
        const campo = renderNo(itemNo, cam, true, nivel + 1);
        const rot = campo.querySelector(".campo__rotulo");
        if (rot) rot.classList.add("sr");
        if (rot) rot.textContent = `${itemNo.title || humanizar(singular)} ${i + 1}`;
        return h("li", { class: "item item--simples" }, campo, ferramentas(i, total));
      }
      const corpoId = idDe(cam) + "-corpo";
      const aberto = ed.aberto.get(valor) ?? false;
      const resumo = h("span", { class: "item__resumo" });
      const marcaErro = h("span", { class: "item__erro-marca", hidden: true, title: "Este item tem campos para corrigir" });
      const abrir = h("button", { type: "button", class: "item__abrir", "aria-expanded": String(aberto), "aria-controls": corpoId },
        h("span", { class: "item__seta", "aria-hidden": "true" }), h("span", { class: "item__num", text: String(i + 1).padStart(2, "0") }), resumo, marcaErro);
      const corpo = h("div", { class: "item__corpo", id: corpoId, hidden: !aberto }, renderNo(itemNo, cam, true, nivel + 1));
      const atualizarResumo = () => {
        const r = resumoDoItem(itemNo, obter(ed.dados, cam));
        resumo.textContent = r || `${humanizar(singular)} sem nome`;
        resumo.classList.toggle("item__resumo--vazio", !r);
      };
      atualizarResumo();
      corpo.addEventListener("input", atualizarResumo);
      corpo.addEventListener("change", atualizarResumo);
      abrir.addEventListener("click", () => {
        const v = abrir.getAttribute("aria-expanded") !== "true";
        abrir.setAttribute("aria-expanded", String(v));
        corpo.hidden = !v;
        const obj = obter(ed.dados, cam);
        if (obj && typeof obj === "object") ed.aberto.set(obj, v);
      });
      return h("li", { class: "item", "data-caminho": chaveDe(cam) }, h("div", { class: "item__cabeca" }, abrir, ferramentas(i, total)), corpo);
    };

    adicionar.addEventListener("click", () => {
      const a = arr();
      if (no.maxItems && a.length >= no.maxItems) return;
      const novo = valorNovo(itemNo);
      a.push(novo === undefined ? "" : novo);
      if (novo && typeof novo === "object") ed.aberto.set(novo, true);
      reg.tocado = true;
      marcarSujo();
      desenhar(() => {
        const li = ul.lastElementChild;
        li?.scrollIntoView({ block: "center", behavior: "smooth" });
        li?.querySelector(".item__corpo input, .item__corpo textarea, .item__corpo select, input, textarea")?.focus({ preventScroll: true });
      });
    });

    desenhar();
    return wrap;
  }

  /* ------------------------------------------------------------ erros no formulário inteiro */
  function contarErrosNasAbas() {
    const erros = coletarErros(SCHEMA, ed.dados, [], true, []);
    const porGrupo = new Map();
    const raiz = res(SCHEMA);
    for (const e of erros) {
      const topo = res(raiz.properties?.[e.caminho[0]]);
      const g = topo?.["x-grupo"] || "Outros";
      porGrupo.set(g, (porGrupo.get(g) || 0) + 1);
    }
    for (const g of grupos()) {
      const b = document.getElementById(g.id);
      const s = b?.querySelector(".aba__erros");
      if (!s) continue;
      const n = porGrupo.get(g.nome) || 0;
      s.hidden = !n;
      s.textContent = n;
      s.setAttribute("aria-label", n ? `${n} para corrigir` : "");
    }
    // bolinha vermelha nos itens fechados que têm erro dentro
    document.querySelectorAll(".item[data-caminho], .secao[data-caminho]").forEach((li) => {
      const k = li.dataset.caminho + ".";
      const m = li.querySelector(":scope > .item__cabeca .item__erro-marca, :scope > summary .item__erro-marca");
      if (m) m.hidden = !erros.some((e) => chaveDe(e.caminho).startsWith(k));
    });
    return erros;
  }

  function irParaErro(erro) {
    const raiz = res(SCHEMA);
    const g = res(raiz.properties?.[erro.caminho[0]])?.["x-grupo"] || "Outros";
    mostrarAba(g);
    // abre os itens fechados no caminho do erro
    for (let n = 1; n < erro.caminho.length; n++) {
      const li = document.querySelector(`.item[data-caminho="${CSS.escape(chaveDe(erro.caminho.slice(0, n + 1)))}"]`);
      if (!li || typeof erro.caminho[n] !== "number") continue;
      const b = li.querySelector(":scope > .item__cabeca .item__abrir");
      if (b && b.getAttribute("aria-expanded") !== "true") b.click();
    }
    const reg = ed.campos.get(chaveDe(erro.caminho));
    const alvo = reg?.entrada || reg?.wrap;
    for (let d = alvo?.closest("details"); d; d = d.parentElement?.closest("details")) d.open = true;
    if (alvo) {
      alvo.scrollIntoView({ block: "center" });
      alvo.focus({ preventScroll: true });
    }
  }

  /* ------------------------------------------------------------ salvar */
  async function salvarEdicao({ forcar = false } = {}) {
    if (ed.salvando || !ed.edicao) return false;
    if (ed.enviando) { aviso("Espere o envio do arquivo terminar e salve de novo.", "erro"); return false; }
    completar(SCHEMA, ed.dados);
    const erros = coletarErros(SCHEMA, ed.dados, [], true, []);
    if (erros.length) {
      ed.mostrarTudo = true;
      for (const reg of ed.campos.values()) checarCampo(reg);
      contarErrosNasAbas();
      const msg = erros.length === 1 ? "Corrija o campo marcado em vermelho para salvar." : `Corrija os ${erros.length} campos marcados em vermelho para salvar.`;
      atualizarBarra(msg);
      aviso(msg, "erro");
      irParaErro(erros[0]);
      return false;
    }
    ed.salvando = true;
    atualizarBarra();
    const agora = new Date().toISOString();
    let q = sb.from("edicoes").update({ dados: ed.dados, atualizado_em: agora }).eq("id", ed.edicao.id);
    if (!forcar && ed.base) q = q.eq("atualizado_em", ed.base);
    const { data, error } = await q.select("atualizado_em").maybeSingle();
    ed.salvando = false;
    if (error) {
      const msg = "Não foi possível salvar. " + msgDeErro(error);
      atualizarBarra("Não salvo: tente de novo");
      aviso(msg + " Suas alterações continuam aqui.", "erro");
      return false;
    }
    if (!data) {
      // nenhuma linha mudou: ou alguém salvou antes (atualizado_em diferente), ou falta permissão
      const atual = await sb.from("edicoes").select("atualizado_em").eq("id", ed.edicao.id).maybeSingle();
      if (atual.data && atual.data.atualizado_em !== ed.base) {
        const substituir = await confirmar("Outra pessoa salvou esta edição",
          [`Ela foi salva ${quando(atual.data.atualizado_em)}, depois que você abriu.`, "Se você salvar agora, as mudanças da outra pessoa são substituídas pelas suas."],
          "Salvar mesmo assim", "botao--perigo");
        if (substituir) return salvarEdicao({ forcar: true });
        atualizarBarra("Não salvo");
        return false;
      }
      atualizarBarra("Não salvo");
      aviso("Sua conta não tem permissão para salvar esta edição. Peça para conferirem seu acesso.", "erro");
      return false;
    }
    ed.base = data.atualizado_em;
    ed.sujo = false;
    ed.salvoEm = new Date();
    ed.mostrarTudo = false;
    clearTimeout(ed.rascunhoTimer);
    local.apagar(chaveRascunho(ed.edicao.id));
    contarErrosNasAbas();
    atualizarBarra();
    aviso("Alterações salvas. O site só muda quando você publicar.");
    return true;
  }

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && ed.edicao && rota().tela === "editor" && !dialogoAberto) {
      e.preventDefault();
      document.activeElement?.blur?.();
      salvarEdicao();
    }
  });

  /* ------------------------------------------------------------ publicar */
  const pub = { id: null, timer: 0, inicio: 0, falhas: 0, edicaoId: null, nome: "" };

  function faixa(tipo, partes) {
    const f = $("#faixa-publicacao");
    f.className = "faixa-publicacao" + (tipo ? " faixa-publicacao--" + tipo : "");
    f.replaceChildren(...partes);
    f.hidden = false;
    medir();
  }

  function fecharFaixa() {
    $("#faixa-publicacao").hidden = true;
    medir();
  }

  async function publicarEdicao(alvo) {
    const edicao = alvo || ed.edicao;
    if (!edicao) return;
    if (pub.id && pub.timer) { aviso("Já existe uma publicação em andamento. Espere ela terminar."); return; }
    const corpo = [h("p", null, "O site vai passar a mostrar a edição ", h("strong", { text: edicao.nome || edicao.slug }), ". Leva cerca de 1 a 2 minutos.")];
    if (!alvo && ed.sujo) corpo.push("Suas alterações serão salvas antes.");
    if (!edicao.ativa) corpo.push("Ela substitui a edição que está no site agora.");
    if (!alvo && !(await confirmar("Publicar no site?", corpo, "Publicar agora", "botao--ouro"))) return;
    if (!alvo && (ed.sujo || ed.enviando)) {
      const ok = await salvarEdicao();
      if (!ok) return;
    }
    const botao = $("#publicar");
    if (botao) botaoCarregando(botao, true, "Publicando…");
    faixa(null, [h("span", { class: "giro", "aria-hidden": "true" }), h("span", { class: "faixa-publicacao__texto" }, h("strong", { text: "Começando a publicação…" }))]);
    let data, error;
    try {
      ({ data, error } = await sb.functions.invoke("publicar", { body: { edicao_id: edicao.id } }));
    } catch (e) { error = e; }
    if (botao) botaoCarregando(botao, false, "Publicar");
    if (error) {
      const { titulo, detalhe } = await erroDaFuncao(error);
      faixaErro(titulo, detalhe, edicao);
      return;
    }
    if (!data?.publicacao_id) {
      faixaErro("A publicação não começou.", "O servidor não devolveu o número da publicação.", edicao);
      return;
    }
    if (ed.edicao && ed.edicao.id === edicao.id) ed.edicao.ativa = true;
    acompanhar(data.publicacao_id, edicao);
  }

  async function erroDaFuncao(error) {
    const nome = error?.name || "";
    const resp = error?.context;
    let status = resp?.status;
    let corpo = null;
    if (resp && typeof resp.clone === "function") {
      try { corpo = await resp.clone().json(); } catch { try { corpo = { error: await resp.clone().text() }; } catch { /* sem corpo */ } }
    }
    const detalheServidor = corpo?.erro || corpo?.error || corpo?.message || corpo?.detalhe || "";
    if (nome === "FunctionsFetchError" || (!status && /fetch|network/i.test(String(error?.message)))) {
      return { titulo: "Sem conexão com o servidor.", detalhe: "Verifique a internet e tente de novo. Suas alterações estão salvas." };
    }
    if (status === 503) {
      return { titulo: "A publicação ainda não está ligada.", detalhe: "Falta configurar a conexão do painel com o GitHub (onde o site é gerado). Suas alterações estão salvas; avise o suporte técnico." };
    }
    if (status === 401 || status === 403) return { titulo: "Sua conta não tem permissão para publicar.", detalhe: "Peça para conferirem seu acesso ao painel." };
    if (status === 409) return { titulo: "Já existe uma publicação em andamento.", detalhe: "Espere ela terminar e publique de novo." };
    return { titulo: "Não foi possível começar a publicação.", detalhe: (status ? `Erro ${status}. ` : "") + (detalheServidor || String(error?.message || "")) };
  }

  function faixaErro(titulo, detalhe, edicao) {
    faixa("erro", [
      h("span", { class: "faixa-publicacao__texto" }, h("strong", { text: titulo }), detalhe ? h("span", { class: "faixa-publicacao__detalhe", text: detalhe }) : null),
      h("span", { class: "faixa-publicacao__acoes" },
        edicao ? h("button", { type: "button", class: "botao botao--pequeno", text: "Tentar de novo", onclick: () => { fecharFaixa(); publicarEdicao(edicao); } }) : null,
        h("button", { type: "button", class: "botao botao--claro botao--pequeno", text: "Fechar", onclick: fecharFaixa })),
    ]);
  }

  function acompanhar(id, edicao, inicio = Date.now()) {
    clearTimeout(pub.timer);
    Object.assign(pub, { id, inicio, falhas: 0, edicaoId: edicao?.id, nome: edicao?.nome || "" });
    mostrarAndamento("pedido");
    const passo = async () => {
      const { data, error } = await sb.from("publicacoes").select("id,estado,detalhe,concluido_em").eq("id", id).maybeSingle();
      if (pub.id !== id) return;
      if (error || !data) {
        pub.falhas++;
        if (pub.falhas >= 5) mostrarAndamento("semConexao");
      } else {
        pub.falhas = 0;
        if (data.estado === "ok") {
          pub.timer = 0;
          faixa("ok", [
            h("span", { class: "faixa-publicacao__texto" }, h("strong", { text: "Publicado." }),
              h("span", { class: "faixa-publicacao__detalhe", text: "Se o site ainda mostrar a versão anterior, recarregue a página em um minuto." })),
            h("span", { class: "faixa-publicacao__acoes" },
              h("a", { class: "botao botao--pequeno", href: CONFIG.site, target: "_blank", rel: "noopener" }, "Ver o site", h("span", { class: "sr", text: " (abre em nova aba)" })),
              h("button", { type: "button", class: "botao botao--claro botao--pequeno", text: "Fechar", onclick: fecharFaixa })),
          ]);
          if (rota().tela === "lista") telaLista();
          else if (ed.edicao && ed.edicao.id === pub.edicaoId) {
            ed.edicao.ativa = true;
          }
          return;
        }
        if (data.estado === "erro") {
          pub.timer = 0;
          faixaErro("A publicação falhou. O site continua como estava.", data.detalhe || "Sem detalhe do erro.", edicao);
          return;
        }
        mostrarAndamento(data.estado);
      }
      if (Date.now() - pub.inicio > CONFIG.publicacaoDesiste) {
        pub.timer = 0;
        faixaErro("A publicação não respondeu em 20 minutos.", "Confira o site em alguns minutos; se não mudou, tente publicar de novo.", edicao);
        return;
      }
      pub.timer = setTimeout(passo, CONFIG.intervaloPublicacao);
    };
    pub.timer = setTimeout(passo, 600);
  }

  function mostrarAndamento(estado) {
    const demorando = Date.now() - pub.inicio > CONFIG.publicacaoDemorada;
    const titulo = estado === "semConexao" ? "Sem conexão para acompanhar a publicação."
      : demorando ? "Está demorando mais que o normal…"
      : estado === "pedido" ? "Publicação pedida. Começando…"
      : "Publicando… leva cerca de 1 a 2 minutos.";
    const detalhe = estado === "semConexao" ? "Ela continua no servidor. Tentando de novo…"
      : "Você pode continuar usando o painel" + (demorando ? " ou fechá-lo; a publicação continua." : ".");
    faixa(null, [h("span", { class: "giro", "aria-hidden": "true" }),
      h("span", { class: "faixa-publicacao__texto" }, h("strong", { text: titulo }), h("span", { class: "faixa-publicacao__detalhe", text: detalhe }))]);
  }

  // ao entrar: se há publicação recente ainda em andamento, volta a acompanhá-la
  async function retomarPublicacao() {
    if (pub.timer) return;
    const { data } = await sb.from("publicacoes").select("id,edicao_id,estado,pedido_em").order("pedido_em", { ascending: false }).limit(1);
    const p = data?.[0];
    if (!p || !["pedido", "rodando"].includes(p.estado)) return;
    const inicio = new Date(p.pedido_em).getTime();
    if (!(Date.now() - inicio < 30 * 60 * 1000)) return;
    acompanhar(p.id, { id: p.edicao_id }, inicio);
  }

  /* ------------------------------------------------------------ início */
  let schemaPronto = null;
  let saindo = false; // saída pedida pelo botão "Sair" (a tela de login já é desenhada por ele)

  async function iniciar() {
    if (!window.supabase?.createClient) {
      $("#carregando").replaceChildren(h("div", { class: "erro-tela", role: "alert" },
        h("p", { text: "Não foi possível carregar o painel. Verifique a internet e recarregue a página." }),
        h("button", { type: "button", class: "botao", text: "Recarregar", onclick: () => location.reload() })));
      return;
    }
    schemaPronto = carregarSchema();
    const hash = location.hash;
    const params = new URLSearchParams(hash.replace(/^#\/?/, "") + "&" + location.search.slice(1));
    const ehRecuperacao = params.get("type") === "recovery";
    const erroLink = params.get("error_description") || params.get("error");

    sb = window.supabase.createClient(CONFIG.url, CONFIG.chave, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "painel-clube-auth" },
    });

    let recuperando = ehRecuperacao;
    sb.auth.onAuthStateChange((evento, sessao) => {
      // a biblioteca pede para não chamar o Supabase dentro deste retorno: adia
      setTimeout(() => {
        if (evento === "PASSWORD_RECOVERY") { recuperando = true; telaNovaSenha(); }
        else if (evento === "SIGNED_OUT") {
          if (saindo) { saindo = false; return; }
          usuario = null;
          clearTimeout(pub.timer); pub.timer = 0; pub.id = null;
          if (ed.edicao && ed.sujo) local.gravar(chaveRascunho(ed.edicao.id), { dados: ed.dados, base: ed.base, em: Date.now() });
          const guardado = ed.edicao && ed.sujo;
          ed.sujo = false;
          telaLogin(guardado ? { mensagem: "Sua sessão terminou. Entre de novo: as alterações não salvas ficaram guardadas neste aparelho." } : {});
        }
      }, 0);
    });

    const { data } = await sb.auth.getSession();
    if (ehRecuperacao || erroLink || /access_token=/.test(hash)) history.replaceState(null, "", location.pathname + "#/");

    if (erroLink) {
      const expirado = /expired|invalid/i.test(erroLink) || params.get("error_code") === "otp_expired";
      telaLogin({ erro: expirado ? "Este link expirou ou já foi usado. Peça outro em “Esqueci a senha”." : "Não foi possível usar este link. Peça outro em “Esqueci a senha”." });
      return;
    }
    if (recuperando && data.session) return telaNovaSenha();
    if (!data.session) return telaLogin();
    entrar(data.session);
  }

  $("#sair").addEventListener("click", async () => {
    if ((ed.sujo || ed.enviando) && rota().tela === "editor" &&
      !(await confirmar("Sair sem salvar?", "Você tem alterações nesta edição que ainda não foram salvas.", "Sair sem salvar", "botao--perigo"))) return;
    ed.sujo = false;
    if (ed.edicao) local.apagar(chaveRascunho(ed.edicao.id));
    ed.edicao = null;
    clearTimeout(pub.timer); pub.timer = 0; pub.id = null;
    fecharFaixa();
    saindo = true;
    await sb.auth.signOut();
    usuario = null;
    history.replaceState(null, "", location.pathname + "#/");
    telaLogin({ mensagem: "Você saiu do painel." });
  });

  iniciar();
})();
