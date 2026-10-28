/* "Aparece em N lugares do site": em vez de uma lista mantida à mão, o painel desenha a página duas vezes (com o valor
   atual e com o valor trocado de propósito) e compara as duas. Todo elemento que mudou usa aquele campo, inclusive os
   derivados (dia da semana, {datas}, título da aba, cartão do WhatsApp, JSON-LD, pop-up). */
import { definir, obter, partes } from "./campos.js";

const SECOES = {
  hero: "Topo da página", oque: "O Clube", mesa: "Para quem é", mentores: "Quem vai estar lá", obra: "A obra",
  programa: "Programação", voo: "Voo até o resort", edicao: "Edição anterior", manifesto: "Manifesto",
  ingressos: "Ingressos", local: "Como chegar", convite: "Fechamento",
};

const ownText = (el) => { let s = ""; for (const n of el.childNodes) if (n.nodeType === 3) s += n.data; return s; };

function mudou(a, b) {
  if (a.attributes.length !== b.attributes.length) return true;
  for (const at of a.attributes) if (b.getAttribute(at.name) !== at.value) return true;
  return ownText(a) !== ownText(b);
}

// elementos de b que diferem de a (andando os dois em paralelo)
function comparar(a, b, out) {
  if (a.tagName !== b.tagName) { out.add(b); return; }
  if (mudou(a, b)) out.add(b);
  const ca = a.children, cb = b.children;
  if (ca.length !== cb.length) { out.add(b); return; }
  for (let i = 0; i < ca.length; i++) comparar(ca[i], cb[i], out);
}

const css = (s) => (window.CSS?.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'));

// seletor estável e único para achar o mesmo elemento na prévia: o ancestral mais próximo com marca única
// (id, data-campo, data-config, item de lista) e, dali, o caminho pelos filhos
function seletorDe(el) {
  const doc = el.ownerDocument;
  const unico = (sel) => { try { return doc.querySelectorAll(sel).length === 1 ? sel : null; } catch { return null; } };
  const passos = [];
  for (let e = el; e && e.tagName !== "BODY" && e.tagName !== "HTML"; e = e.parentElement) {
    let sel = null;
    if (e.id) sel = unico(`#${css(e.id)}`);
    for (const a of ["data-campo", "data-config", "data-campo-img"]) if (!sel && e.hasAttribute(a)) sel = unico(`[${a}="${css(e.getAttribute(a))}"]`);
    if (!sel && e.hasAttribute("data-item") && e.parentElement?.hasAttribute("data-lista")) {
      sel = unico(`[data-lista="${css(e.parentElement.getAttribute("data-lista"))}"] > [data-item="${css(e.getAttribute("data-item"))}"]`);
    }
    if (sel) return [sel, ...passos].join(" > ");
    passos.unshift(`:nth-child(${[...e.parentElement.children].indexOf(e) + 1})`);
  }
  return null;
}

function nomeDaSecao(sec) {
  if (!sec) return "";
  const id = sec.id || [...sec.classList].find((c) => SECOES[c]);
  if (id && SECOES[id]) return SECOES[id];
  for (const c of sec.classList) if (SECOES[c]) return SECOES[c];
  const t = sec.querySelector("h1, h2");
  return t ? t.textContent.trim().replace(/\s+/g, " ").slice(0, 40) : "Página";
}

// { rotulo, seletor } de um elemento que mudou; seletor null = não dá para mostrar na página
function lugarDe(el) {
  if (el.closest("head")) {
    if (el.tagName === "TITLE") return { rotulo: "Título da aba do navegador", seletor: null, grupo: "titulo" };
    if (el.matches('meta[name="description"]')) return { rotulo: "Descrição no Google", seletor: null, grupo: "desc" };
    if (el.matches('meta[property^="og:"], meta[name^="twitter:"]')) return { rotulo: "Cartão do WhatsApp e das redes", seletor: null, grupo: "og" };
    if (el.matches('script[type="application/ld+json"]')) return { rotulo: "Agenda do evento no Google (dados invisíveis)", seletor: null, grupo: "ld" };
    if (el.matches("script#dados-edicao")) return { rotulo: "Topo da página · abertura animada", seletor: ".hero", grupo: "abertura" };
    return { rotulo: "Cabeçalho invisível da página", seletor: null, grupo: "head" };
  }
  if (el.matches("script#dados-edicao") || el.closest("script#dados-edicao")) return { rotulo: "Topo da página · abertura animada", seletor: ".hero", grupo: "abertura" };
  if (el.matches('script[type="application/ld+json"]')) return { rotulo: "Agenda do evento no Google (dados invisíveis)", seletor: null, grupo: "ld" };
  if (el.closest("dialog")) return { rotulo: "Pop-up de cadastro", seletor: null, grupo: "popup" };
  if (el.closest("footer")) return { rotulo: "Rodapé", seletor: "footer", grupo: "rodape" };
  const sec = el.closest("section");
  let rotulo = nomeDaSecao(sec) || "Página";
  const dia = el.closest("[data-dia]")?.getAttribute("data-dia");
  const sub = el.closest(".mapa") ? "Mapa" : el.closest(".aeroportos") ? "Aeroportos" : el.closest(".hoteis, .local__extras") ? "Como ir e hotéis" : "";
  if (sub) rotulo += " · " + sub;
  if (dia) rotulo += ` · Dia ${dia}`;
  else if (el.closest(".mapa__parada")) {
    const i = [...el.closest(".mapa__paradas").querySelectorAll(".mapa__parada")].indexOf(el.closest(".mapa__parada"));
    if (i >= 0) rotulo += ` · Dia ${i + 1}`;
  }
  const seletor = seletorDe(el) || (sec?.id ? `#${css(sec.id)}` : null);
  return { rotulo, seletor, grupo: rotulo };
}

/* valores trocados de propósito para cada tipo de campo */
const ISO = /^\d{4}-\d{2}-\d{2}$/;
function somarDias(iso, n) {
  const [a, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(a, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}
function perturbacoes(v) {
  if (typeof v === "string" && ISO.test(v)) return [somarDias(v, 1), somarDias(v, 400)];
  if (typeof v === "string" && /^\d{2}:\d{2}$/.test(v)) return [v.slice(0, 3) + (v.slice(3) === "59" ? "58" : String(Number(v.slice(3)) + 1).padStart(2, "0"))];
  if (typeof v === "number") return [v + 1];
  if (typeof v === "string") return [v + " ʘʘ"];
  return [];
}

export function criarLugares(R, opcoesRender) {
  const parser = new DOMParser();
  let baseChave = null, baseDoc = null;
  const cache = new Map();
  const desenhar = (dados) => parser.parseFromString(R.renderizar(dados, opcoesRender), "text/html");

  // lugares onde algum dos caminhos aparece (união); cada lugar: { rotulo, seletor }
  function lugares(dados, caminhos) {
    const chave = JSON.stringify(dados);
    if (chave !== baseChave) { baseChave = chave; baseDoc = null; cache.clear(); }
    const ck = caminhos.join("|");
    if (cache.has(ck)) return cache.get(ck);
    baseDoc ??= desenhar(dados);
    const mudados = new Set();
    for (const c of caminhos) {
      for (const alt of perturbacoes(obter(dados, c))) {
        const d2 = JSON.parse(chave);
        definir(d2, partes(c), alt);
        let doc2;
        try { doc2 = desenhar(d2); } catch { continue; }
        comparar(baseDoc.documentElement, doc2.documentElement, mudados);
      }
    }
    const grupos = new Map();
    for (const el of mudados) {
      const l = lugarDe(el);
      if (!grupos.has(l.grupo)) grupos.set(l.grupo, { rotulo: l.rotulo, seletor: l.seletor });
    }
    // ordem da página, com os invisíveis no fim
    const lista = [...grupos.values()].sort((a, b) => (a.seletor === null) - (b.seletor === null));
    cache.set(ck, lista);
    return lista;
  }
  return { lugares };
}
