/* Datas em português: escrever por extenso, e achar datas escritas à mão nos textos livres da edição
   ("24 de novembro", "24/11", "nov 2026", "2026") que não acompanham a data do evento. */

export const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
export const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const SEMANA = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const SEMANA_CURTA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const deIso = (iso) => { const [a, m, d] = iso.split("-").map(Number); return { a, m, d }; };
export const paraIso = (a, m, d) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
export function somarDias(iso, n) {
  const { a, m, d } = deIso(iso);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}
export function diasEntre(a, b) {
  const x = deIso(a), y = deIso(b);
  return Math.round((Date.UTC(y.a, y.m - 1, y.d) - Date.UTC(x.a, x.m - 1, x.d)) / 86400000);
}
export function semanaDe(iso) { const { a, m, d } = deIso(iso); return SEMANA[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]; }
export function porExtenso(iso) {
  if (!ISO.test(iso || "")) return "";
  const { a, m, d } = deIso(iso);
  return `${semanaDe(iso)}, ${d === 1 ? "1º" : d} de ${MESES[m - 1]} de ${a}`;
}

/* ------------------------------------------------------------ datas escritas à mão */
const NOME_MES = "janeiro|fevereiro|março|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez";
const mesDe = (s) => {
  const t = s.toLowerCase().replace("marco", "março");
  let i = MESES.indexOf(t);
  if (i < 0) i = MESES_CURTOS.indexOf(t.slice(0, 3));
  return i + 1;
};
const PADROES = [
  // 24 e 25 de novembro (de 2026) · 24–25 nov 2026
  { forma: "faixa", re: new RegExp(`\\b(\\d{1,2})(º)?(\\s*(?:e|a|–|-|·)\\s*)(\\d{1,2})(º)?(\\s+(?:de\\s+)?)(${NOME_MES})(\\.?)(?:(\\s+(?:de\\s+)?)(\\d{4}))?\\b`, "giu") },
  // 24 de novembro (de 2026) · 24 nov 2026
  { forma: "dia", re: new RegExp(`\\b(\\d{1,2})(º)?(\\s+(?:de\\s+)?)(${NOME_MES})(\\.?)(?:(\\s+(?:de\\s+)?)(\\d{4}))?\\b`, "giu") },
  // 24/11 · 24/11/2026
  { forma: "numero", re: /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?\b/gu },
  // novembro de 2026 · nov 2026
  { forma: "mesano", re: new RegExp(`\\b(${NOME_MES})(\\.?\\s+(?:de\\s+)?)(\\d{4})\\b`, "giu") },
  // 2026 sozinho
  { forma: "ano", re: /\b(20\d{2})\b/gu },
];

// citações de data num texto: [{ inicio, fim, texto, forma, dias:[{d,m}], ano, partes }]
export function citacoes(texto) {
  const tomados = [];
  const livre = (i, f) => tomados.every(([a, b]) => f <= a || i >= b);
  const out = [];
  for (const { forma, re } of PADROES) {
    re.lastIndex = 0;
    for (const m of texto.matchAll(re)) {
      const i = m.index, f = i + m[0].length;
      if (!livre(i, f)) continue;
      let c = null;
      if (forma === "faixa") {
        const mes = mesDe(m[7]);
        const d1 = +m[1], d2 = +m[4];
        if (d1 < 1 || d1 > 31 || d2 < 1 || d2 > 31) continue;
        c = { dias: [{ d: d1, m: mes }, { d: d2, m: mes }], ano: m[10] ? +m[10] : null, g: m };
      } else if (forma === "dia") {
        const d = +m[1];
        if (d < 1 || d > 31) continue;
        c = { dias: [{ d, m: mesDe(m[4]) }], ano: m[7] ? +m[7] : null, g: m };
      } else if (forma === "numero") {
        const d = +m[1], mm = +m[2];
        if (d < 1 || d > 31 || mm < 1 || mm > 12) continue;
        c = { dias: [{ d, m: mm }], ano: m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null, g: m };
      } else if (forma === "mesano") {
        c = { dias: [], mes: mesDe(m[1]), ano: +m[3], g: m };
      } else {
        c = { dias: [], ano: +m[1], g: m };
      }
      tomados.push([i, f]);
      out.push({ inicio: i, fim: f, texto: m[0], forma, ...c });
    }
  }
  return out.sort((a, b) => a.inicio - b.inicio);
}

// a citação confere com as datas do evento?
export function confere(c, isos) {
  const ds = isos.filter((x) => ISO.test(x)).map(deIso);
  if (!ds.length) return true;
  const anoEvento = ds[0].a;
  if (c.ano != null && Math.abs(c.ano - anoEvento) > 3) return true; // outro assunto (ex.: "desde 2001")
  if (c.forma === "ano") return c.ano === anoEvento;
  if (c.forma === "mesano") return ds.some((x) => x.m === c.mes && x.a === c.ano);
  return c.dias.every((x) => ds.some((y) => y.d === x.d && y.m === x.m)) && (c.ano == null || c.ano === anoEvento);
}

function caixaComo(modelo, s) {
  if (modelo === modelo.toUpperCase() && /[A-ZÇ]/.test(modelo)) return s.toUpperCase();
  if (modelo[0] === modelo[0].toUpperCase() && /[A-ZÇ]/.test(modelo[0])) return s[0].toUpperCase() + s.slice(1);
  return s;
}
const nomeMesComo = (modelo, m) => caixaComo(modelo, modelo.replace(/\.$/, "").length <= 3 ? MESES_CURTOS[m - 1] : MESES[m - 1]);

// reescreve a citação com a data nova, na mesma forma; antigas/novas: listas de ISO (Dia 1, Dia 2...). null = não sabe
export function reescrever(c, antigas, novas) {
  const A = antigas.map(deIso), N = novas.map(deIso);
  const idx = (x) => A.findIndex((y) => y.d === x.d && y.m === x.m);
  const g = c.g;
  if (c.forma === "ano") return A[0] && c.ano === A[0].a ? String(N[0].a) : null;
  if (c.forma === "mesano") {
    if (!A.some((y) => y.m === c.mes && y.a === c.ano)) return null;
    return `${nomeMesComo(g[1], N[0].m)}${g[2]}${N[0].a}`;
  }
  const ks = c.dias.map(idx);
  if (ks.some((k) => k < 0)) return null;
  const ns = ks.map((k) => N[k]);
  const ano = c.ano != null ? (c.ano === A[ks[0]].a ? N[ks[0]].a : null) : undefined;
  if (ano === null) return null;
  if (c.forma === "numero") {
    const p2 = (n, s) => (s.length === 2 ? String(n).padStart(2, "0") : String(n));
    return `${p2(ns[0].d, g[1])}/${p2(ns[0].m, g[2])}${g[3] ? "/" + (g[3].length === 2 ? String(ano).slice(2) : ano) : ""}`;
  }
  if (c.forma === "dia") {
    return `${ns[0].d}${g[2] || ""}${g[3]}${nomeMesComo(g[4], ns[0].m)}${g[5] || ""}${g[7] ? g[6] + ano : ""}`;
  }
  // faixa
  const anoTxt = g[10] ? g[9] + ano : "";
  if (ns[0].m === ns[1].m) return `${ns[0].d}${g[2] || ""}${g[3]}${ns[1].d}${g[5] || ""}${g[6]}${nomeMesComo(g[7], ns[1].m)}${g[8] || ""}${anoTxt}`;
  return `${ns[0].d}${g[6]}${nomeMesComo(g[7], ns[0].m)}${g[3]}${ns[1].d}${g[6]}${nomeMesComo(g[7], ns[1].m)}${anoTxt}`;
}
