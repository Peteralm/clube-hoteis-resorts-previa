// Renderizador da landing page: dados da edição (JSON v2) + modelo.njk -> HTML.
// O MESMO arquivo roda no navegador (prévia do admin) e no Node (tools/render/gerar.mjs, no GitHub Actions).
//
//   import { renderizar, desenharPlanta, validar } from "./renderizar.mjs";
//   const html = renderizar(dados, { edicao: false });
//
// Carregamento: o módulo usa await no topo. No Node lê modelo.njk e ../conteudo/edicao.schema.json do disco
// (node:fs); no navegador busca os dois por fetch, relativos a este arquivo. Quem importa espera o import e
// depois chama renderizar() de forma síncrona.
// Nunjucks: no navegador usa window.nunjucks; se não houver, injeta o <script> do jsDelivr (versão e SRI abaixo).
// No Node usa globalThis.nunjucks ou o pacote instalado em tools/render (npm ci).
//
// Opções de renderizar(dados, opcoes):
//   edicao      false: HTML limpo. true: marcadores para o editor (data-campo, data-campo-img, data-lista, data-item,
//               data-painel, data-planta). Os marcadores são só atributos: não mudam layout nem estilo.
//   midiaBase   onde ficam os arquivos "midia:": "assets/midia/" (padrão, o build baixa para lá) ou a URL pública do
//               bucket (MIDIA_URL) na prévia do navegador.
//   aoUsarMidia função chamada com cada arquivo do bucket que o HTML usa ("slug/nome-800.webp"); o build baixa esses.
//   validar     true (padrão): valida antes de renderizar e lança ErroDados com a lista de problemas.

export const VERSAO_ARQUIVOS = "261029b"; // cache dos links CSS/JS (?v=): o orquestrador troca aqui no fim da rodada
export const MIDIA_URL = "https://xfylbdxeciujemyavbaq.supabase.co/storage/v1/object/public/midia/";
export const NUNJUCKS_URL = "https://cdn.jsdelivr.net/npm/nunjucks@3.2.4/browser/nunjucks.min.js";
export const NUNJUCKS_SRI = "sha384-ZNWDztJihcuTdvvOj/69bJWcalk3vWhHhurVe78xxAbMM8A8rmHY5+eTDWIjWC7Q";
// larguras (px) das variantes webp que o admin gera no upload; a imagem de compartilhar (textos.seo.imagem) é jpg 1200
export const LARGURAS_MIDIA = [800, 1280, 1400, 1600];

const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"]; // getUTCDay()
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro",
  "novembro", "dezembro"];
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export class ErroDados extends Error {
  constructor(msg, erros = []) { super(msg); this.name = "ErroDados"; this.erros = erros; }
}

// ------------------------------------------------------------------ carregamento (Node: disco; navegador: fetch)
const NO_NODE = typeof window === "undefined" && typeof process !== "undefined" && !!(process.versions && process.versions.node);

async function lerTexto(rel) {
  const url = new URL(rel, import.meta.url);
  if (NO_NODE) {
    const fs = await import("node:fs/promises");
    return fs.readFile(url, "utf8");
  }
  const r = await fetch(url, { cache: "no-cache" });
  if (!r.ok) throw new Error(`não consegui carregar ${url} (${r.status})`);
  return r.text();
}

async function carregarNunjucks() {
  if (globalThis.nunjucks) return globalThis.nunjucks;
  if (NO_NODE) {
    const { createRequire } = await import("node:module");
    const req = createRequire(new URL("../../../tools/render/package.json", import.meta.url));
    return req("nunjucks");
  }
  await new Promise((ok, falha) => {
    const s = document.createElement("script");
    s.src = NUNJUCKS_URL;
    s.integrity = NUNJUCKS_SRI;
    s.crossOrigin = "anonymous";
    s.onload = ok;
    s.onerror = () => falha(new Error("não consegui carregar o Nunjucks de " + NUNJUCKS_URL));
    document.head.appendChild(s);
  });
  return globalThis.nunjucks;
}

const [NJ, MODELO_FONTE, SCHEMA] = await Promise.all([
  carregarNunjucks(),
  lerTexto("./modelo.njk"),
  lerTexto("../conteudo/edicao.schema.json").then(JSON.parse),
]);
const AMBIENTE = new NJ.Environment(null, { autoescape: false, throwOnUndefined: true });
const MODELO = NJ.compile(MODELO_FONTE, AMBIENTE, "modelo.njk", true);
export const SCHEMA_EDICAO = SCHEMA;

// ------------------------------------------------------------------ validação (subconjunto do JSON Schema 2020-12)
function tipoDe(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v; // string, boolean, object
}
const TIPOS = {
  object: (v) => tipoDe(v) === "object",
  array: Array.isArray,
  string: (v) => typeof v === "string",
  integer: (v) => tipoDe(v) === "integer",
  number: (v) => typeof v === "number" && Number.isFinite(v),
  boolean: (v) => typeof v === "boolean",
};
function estavel(v) {
  if (Array.isArray(v)) return "[" + v.map(estavel).join(",") + "]";
  if (v && typeof v === "object") return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + estavel(v[k])).join(",") + "}";
  return JSON.stringify(v);
}
function resolveRef(s, raiz) {
  while (s && s.$ref) {
    if (!s.$ref.startsWith("#/")) throw new Error("$ref não suportado: " + s.$ref);
    const resto = Object.fromEntries(Object.entries(s).filter(([k]) => k !== "$ref"));
    const alvo = s.$ref.slice(2).split("/").reduce((o, k) => o[k], raiz);
    s = { ...alvo, ...resto };
  }
  return s;
}
function valida(v, s, caminho, erros, raiz) {
  s = resolveRef(s, raiz);
  const onde = caminho || "(raiz)";
  const t = s.type;
  if (t && !TIPOS[t](v)) { erros.push(`${onde}: esperava ${t}, veio ${tipoDe(v)}`); return; }
  if ("const" in s && estavel(v) !== estavel(s.const)) erros.push(`${onde}: deve ser ${JSON.stringify(s.const)}`);
  if (s.enum && !s.enum.some((x) => estavel(x) === estavel(v))) erros.push(`${onde}: ${JSON.stringify(v)} não está em ${JSON.stringify(s.enum)}`);
  if (typeof v === "string") {
    if (v.length < (s.minLength || 0)) erros.push(`${onde}: não pode ficar vazio`);
    if (s.pattern && !new RegExp(s.pattern, "u").test(v)) erros.push(`${onde}: ${JSON.stringify(v)} fora do formato ${s.pattern}`);
  }
  if (typeof v === "number") {
    if ("minimum" in s && v < s.minimum) erros.push(`${onde}: menor que ${s.minimum}`);
    if ("maximum" in s && v > s.maximum) erros.push(`${onde}: maior que ${s.maximum}`);
    if ("multipleOf" in s && v % s.multipleOf) erros.push(`${onde}: tem que ser múltiplo de ${s.multipleOf}`);
  }
  if (tipoDe(v) === "object") {
    const props = s.properties || {};
    for (const k of s.required || []) if (!(k in v)) erros.push(`${onde}: falta o campo ${JSON.stringify(k)}`);
    for (const [k, x] of Object.entries(v)) {
      if (k in props) valida(x, props[k], caminho ? `${caminho}.${k}` : k, erros, raiz);
      else if (s.additionalProperties === false) erros.push(`${onde}: campo desconhecido ${JSON.stringify(k)}`);
      else if (s.additionalProperties && typeof s.additionalProperties === "object")
        valida(x, s.additionalProperties, caminho ? `${caminho}.${k}` : k, erros, raiz);
    }
  }
  if (Array.isArray(v)) {
    if (v.length < (s.minItems || 0)) erros.push(`${onde}: precisa de pelo menos ${s.minItems} item(ns)`);
    if ("maxItems" in s && v.length > s.maxItems) erros.push(`${onde}: no máximo ${s.maxItems} item(ns)`);
    if (s.uniqueItems && new Set(v.map(estavel)).size !== v.length) erros.push(`${onde}: itens repetidos`);
    v.forEach((x, i) => valida(x, s.items || {}, `${onde}[${i}]`, erros, raiz));
  }
}

function dataIso(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}
function horaValida(s) {
  const m = /^(\d{2}):(\d{2})$/.exec(s);
  return !!m && +m[1] < 24 && +m[2] < 60;
}

/** O que o schema não diz: datas reais e em ordem, códigos únicos e coerentes, planta sem salas sobrepostas. */
function validaRegras(d, erros) {
  const datas = [];
  d.datas.dias.forEach((dia, i) => {
    const x = dataIso(dia.data);
    if (!x) erros.push(`datas.dias[${i}].data: ${JSON.stringify(dia.data)} não é uma data válida`);
    else datas.push(x);
    if (!horaValida(dia.chegada)) erros.push(`datas.dias[${i}].chegada: ${JSON.stringify(dia.chegada)} não é uma hora válida`);
  });
  if (datas.length === 2 && datas[1] <= datas[0]) erros.push("datas.dias: o Dia 2 tem que vir depois do Dia 1");
  d.datas.aeroportos.forEach((a, i) => {
    if (a.minutos.length !== d.datas.dias.length) erros.push(`datas.aeroportos[${i}].minutos: um número por dia`);
  });
  const ids = d.ingressos.lista.map((g) => g.id);
  if (new Set(ids).size !== ids.length) erros.push("ingressos.lista: códigos repetidos");
  d.ingressos.lista.forEach((g, i) => {
    if (g.subir.texto && !ids.includes(g.subir.para)) erros.push(`ingressos.lista[${i}].subir.para: ${JSON.stringify(g.subir.para)} não é código de ingresso`);
  });
  if (d.ingressos.planta) validaPlanta(d.ingressos.planta, ids, erros);
  const pid = [d.palestrantes.principal.id, ...d.palestrantes.outros.map((p) => p.id)];
  if (new Set(pid).size !== pid.length) erros.push("palestrantes: códigos repetidos");
}

/** Lista de problemas da edição ([] = ok). */
export function validar(dados) {
  const erros = [];
  valida(dados, SCHEMA, "", erros, SCHEMA);
  if (!erros.length) validaRegras(dados, erros);
  return erros;
}

// ------------------------------------------------------------------ datas
const diaMes = (d) => (d.getUTCDate() === 1 ? "1º" : String(d.getUTCDate())) + " de " + MESES[d.getUTCMonth()];
const isoDe = (d) => d.toISOString().slice(0, 10);

function faixaLonga(a, b, comAno = true) {
  let s;
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) {
    s = `${a.getUTCDate()} e ${b.getUTCDate()} de ${MESES[a.getUTCMonth()]}`;
  } else {
    s = diaMes(a) + (a.getUTCFullYear() !== b.getUTCFullYear() && comAno ? ` de ${a.getUTCFullYear()}` : "") + ` e ${diaMes(b)}`;
  }
  return s + (comAno ? ` de ${b.getUTCFullYear()}` : "");
}

/** [primeira parte, segunda parte] de "24–25 nov 2026"; meses ou anos diferentes repetem o que muda. */
function faixaCurta(a, b) {
  const fim = `${b.getUTCDate()} ${MESES_CURTOS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
  let ini;
  if (a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth()) ini = String(a.getUTCDate());
  else if (a.getUTCFullYear() === b.getUTCFullYear()) ini = `${a.getUTCDate()} ${MESES_CURTOS[a.getUTCMonth()]}`;
  else ini = `${a.getUTCDate()} ${MESES_CURTOS[a.getUTCMonth()]} ${a.getUTCFullYear()}`;
  return [ini, fim];
}

const horaBr = (hhmm) => hhmm.replace(":", "h");
function minutosBr(m) {
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h}h${String(r).padStart(2, "0")}` : `${h}h`;
}
const milhar = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");

// ------------------------------------------------------------------ texto
export const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MARCAS = /\{(datas|datas_sem_ano|datas_curtas|ano|dia\d|convidados)\}/g;

function trocaMarcas(v, marcas) {
  if (typeof v === "string") {
    return v.replace(MARCAS, (todo, k) => {
      if (!(k in marcas)) throw new ErroDados(`marcador ${todo} não existe nesta edição`);
      return marcas[k];
    });
  }
  if (Array.isArray(v)) return v.map((x) => trocaMarcas(x, marcas));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trocaMarcas(x, marcas)]));
  return v;
}
function escapa(v) {
  if (typeof v === "string") return esc(v);
  if (Array.isArray(v)) return v.map(escapa);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, escapa(x)]));
  return v;
}
const enfase = (s) => String(s).replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
const semEnfase = (s) => String(s).replace(/\*([^*\n]+)\*/g, "$1");
const linhas = (s) => String(s).split("\n").filter((x) => x.trim());

// urllib.parse.quote(s, safe=...) do Python: além do encodeURIComponent, codifica ! ' ( ) *
function quote(s, safe = "") {
  let r = encodeURIComponent(s).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
  for (const c of safe) r = r.split(encodeURIComponent(c)).join(c);
  return r;
}
const quotePlus = (s, safe = "") => quote(s, safe + " ").replace(/ /g, "+");

// ------------------------------------------------------------------ imagens e vídeos
// Imagem no JSON v2: { "src": "assets/…" | "midia:<slug>/<nome>", "w": 1600, "h": 1000, "larguras": [800, 1600],
//                      "foco": [50, 30] (opcional, % x/y do ponto que fica visível quando a foto é recortada) }
//   local: w/h são do arquivo src; larguras = variantes <base>-<N>.webp que existem ao lado (pode ser []).
//   midia: w/h são da maior variante; cada largura L é o arquivo midia/<slug>/<nome>-<L>.webp do bucket.
function criaMidia(opcoes) {
  const base = opcoes.midiaBase ?? "assets/midia/";
  const usar = opcoes.aoUsarMidia || (() => {});
  const arquivo = (rel) => { usar(rel); return base + rel; };

  function escolhe(disp, alvo) {
    if (!disp.length || disp.includes(alvo)) return alvo;
    const menores = disp.filter((x) => x <= alvo);
    return menores.length ? Math.max(...menores) : Math.min(...disp);
  }

  function imagem(v, larguras = [1600], srcW = null, formato = "webp") {
    if (!v || typeof v !== "object" || typeof v.src !== "string") throw new ErroDados(`imagem sem dimensões: ${JSON.stringify(v)} (rode tools/render/migrar_v1.mjs)`);
    const W = v.w, H = v.h, disp = v.larguras || [];
    if (v.src.startsWith("midia:")) {
      const nome = v.src.slice(6);
      const ext = formato === "jpg" ? "jpg" : "webp";
      const itens = larguras.map((L) => {
        const wr = formato === "jpg" ? Math.min(L, W) : escolhe(disp, Math.min(L, W));
        return [L, `${nome}-${wr}.${ext}`, wr, Math.round((H * wr) / W)];
      });
      const vistos = new Set(), unicos = [];
      for (const it of itens) if (!vistos.has(it[1])) { vistos.add(it[1]); unicos.push(it); }
      const maior = unicos[unicos.length - 1];
      const srcRel = (itens.find((it) => it[0] === srcW) || maior)[1];
      const srcset = larguras.length > 1 ? unicos.map(([, p, wr]) => `${arquivo(p)} ${wr}w`).join(", ") : "";
      return { src: arquivo(srcRel), srcset, w: maior[2], h: maior[3] };
    }
    const m = /^(.*)-(\d+)\.webp$/.exec(v.src);
    if (m && larguras.length > 1) {
      const existe = larguras.filter((L) => disp.includes(L)).map((L) => [L, `${m[1]}-${L}.webp`]);
      if (!existe.length) throw new ErroDados(`imagem sem as larguras ${larguras.join("/")}: ${v.src}`);
      const src = (existe.find(([L]) => L === srcW) || existe[existe.length - 1])[1];
      const ult = existe[existe.length - 1][0], proprio = +m[2];
      const [w, h] = ult === proprio ? [W, H] : [ult, Math.round((H * ult) / W)];
      const srcset = existe.length > 1 ? existe.map(([L, p]) => `${p} ${L}w`).join(", ") : "";
      return { src, srcset, w, h };
    }
    return { src: v.src, srcset: "", w: W, h: H };
  }

  function video(valor) {
    if (typeof valor !== "string") throw new ErroDados(`vídeo inválido: ${JSON.stringify(valor)}`);
    return valor.startsWith("midia:") ? arquivo(valor.slice(6)) : valor;
  }

  return { imagem, video };
}

/** style="object-position" para o ponto de foco escolhido no admin ("" quando não há foco). */
function focoCss(v) {
  return v && Array.isArray(v.foco) ? `object-position: ${v.foco[0]}% ${v.foco[1]}%` : "";
}

// ------------------------------------------------------------------ JSON-LD (mesmo desenho do bloco aprovado)
function jsonld(obj) {
  let texto = JSON.stringify(obj, null, 2);
  texto = texto.replace(/"geo": \{\s*"@type": "GeoCoordinates",\s*"latitude": ([-\d.]+),\s*"longitude": ([-\d.]+)\s*\}/g,
    '"geo": { "@type": "GeoCoordinates", "latitude": $1, "longitude": $2 }');
  texto = texto.replace(/"image": \[\s*("[^"]+")\s*\]/g, '"image": [$1]');
  return texto.replace(/<\//g, "<\\/").split("\n").map((x) => "  " + x).join("\n");
}

// ------------------------------------------------------------------ contexto do modelo
function contexto(dados, opcoes) {
  const midia = criaMidia(opcoes);
  const diasIso = dados.datas.dias.map((x) => dataIso(x.data));
  const a = diasIso[0], b = diasIso[diasIso.length - 1];
  const [ini, fim] = faixaCurta(a, b);
  const marcas = {
    datas: faixaLonga(a, b),
    datas_sem_ano: faixaLonga(a, b, false),
    datas_curtas: `${ini}–${fim}`,
    ano: String(a.getUTCFullYear()),
    convidados: String(dados.palestrantes.convidados.quantidade),
  };
  diasIso.forEach((d, i) => { marcas[`dia${i + 1}`] = `${SEMANA[d.getUTCDay()]}, ${diaMes(d)}`; });
  const cru = trocaMarcas(dados, marcas); // texto puro (JSON-LD, URLs, JS)
  const e = escapa(cru); //                 texto pronto para o HTML

  const dias = diasIso.map((d, i) => {
    const diaC = cru.datas.dias[i], diaE = e.datas.dias[i], art = diaC.artigo;
    const sem = SEMANA[d.getUTCDay()];
    return {
      ...diaE, n: i + 1, iso: isoDe(d), num: String(i + 1).padStart(2, "0"),
      semana_dia: `${sem[0].toUpperCase()}${sem.slice(1)}, ${diaMes(d)}`,
      mapa_quando: `${sem}, ${d.getUTCDate()} ${MESES_CURTOS[d.getUTCMonth()]} · ${horaBr(diaC.chegada)}`,
      chegada_hora: horaBr(diaC.chegada),
      letra: String.fromCharCode(65 + i),
      de: esc({ a: "da", o: "do" }[art] + " " + diaC.local),
      para: esc({ a: "à", o: "ao" }[art] + " " + diaC.local),
      com_artigo: esc(art + " " + diaC.local),
      rota_google: esc("https://www.google.com/maps/dir/?api=1&destination=" + quote(diaC.busca_mapa) + "&travelmode=driving"),
      rota_waze: esc("https://waze.com/ul?ll=" + quote(`${diaC.latitude},${diaC.longitude}`) + "&navigate=yes"),
      busca_iframe: quotePlus(diaC.busca_mapa, ","),
    };
  });
  const d1 = dias[0], d2 = dias[dias.length - 1];
  const mapaIframe = esc(`https://maps.google.com/maps?saddr=${d1.busca_iframe}&daddr=${d2.busca_iframe}&z=10&output=embed&hl=pt-BR`);

  const c = e.datas.dias.map((x) => x.cidade), ufs = e.datas.dias.map((x) => x.uf);
  const cU = c[c.length - 1], ufU = ufs[ufs.length - 1];
  let cidades, trajeto;
  if (c[0] === cU && ufs[0] === ufU) [cidades, trajeto] = [`${c[0]}, ${ufs[0]}`, c[0]];
  else if (ufs[0] === ufU) [cidades, trajeto] = [`${c[0]} e ${cU}, ${ufs[0]}`, `${c[0]} → ${cU}`];
  else [cidades, trajeto] = [`${c[0]}, ${ufs[0]} e ${cU}, ${ufU}`, `${c[0]} → ${cU}`];

  const quandoHtml = `<time datetime="${isoDe(a)}">${ini}</time>–<time datetime="${isoDe(b)}">${fim}</time>`;

  const t = cru.textos;
  const seoImagem = t.seo.imagem.src.startsWith("midia:") ? midia.imagem(t.seo.imagem, [1200], null, "jpg").src : t.seo.imagem.src;
  const ld = jsonld({
    "@context": "https://schema.org", "@type": "Event", name: "Clube de Negócios Hotéis & Resorts",
    description: t.hero.titulo, startDate: isoDe(a), endDate: isoDe(b),
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode", inLanguage: "pt-BR",
    url: "https://DOMINIO-A-DEFINIR/", image: ["https://DOMINIO-A-DEFINIR/" + seoImagem],
    location: cru.datas.dias.map((x) => ({
      "@type": "Place", name: x.local,
      address: { "@type": "PostalAddress", streetAddress: x.endereco, addressLocality: x.localidade, addressRegion: x.uf, addressCountry: "BR" },
      geo: { "@type": "GeoCoordinates", latitude: x.latitude, longitude: x.longitude },
    })),
  });

  const dadosJs = JSON.stringify({
    abertura: `${ini} · ${fim}`,
    cena: { nome: t.hero.cena_nome, fato: t.hero.cena_fato },
    ingressos: cru.ingressos.lista.map((g) => ({ id: g.id, nome: g.nome })),
    anos: cru.palestrantes.principal.anos,
  }).replace(/<\//g, "<\\/");

  // marcadores do editor: funções que devolvem "" fora do modo edição
  const ed = !!opcoes.edicao;
  const at = (nome) => (valor) => (ed ? ` ${nome}="${esc(valor)}"` : "");

  return {
    d: e, cru, dias, quando_html: quandoHtml, marcas, cidades, trajeto, mapa_iframe: mapaIframe,
    jsonld: ld, dados_js: dadosJs, v: VERSAO_ARQUIVOS, seo_imagem: seoImagem, ano: a.getUTCFullYear(),
    img: midia.imagem, video: midia.video, foco: focoCss, minutos_br: minutosBr, milhar,
    edicao: ed,
    campo: at("data-campo"), campo_img: at("data-campo-img"), lista: at("data-lista"), item: at("data-item"),
    painel: at("data-config"),
    // trecho de texto dentro de um elemento com mais coisas: só no modo edição ganha um invólucro sem estilo
    frag: (caminho, html) => (ed ? `<x-campo data-campo="${esc(caminho)}">${html}</x-campo>` : String(html)),
    estilo: (css) => (css ? ` style="${css}"` : ""),
    ...plantaContexto(cru, opcoes),
  };
}

// ------------------------------------------------------------------ planta v2: grade -> SVG
// Desenho do computador ("larga"): a grade colunas x linhas. Celular ("alta"): arranjo automático em 2 colunas (layoutAlta);
// o texto continua horizontal e quebra pela largura da sala. Zonas são faixas empilhadas no pé da sala-mãe.
// Classes e atributos são os que secoes.js e secoes.css usam: g.sala (+ sala--zona / sala--online / sala--fora),
// um atributo data-<código> por ingresso que abre, rect primeiro, text e text.sala__sub.

// larguras dos caracteres da Proza Libre (em 1/100 de em), medidas no Chrome com as fontes do site
const FONTE = {
  letras: " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~ ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ·–—‘’“”…•→€ªº",
  400: "22,32,50,87,66,98,74,29,38,38,52,63,30,48,30,44,71,46,60,58,63,54,64,52,65,64,34,34,57,67,57,47,110,71,63,70,80,60,57,77,79,31,31,71,54,98,82,86,62,85,65,61,63,76,71,106,70,66,64,44,44,44,54,53,40,56,63,51,63,57,42,60,61,27,26,57,26,94,61,63,63,63,43,48,47,60,54,85,54,54,52,49,31,49,66,22,32,59,65,72,76,31,66,51,95,54,57,71,0,95,46,55,68,41,39,40,58,67,30,36,33,59,57,98,100,102,47,69,69,69,69,69,69,94,70,59,59,59,59,31,31,31,31,81,80,86,86,86,86,86,58,86,77,77,77,77,62,62,60,56,56,56,56,56,56,88,51,57,57,57,57,27,27,27,27,63,61,63,63,63,63,63,63,63,60,60,60,60,54,63,54,30,51,103,29,29,50,50,83,37,100,82,54,59",
  500: "21,33,54,87,66,102,75,31,40,40,54,63,32,48,32,45,72,47,60,58,64,54,65,53,65,65,35,36,57,68,57,49,112,71,66,70,81,60,58,77,80,32,32,74,55,100,83,86,64,85,67,60,65,76,71,106,71,67,65,45,45,45,56,53,42,57,64,51,64,58,43,61,63,28,28,59,28,95,63,64,64,64,45,49,48,62,55,86,56,55,52,49,32,49,68,22,33,60,67,74,77,32,67,54,96,56,58,71,0,96,47,55,68,42,40,42,58,69,31,37,33,61,58,100,102,104,47,69,69,69,69,69,69,94,70,60,60,60,60,32,32,32,32,81,81,86,86,86,86,86,58,86,76,76,76,76,64,64,63,57,57,57,57,57,57,88,51,58,58,58,58,28,28,28,28,64,63,64,64,64,64,64,63,63,62,62,62,62,55,64,55,31,51,103,31,31,54,54,88,40,100,81,56,61",
  600: "21,35,58,87,67,106,76,33,41,42,55,64,34,48,34,46,72,47,61,58,65,54,65,54,66,65,37,37,57,68,57,51,114,71,68,70,81,61,59,77,81,34,34,76,56,102,83,86,66,85,69,60,66,75,71,107,72,68,65,46,46,46,57,52,44,59,65,51,65,59,45,61,65,30,30,61,30,97,65,64,65,65,47,50,49,63,56,88,57,56,53,50,33,50,70,22,35,60,68,76,79,33,69,57,97,58,59,70,0,97,48,55,68,44,41,44,58,72,32,39,34,62,59,102,104,106,48,70,70,70,70,70,70,95,70,61,61,61,61,34,34,34,34,81,83,86,86,86,86,86,59,86,76,76,76,76,66,67,65,59,59,59,59,59,59,89,51,59,59,59,59,30,30,30,30,65,65,64,64,64,64,64,64,64,63,63,63,63,56,65,56,32,51,103,33,33,58,58,92,42,100,80,58,62",
};
const LARG = {};
for (const p of [400, 500, 600]) {
  const ws = FONTE[p].split(",").map(Number);
  LARG[p] = new Map([...FONTE.letras].map((c, i) => [c, ws[i]]));
}
/** largura em px de um texto na Proza Libre (peso 400/500/600, tamanho em px) */
export function larguraTexto(s, peso = 500, tamanho = 14) {
  const m = LARG[peso] || LARG[500];
  let t = 0;
  for (const c of s) t += m.get(c) ?? 60;
  return (t * tamanho) / 100;
}
/** quebra s em linhas que cabem em largura px ("\n" força quebra; palavra maior que a largura fica inteira) */
export function quebraTexto(s, largura, peso = 500, tamanho = 14) {
  const out = [];
  for (const parte of String(s).split("\n")) {
    const palavras = parte.split(/\s+/).filter(Boolean);
    let linha = "";
    for (const p of palavras) {
      const tenta = linha ? linha + " " + p : p;
      if (linha && larguraTexto(tenta, peso, tamanho) > largura) { out.push(linha); linha = p; }
      else linha = tenta;
    }
    if (linha) out.push(linha);
  }
  return out;
}

// medidas de cada forma (px do viewBox). larga: cel = tamanho de uma célula da grade; vao = espaço entre salas.
// alta: arranjo automático em 2 colunas (layoutAlta), com vãos, altura mínima e folgas de pé.
// texto: x/y = onde começa; nn/ns/ss = distância entre linhas (nome->nome, nome->sub, sub->sub); dir/dirSub = folga
// à direita para o nome e para o subtítulo quebrarem; nsVarias = nome->sub quando o nome tem 2+ linhas; yToda = y da
// sala de largura toda (com zonas) no celular
export const GEOMETRIA_PLANTA = {
  larga: { celW: 47, celH: 49, vao: 10, margem: 20, sufixo: "l", texto: { x: 18, y: 30, yToda: 30, nn: 20, ns: 20, nsVarias: 20, ss: 18, dir: 10, dirSub: 10 },
    zona: { lado: 20, pe: 26, vao: 12, alt: 46, linha: 18, base: 29, x: 18 } },
  alta: { largura: 340, margem: 1, vaoX: 12, vaoY: 10, vaoGrupo: 24, minimo: 80, topoZonas: 14,
    pe: { sala: 36, outra: 12 }, sufixo: "a", texto: { x: 17, y: 26, yToda: 27, nn: 18, ns: 18, nsVarias: 22, ss: 18, dir: 30, dirSub: 8 },
    zona: { lado: 17, pe: 21, vao: 8, alt: 36, linha: 18, base: 23, x: 16 } },
};
const r1 = (n) => Math.round(n * 10) / 10;

const temCadeado = (s, ids) => {
  const donos = ids.filter((x) => s.abre.includes(x));
  return s.tipo === "sala" && donos.length > 0 && donos.length < ids.length;
};

/**
 * Arranjo do celular: ordem de leitura do computador (y, depois x); primeiro as salas do tipo "sala", depois
 * "externa"/"online" (separadas por um vão maior). Sala com zonas ocupa a largura toda; as outras vão em pares de
 * meia largura (sobrando uma, ela fica com meia largura). Altura = o que o texto quebrado e as zonas pedem (mínimo
 * G.minimo); num par as duas ficam com a altura da maior. Devolve { rets: Map(id -> {x,y,w,h}), tam }.
 */
export function layoutAlta(planta, ingressos = []) {
  const G = GEOMETRIA_PLANTA.alta, T = G.texto;
  const ids = ingressos.map((x) => x.id);
  const W = G.largura - 2 * G.margem, meia = (W - G.vaoX) / 2;
  const altura = (s, w) => {
    const { ultima } = linhasDeTexto(s.nome, s.detalhe, 0, 0, w - T.x - T.dir, w - T.x - T.dirSub, T);
    const base = (s.zonas.length ? T.yToda : T.y) + ultima;
    if (!s.zonas.length) return Math.max(G.minimo, base + (s.tipo === "sala" ? G.pe.sala : G.pe.outra));
    const fx = faixasZonas(s, { x: 0, y: 0, w, h: 0 }, G, false);
    const zonas = fx.reduce((a, f) => a + f.h, 0) + G.zona.vao * (fx.length - 1);
    return Math.max(G.minimo, base + G.topoZonas + zonas + G.zona.pe + (temCadeado(s, ids) ? 12 : 0));
  };
  const ordem = [...planta.salas].sort((a, b) => a.y - b.y || a.x - b.x);
  const rets = new Map();
  let y = G.margem, primeiro = true;
  for (const grupo of [ordem.filter((s) => s.tipo === "sala"), ordem.filter((s) => s.tipo !== "sala")]) {
    if (!grupo.length) continue;
    if (!primeiro) y += G.vaoGrupo - G.vaoY;
    primeiro = false;
    const linhasArr = [];
    let pendente = null;
    for (const s of grupo) {
      if (s.zonas.length) { if (pendente) linhasArr.push([pendente]); pendente = null; linhasArr.push([s, "toda"]); }
      else if (pendente) { linhasArr.push([pendente, s]); pendente = null; }
      else pendente = s;
    }
    if (pendente) linhasArr.push([pendente]);
    for (const l of linhasArr) {
      if (l[1] === "toda") {
        const h = altura(l[0], W);
        rets.set(l[0].id, { x: G.margem, y: r1(y), w: W, h: r1(h) });
        y += h + G.vaoY;
        continue;
      }
      const h = Math.max(...l.map((s) => altura(s, meia)));
      l.forEach((s, i) => rets.set(s.id, { x: r1(G.margem + i * (meia + G.vaoX)), y: r1(y), w: r1(meia), h: r1(h) }));
      y += h + G.vaoY;
    }
  }
  const fimY = y - G.vaoY;
  return { rets, tam: { largura: G.largura, altura: Math.round(fimY + 25), fimY: r1(fimY), margem: G.margem } };
}

/** retângulo (px do viewBox) de uma sala na forma pedida; o editor da planta usa para casar a grade com o desenho.
 *  Na "alta" o arranjo depende da planta inteira: passe planta (e ingressos, para a folga do cadeado). */
export function retanguloSala(sala, forma = "larga", planta = null, ingressos = []) {
  if (forma === "alta") {
    if (!planta) throw new Error("retanguloSala(sala, 'alta', planta): a planta do celular depende de todas as salas");
    return layoutAlta(planta, ingressos).rets.get(sala.id);
  }
  const G = GEOMETRIA_PLANTA[forma];
  return { x: r1(G.margem + sala.x * G.celW), y: r1(G.margem + sala.y * G.celH), w: r1(sala.w * G.celW - G.vao), h: r1(sala.h * G.celH - G.vao) };
}

/** tamanho do viewBox de uma planta na forma pedida */
export function tamanhoPlanta(planta, forma = "larga", ingressos = []) {
  if (forma === "alta") return layoutAlta(planta, ingressos).tam;
  const G = GEOMETRIA_PLANTA[forma];
  const fimX = G.margem + planta.colunas * G.celW - G.vao, fimY = G.margem + planta.linhas * G.celH - G.vao;
  return { largura: Math.round(fimX + G.margem), altura: Math.round(fimY + 25), fimY: r1(fimY), margem: G.margem };
}

/** faixas das zonas dentro do retângulo da sala-mãe (de cima para baixo, encostadas no pé da sala) */
function faixasZonas(sala, ret, G, comCadeado) {
  const Z = G.zona;
  const largura = ret.w - 2 * Z.lado;
  const faixas = sala.zonas.map((z) => {
    const linhas = quebraTexto(z.nome, largura - Z.x - G.texto.dir, 600, 14);
    return { z, linhas, h: Z.alt + Z.linha * Math.max(0, linhas.length - 1) };
  });
  // com cadeado o pé precisa de mais espaço (o cadeado fica no canto de baixo à esquerda)
  let y = ret.y + ret.h - Z.pe - (comCadeado ? 12 : 0);
  for (let i = faixas.length - 1; i >= 0; i--) {
    y -= faixas[i].h;
    faixas[i].ret = { x: r1(ret.x + Z.lado), y: r1(y), w: r1(largura), h: r1(faixas[i].h) };
    y -= Z.vao;
  }
  return faixas;
}

/** linhas de nome e subtítulo de uma sala; ultima = distância da primeira à última linha de base */
function linhasDeTexto(nome, detalhe, x, y, largNome, largSub, T) {
  const ns = quebraTexto(nome, largNome, 500, 14).map((t) => [t, false]);
  const ds = quebraTexto(detalhe || "", largSub, 400, 12).map((t) => [t, true]);
  let yy = y, ant = null, html = "";
  for (const [t, sub] of [...ns, ...ds]) {
    if (ant !== null) yy += ant && sub ? T.ss : !ant && sub ? (ns.length > 1 ? T.nsVarias : T.ns) : T.nn;
    html += `<text${sub ? ' class="sala__sub"' : ""} x="${r1(x)}" y="${r1(yy)}">${esc(t)}</text>`;
    ant = sub;
  }
  return { html, ultima: yy - y };
}

// as peças que secoes.js acrescenta no site (luz, porta, cadeado), para prévias estáticas sem o JS do site
function pecas(ret, tipo, donos, total) {
  const luz = `<rect class="sala__luz" x="${ret.x}" y="${ret.y}" width="${ret.w}" height="${ret.h}"/>`;
  if (tipo !== "sala") return { luz, resto: "" };
  const L = r1(Math.min(22, ret.w * 0.2)), px = r1(ret.x + ret.w - 22 - L), yb = r1(ret.y + ret.h);
  let resto = `<path class="porta__vao" d="M${px} ${yb} H${r1(px + L)}"/><path class="porta__folha" d="M${px} ${yb} V${r1(yb - L)}"/>` +
    `<path class="porta__arco" d="M${px} ${r1(yb - L)} A${L} ${L} 0 0 1 ${r1(px + L)} ${yb}"/>`;
  if (donos.length && donos.length < total) {
    resto += `<g class="sala__cadeado" transform="translate(${r1(ret.x + 16)} ${r1(yb - 30)})"><path d="M2.5 7 V4.5 a3.5 3.5 0 0 1 7 0 V7"/>` +
      `<rect x="0.5" y="7" width="11" height="8.5" rx="1.5"/><text x="17" y="14">${esc(donos[0].nome.toUpperCase())}</text></g>`;
  }
  return { luz, resto };
}

/**
 * SVG (string) da planta. planta = ingressos.planta (v2); ingressos = ingressos.lista ([{id, nome}, …], na ordem).
 * forma: "larga" (computador, a grade) | "alta" (celular, arranjo automático em 2 colunas: layoutAlta).
 * opcoes: recuo (texto antes de cada sala, só para o HTML ficar legível), marcar (data-sala="<id>" em cada g),
 *         ver (código de ingresso: já desenha luz/porta/cadeado e as classes aberta/trancada, como o site faz com JS;
 *         para prévias fora da página, com secoes.css carregado e o SVG dentro de um elemento .acessos).
 */
export function desenharPlanta(planta, ingressos = [], forma = "larga", opcoes = {}) {
  const G = GEOMETRIA_PLANTA[forma];
  if (!G) throw new Error(`forma de planta desconhecida: ${forma}`);
  const recuo = opcoes.recuo ?? "";
  const quebra = recuo ? "\n" + recuo + "  " : "";
  const lay = forma === "alta" ? layoutAlta(planta, ingressos) : null;
  const tam = lay ? lay.tam : tamanhoPlanta(planta, forma);
  const ids = ingressos.map((x) => x.id);
  const estatico = opcoes.ver !== undefined && opcoes.ver !== null && opcoes.ver !== false;
  const grupo = (classe, id, abre, ret, conteudo, tipo) => {
    const attrs = abre.filter((x) => /^[a-z][a-z0-9-]*$/.test(x)).map((x) => ` data-${x}`).join("");
    const marca = opcoes.marcar ? ` data-sala="${esc(id)}"` : "";
    let cls = classe, luz = "", resto = "";
    if (estatico) {
      if (abre.includes(opcoes.ver)) cls += " aberta";
      else if (tipo !== "zona") cls += " trancada";
      ({ luz, resto } = pecas(ret, tipo, ingressos.filter((x) => abre.includes(x.id)), ingressos.length));
    }
    return `${quebra}<g class="${cls}"${attrs}${marca}>${luz}<rect x="${ret.x}" y="${ret.y}" width="${ret.w}" height="${ret.h}"/>${conteudo}${resto}</g>`;
  };
  let corpo = "";
  for (const s of planta.salas) {
    const ret = lay ? lay.rets.get(s.id) : retanguloSala(s, forma);
    const T = G.texto;
    const classe = s.tipo === "online" ? "sala sala--online" : s.tipo === "externa" ? "sala sala--fora" : "sala";
    const txt = linhasDeTexto(s.nome, s.detalhe, ret.x + T.x, ret.y + (lay && s.zonas.length ? T.yToda : T.y), ret.w - T.x - T.dir, ret.w - T.x - T.dirSub, T);
    corpo += grupo(classe, s.id, s.abre, ret, txt.html, s.tipo);
    for (const f of faixasZonas(s, ret, G, temCadeado(s, ids))) {
      const Z = G.zona;
      let txt = "", y = f.ret.y + Z.base;
      for (const t of f.linhas) { txt += `<text x="${r1(f.ret.x + Z.x)}" y="${r1(y)}">${esc(t)}</text>`; y += Z.linha; }
      corpo += grupo("sala sala--zona", f.z.id, f.z.abre, f.ret, txt, "zona");
    }
  }
  const sx = G.sufixo;
  const defs = `<defs><pattern id="hachura-${sx}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7"/></pattern>` +
    `<radialGradient id="luz-${sx}" cx="50%" cy="30%" r="85%"><stop offset="0" stop-color="#fbecc8"/><stop offset="0.55" stop-color="#e3c287"/><stop offset="1" stop-color="#a87f3f"/></radialGradient></defs>`;
  const escala = `${quebra}<text class="acessos__escala" x="${tam.margem}" y="${r1(tam.fimY + 21)}">Esquema de acessos, sem escala</text>`;
  return `<svg viewBox="0 0 ${tam.largura} ${tam.altura}" class="acessos__planta acessos__planta--${forma}">${defs}${corpo}${escala}${recuo ? "\n" + recuo : ""}</svg>`;
}

function validaPlanta(p, ids, erros) {
  const vistos = new Set();
  const antes = [];
  p.salas.forEach((s, i) => {
    const onde = `ingressos.planta.salas[${i}]`;
    for (const id of [s.id, ...s.zonas.map((z) => z.id)]) {
      if (vistos.has(id)) erros.push(`${onde}: código ${JSON.stringify(id)} repetido na planta`);
      vistos.add(id);
    }
    if (s.x + s.w > p.colunas || s.y + s.h > p.linhas) erros.push(`${onde} (${s.nome}): sai da grade ${p.colunas}x${p.linhas}`);
    for (const [k, abre] of [[onde + ".abre", s.abre], ...s.zonas.map((z, j) => [`${onde}.zonas[${j}].abre`, z.abre])]) {
      for (const x of abre) if (!ids.includes(x)) erros.push(`${k}: ${JSON.stringify(x)} não é código de ingresso`);
    }
    for (const [j, o] of antes) {
      if (s.x < o.x + o.w && o.x < s.x + s.w && s.y < o.y + o.h && o.y < s.y + s.h) {
        erros.push(`${onde} (${s.nome}) se sobrepõe a ingressos.planta.salas[${j}] (${o.nome})`);
      }
    }
    antes.push([i, s]);
  });
}

function plantaContexto(cru, opcoes) {
  const p = cru.ingressos.planta, ing = cru.ingressos.lista;
  const recuo = "            ";
  return {
    planta_larga: desenharPlanta(p, ing, "larga", { recuo, marcar: !!opcoes.edicao }),
    planta_alta: desenharPlanta(p, ing, "alta", { recuo, marcar: !!opcoes.edicao }),
  };
}

// ------------------------------------------------------------------ principal
AMBIENTE.addFilter("enfase", enfase);
AMBIENTE.addFilter("sem_enfase", semEnfase);
AMBIENTE.addFilter("linhas", linhas);

/** dados (JSON v2 da edição) -> HTML da página. Lança ErroDados se os dados não passam na validação. */
export function renderizar(dados, opcoes = {}) {
  if (opcoes.validar !== false) {
    const erros = validar(dados);
    if (erros.length) throw new ErroDados("dados inválidos:\n  " + erros.join("\n  "), erros);
  }
  return MODELO.render(contexto(dados, opcoes));
}
