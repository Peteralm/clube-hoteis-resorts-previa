/* Peças de interface comuns ao painel: criar elementos, avisos, diálogo, campos simples, datas por extenso. */

export const $ = (sel, raiz = document) => raiz.querySelector(sel);

export function h(tag, props, ...filhos) {
  const e = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "html") e.innerHTML = v; // só com constantes deste painel (ícones)
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

/* ícones desenhados (traço 1.7, 20x20) */
const tr = (d, extra = "") => `<svg viewBox="0 0 20 20" aria-hidden="true" ${extra}><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const ICONE = {
  mais: tr("M10 4v12M4 10h12"),
  duplicar: tr("M7 7h9v9H7zM4 13V4h9"),
  cima: tr("M10 15V5M5 10l5-5 5 5"),
  baixo: tr("M10 5v10M5 10l5 5 5-5"),
  lixo: tr("M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10"),
  desfazer: tr("M7 5 3 9l4 4M3 9h9a5 5 0 0 1 0 10h-2"),
  refazer: tr("M13 5l4 4-4 4M17 9H8a5 5 0 0 0 0 10h2"),
  celular: tr("M6.5 2.5h7a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1zM9 15h2"),
  computador: tr("M2.5 4h15v9.5h-15zM7 17h6M10 13.5V17"),
  ajustes: tr("M3 6h8M15 6h2M3 14h2M9 14h8M13 4v4M7 12v4"),
  fechar: tr("M5 5l10 10M15 5 5 15"),
  voltar: tr("M12 4 6 10l6 6"),
  foto: tr("M3 5h14v11H3zM3 13l4-4 3 3 2-2 5 4M13 8.5h.01"),
  certo: tr("M4 10.5 8 14.5 16 6"),
  nuvem: tr("M6 15h8a3.5 3.5 0 0 0 .4-7A5 5 0 0 0 5 9a3 3 0 0 0 1 6z"),
  alerta: tr("M10 3 2 17h16zM10 8v4M10 14.5h.01"),
  calendario: tr("M3.5 5h13v11.5h-13zM3.5 8.5h13M7 3v3M13 3v3"),
  planta: tr("M3 3h14v14H3zM3 10h7v7M10 3v4M14 10h3"),
  olho: tr("M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10zM10 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z"),
  seta: tr("M5 10h10M11 6l4 4-4 4"),
};

let avisoTimer = 0;
// aviso curto no rodapé; acao = { rotulo, fazer }
export function aviso(msg, tipo, acao) {
  const caixa = $("#avisos");
  clearTimeout(avisoTimer);
  const el = h("div", { class: "aviso" + (tipo === "erro" ? " aviso--erro" : "") }, h("span", { text: msg }));
  if (acao) el.append(h("button", { type: "button", class: "aviso__acao", text: acao.rotulo, onclick: () => { caixa.replaceChildren(); acao.fazer(); } }));
  caixa.replaceChildren(el);
  avisoTimer = setTimeout(() => caixa.replaceChildren(), tipo === "erro" ? 7000 : acao ? 6500 : 3500);
}

export function anunciar(msg) {
  const r = $("#anuncio");
  r.textContent = "";
  setTimeout(() => { r.textContent = msg; }, 50);
}

export const local = {
  ler(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  gravar(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* sem espaço ou bloqueado */ } },
  apagar(k) { try { localStorage.removeItem(k); } catch { /* idem */ } },
};

const fmtHora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDia = new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short", year: "numeric" });
export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];

export function quando(iso) {
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

export function datasPorExtenso(isos) {
  const ds = [...new Set(isos)].filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)).sort().map((s) => s.split("-").map(Number));
  if (!ds.length) return "";
  const mesmoMes = ds.every(([a, m]) => a === ds[0][0] && m === ds[0][1]);
  if (mesmoMes) {
    const dias = ds.map((d) => d[2]);
    const lista = dias.length > 1 ? dias.slice(0, -1).join(", ") + " e " + dias.at(-1) : String(dias[0]);
    return `${lista} de ${MESES[ds[0][1] - 1]} de ${ds[0][0]}`;
  }
  return ds.map(([a, m, d]) => `${d} de ${MESES[m - 1]} de ${a}`).join(" e ");
}

export function diaDaSemana(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return "";
  const [a, m, d] = iso.split("-").map(Number);
  return SEMANA[new Date(a, m - 1, d).getDay()];
}

export function slugificar(s) {
  return String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/, "");
}

export function msgDeErro(e, contexto) {
  const t = String(e?.message || e || "");
  if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(t) && !e?.status) return "Sem conexão com o servidor. Verifique a internet e tente de novo.";
  if (/JWT|token is expired|not authenticated/i.test(t)) return "Sua sessão expirou. Entre de novo.";
  if (e?.code === "42501" || /permission denied|row-level security/i.test(t)) return "Sua conta não tem permissão para isso. Peça para conferirem seu acesso.";
  return (contexto ? contexto + " " : "") + (t ? `Detalhe: ${t}` : "Tente de novo em instantes.");
}

export function botaoCarregando(botao, sim, rotulo) {
  botao.disabled = sim;
  botao.setAttribute("aria-busy", String(sim));
  botao.replaceChildren(...(sim ? [h("span", { class: "giro", "aria-hidden": "true" }), " " + rotulo] : [rotulo]));
}

/* ------------------------------------------------------------ diálogo genérico */
export let dialogoAberto = null;

// botoes: [{ rotulo, valor, classe }]; o último é o principal. validar(valor, corpo) -> string de erro | false | true
export function dialogo({ titulo, corpo, botoes, validar }) {
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

export const confirmar = (titulo, corpo, rotuloSim, classe = "") =>
  dialogo({ titulo, corpo, botoes: [{ rotulo: "Cancelar", valor: "cancelar", classe: "botao--claro" }, { rotulo: rotuloSim, valor: "sim", classe }] })
    .then((v) => v === "sim");

export function campoSimples({ id, rotulo, tipo = "text", valor = "", ajuda, autocomplete, obrigatorio, inputmode, maxlength }) {
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
