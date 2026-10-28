/* Caminhos dentro dos dados, o schema (rótulos e limites) e a linguagem do cliente para cada campo. */

// "datas.dias.0.data" ou "datas.dias[0].data" -> ["datas","dias",0,"data"]
export function partes(caminho) {
  if (Array.isArray(caminho)) return caminho;
  return String(caminho).replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean).map((k) => (/^\d+$/.test(k) ? Number(k) : k));
}
export const juntar = (p) => partes(p).join(".");

export function obter(obj, caminho) {
  let o = obj;
  for (const k of partes(caminho)) { if (o == null) return undefined; o = o[k]; }
  return o;
}

export function definir(obj, caminho, valor) {
  const p = partes(caminho);
  let o = obj;
  for (let i = 0; i < p.length - 1; i++) {
    if (o[p[i]] == null || typeof o[p[i]] !== "object") o[p[i]] = typeof p[i + 1] === "number" ? [] : {};
    o = o[p[i]];
  }
  o[p.at(-1)] = valor;
}

/* ------------------------------------------------------------ schema */
let SCHEMA = null;
export function usarSchema(s) { SCHEMA = s; }

function resolver(no) {
  let n = no;
  for (let i = 0; n && n.$ref && i < 20; i++) {
    const ref = n.$ref.replace(/^#\//, "").split("/");
    let alvo = SCHEMA;
    for (const k of ref) alvo = alvo?.[decodeURIComponent(k)];
    n = alvo ? { ...alvo, ...Object.fromEntries(Object.entries(n).filter(([k]) => k !== "$ref")) } : null;
  }
  return n || {};
}

// nó do schema para um caminho dos dados (índices de lista caem em items)
export function noDe(caminho) {
  if (!SCHEMA) return null;
  let n = resolver(SCHEMA);
  for (const k of partes(caminho)) {
    if (!n) return null;
    if (typeof k === "number") n = resolver(n.items || {});
    else if (n.properties && n.properties[k]) n = resolver(n.properties[k]);
    else if (n.additionalProperties && typeof n.additionalProperties === "object") n = resolver(n.additionalProperties);
    else if (n.patternProperties) n = resolver(Object.values(n.patternProperties)[0]);
    else return null;
  }
  return n;
}

export function limitesDaLista(caminho) {
  const n = noDe(caminho);
  return { min: n?.minItems ?? 0, max: n?.maxItems ?? Infinity, nome: n?.["x-item"] || null };
}

// um item novo e vazio com a forma de um vizinho (ou do schema, se a lista está vazia)
export function itemVazio(caminhoLista, vizinho) {
  const limpar = (v) => {
    if (Array.isArray(v)) return [];
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpar(x)]));
    if (typeof v === "number") return 0;
    if (typeof v === "boolean") return false;
    return "";
  };
  if (vizinho !== undefined) {
    const novo = limpar(vizinho);
    // listas de números (ex.: minutos até cada dia) mantêm o tamanho
    if (vizinho && typeof vizinho === "object" && !Array.isArray(vizinho)) {
      for (const [k, x] of Object.entries(vizinho)) if (Array.isArray(x) && x.every((y) => typeof y === "number")) novo[k] = x.map(() => 0);
    }
    return novo;
  }
  const n = resolver(noDe(caminhoLista)?.items || {});
  const deNo = (no) => {
    no = resolver(no);
    if (no.default !== undefined) return structuredClone(no.default);
    if (no.type === "object") return Object.fromEntries(Object.entries(no.properties || {}).map(([k, x]) => [k, deNo(x)]));
    if (no.type === "array") return [];
    if (no.type === "number" || no.type === "integer") return 0;
    if (no.type === "boolean") return false;
    return "";
  };
  return deNo(n);
}

/* ------------------------------------------------------------ como o campo se apresenta */
const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{2}:\d{2}$/;

// rótulos na língua do cliente; "#" casa qualquer índice, "*" qualquer chave
const ROTULOS = [
  ["datas.dias.#.data", "Data do dia"],
  ["datas.dias.#.chegada", "Horário de chegada"],
  ["datas.dias.#.local", "Nome do local"],
  ["datas.dias.#.artigo", "Como se fala do local"],
  ["datas.dias.#.endereco", "Endereço"],
  ["datas.dias.#.cidade", "Cidade (curta)"],
  ["datas.dias.#.localidade", "Bairro e cidade"],
  ["datas.dias.#.uf", "Estado (UF)"],
  ["datas.dias.#.busca_mapa", "Como achar no Google Maps"],
  ["datas.dias.#.latitude", "Latitude (Waze)"],
  ["datas.dias.#.longitude", "Longitude (Waze)"],
  ["datas.dias.#.foto_alt", "Descrição da foto"],
  ["datas.local_curto", "Cidade ao lado da data"],
  ["textos.seo.titulo", "Título na aba e no Google"],
  ["textos.seo.descricao", "Descrição no Google e no WhatsApp"],
  ["textos.seo.imagem", "Imagem ao compartilhar no WhatsApp"],
  ["textos.seo.imagem_alt", "Descrição da imagem de compartilhamento"],
  ["textos.edicao.youtube", "Link do vídeo no YouTube"],
  ["ingressos.lista.#.id", "Código do ingresso"],
  ["ingressos.lista.#.subir.para", "Botão leva para o ingresso"],
  ["palestrantes.convidados.quantidade", "Quantos convidados"],
  ["palestrantes.principal.unidades", "Unidades desenvolvidas"],
  ["palestrantes.principal.anos", "Anos de mercado"],
];

function casa(padrao, p) {
  const a = padrao.split(".");
  if (a.length !== p.length) return false;
  return a.every((x, i) => x === "*" || (x === "#" ? typeof p[i] === "number" : x === String(p[i])));
}

export function rotuloDe(caminho) {
  const p = partes(caminho);
  const fixo = ROTULOS.find(([padrao]) => casa(padrao, p));
  if (fixo) return fixo[1];
  const n = noDe(p);
  if (n?.title) return n.title;
  const k = String(p.filter((x) => typeof x === "string").at(-1) || "");
  return (k.charAt(0).toUpperCase() + k.slice(1)).replace(/_/g, " ");
}

export function ajudaDe(caminho) {
  const n = noDe(caminho);
  const d = n?.description || "";
  // ajuda técnica não vai para o cliente
  if (/assets\/|midia:|schema|json|código/i.test(d)) return "";
  return d.length > 120 ? "" : d;
}

// tipo de entrada: data, hora, numero, sim-nao, ingressos (códigos), escolha, texto, texto-longo, imagem, lista-numeros
export function tipoDe(caminho, valor) {
  const p = partes(caminho);
  const n = noDe(p) || {};
  const w = n["x-widget"];
  if (valor && typeof valor === "object" && !Array.isArray(valor) && "src" in valor) return "imagem";
  if (w === "imagem" || w === "video") return w;
  if (w === "data" || (typeof valor === "string" && RE_DATA.test(valor))) return "data";
  if (w === "hora" || (typeof valor === "string" && RE_HORA.test(valor))) return "hora";
  if (p.at(-1) === "abre") return "ingressos";
  if (Array.isArray(n.enum) || (w === "escolha" && !Array.isArray(valor))) return "escolha";
  if (Array.isArray(valor) && valor.every((x) => typeof x === "number")) return "lista-numeros";
  if (typeof valor === "number" || n.type === "number" || n.type === "integer") return "numero";
  if (typeof valor === "boolean") return "sim-nao";
  if (w === "texto-longo" || (typeof valor === "string" && (valor.length > 70 || valor.includes("\n")))) return "texto-longo";
  return "texto";
}

export function opcoesDe(caminho) {
  const n = noDe(caminho) || {};
  if (Array.isArray(n.enum)) return n.enum.map((v, i) => ({ valor: v, rotulo: n["x-rotulos"]?.[i] ?? String(v) }));
  if (Array.isArray(n.oneOf)) return n.oneOf.filter((o) => "const" in o).map((o) => ({ valor: o.const, rotulo: o.title || String(o.const) }));
  return null;
}

// nome amigável de um item de lista ("Dia 1", "Ingresso VIP", "Nezio Monteiro")
export function nomeDoItem(caminhoLista, i, valor) {
  const p = partes(caminhoLista);
  const k = p.at(-1);
  if (k === "dias") return `Dia ${i + 1}`;
  if (valor && typeof valor === "object") {
    const c = valor.nome || valor.ato || valor.destaque || valor.titulo || valor.numero;
    if (typeof c === "string" && c.trim()) return c.replace(/\*/g, "").replace(/\n/g, " ").slice(0, 40);
  }
  if (typeof valor === "string" && valor.trim()) return valor.replace(/\*/g, "").slice(0, 40);
  return `Item ${i + 1}`;
}

// como chamar UM item desta lista nos botões ("benefício", "horário")
export function nomeDaCoisa(caminhoLista) {
  const k = String(partes(caminhoLista).filter((x) => typeof x === "string").at(-1));
  return ({
    agenda: "horário", itens: "benefício", destaques: "destaque", dias: "dia", aeroportos: "aeroporto", hoteis: "hotel",
    como_ir: "forma de chegar", lista: "ingresso", outros: "palestrante", fatos: "número", fotos: "foto", frases: "frase",
    nao: "frase", salas: "sala", zonas: "zona",
  })[k] || "item";
}

// nome do grupo de um caminho (para o painel de configurações e para o cabeçalho do painel lateral)
export function contextoDe(caminho) {
  const p = partes(caminho);
  const nomes = [];
  for (let i = 0; i < p.length - 1; i++) {
    if (typeof p[i + 1] === "number") {
      const lista = p.slice(0, i + 1);
      nomes.push(nomeDoItemPeloCaminho(lista, p[i + 1]));
      i++;
    }
  }
  return nomes.join(" · ");
}
let dadosAtuais = null;
export function usarDados(d) { dadosAtuais = d; }
function nomeDoItemPeloCaminho(lista, i) {
  return nomeDoItem(lista, i, dadosAtuais ? obter(dadosAtuais, [...lista, i]) : undefined);
}

export const RE = { DATA: RE_DATA, HORA: RE_HORA };
