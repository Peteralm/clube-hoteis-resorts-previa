/* Aba "Evento": os fatos do Clube num lugar só (datas, horários, locais, números, Google e WhatsApp). Mudou aqui, muda
   no site inteiro. Cada campo diz em quantos lugares da página aparece (lugares.js) e leva até eles. */
import { h, ICONE, aviso, local } from "./ui.js";
import { obter, definir, partes, rotuloDe } from "./campos.js";
import { MESES, SEMANA_CURTA, ISO, deIso, paraIso, somarDias, diasEntre, porExtenso, citacoes, confere, reescrever } from "./datas.js";

const TOKENS = {
  datas: "datas do evento", datas_sem_ano: "datas sem o ano", datas_curtas: "datas curtas", ano: "ano do evento",
  dia1: "dia 1 por extenso", dia2: "dia 2 por extenso", convidados: "número de convidados",
};
const paraTela = (s) => String(s ?? "").replace(/\{([a-z_0-9]+)\}/gi, (t, n) => `[${TOKENS[n] || n}]`);
const doTela = (s) => {
  const inv = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [v, k]));
  return String(s).replace(/\[([^\]]+)\]/g, (t, n) => (inv[n.trim()] ? `{${inv[n.trim()]}}` : t));
};

/* textos livres da edição (onde alguém pode ter escrito uma data à mão) */
const NAO_LIVRE = /(^|\.)(id|data|chegada|hora|latitude|longitude|busca_mapa|youtube|video|video_curto|src|para|versao|\$schema)$/;
function textosLivres(o, p = [], out = []) {
  if (Array.isArray(o)) o.forEach((v, i) => textosLivres(v, [...p, i], out));
  else if (o && typeof o === "object") {
    if (typeof o.src === "string") return out; // foto
    for (const [k, v] of Object.entries(o)) { if (k === "planta") continue; textosLivres(v, [...p, k], out); }
  } else if (typeof o === "string" && o.trim() && !NAO_LIVRE.test(p.join("."))) out.push({ caminho: p.join("."), texto: o });
  return out;
}

export function criarAbaEvento(ctx) {
  const { E, mudar, lugaresDe, irParaLugar, toque, urlDaMidia, abrirPainelFoto, grupoDeCampos, camposSemLugar, renomear, contextoDe, R } = ctx;
  const dados = () => E.dados;
  const raiz = h("div", { class: "evento", hidden: true, role: "tabpanel", id: "aba-evento-painel", "aria-labelledby": "aba-evento" });
  const usados = new Set(); // caminhos que esta aba mostra (o resto vai para "Outros ajustes")
  const contadores = []; // { caminhos, botao, lista }
  let filaTimer = 0;

  // datas de quando a edição foi aberta (ou as que ficaram guardadas de uma visita anterior): base de "data antiga"
  const chaveDatas = "painel-datas:" + E.edicao.id;
  const atuais = () => (obter(dados(), "datas.dias") || []).map((d) => d?.data).filter((x) => ISO.test(x || ""));
  let antigas = local.ler(chaveDatas) || atuais();
  if (!local.ler(chaveDatas)) local.gravar(chaveDatas, antigas);

  /* ---------------------------------------------------------------- peças */
  function contador(caminhos) {
    const lista = h("ul", { class: "lugares", hidden: true });
    const botao = h("button", { type: "button", class: "lugares__botao", "aria-expanded": "false", text: "Procurando onde aparece…", disabled: true });
    botao.addEventListener("click", () => {
      const aberto = botao.getAttribute("aria-expanded") === "true";
      botao.setAttribute("aria-expanded", String(!aberto));
      lista.hidden = aberto;
    });
    const reg = { caminhos, botao, lista, feito: false };
    contadores.push(reg);
    return h("div", { class: "lugares__caixa" }, botao, lista);
  }

  function preencherContador(reg) {
    let ls = [];
    try { ls = lugaresDe(caminhosValidos(reg.caminhos)); } catch (e) { console.warn("painel: lugares", e); }
    reg.feito = true;
    reg.botao.disabled = !ls.length;
    reg.botao.textContent = !ls.length ? "Não aparece escrito no site" : ls.length === 1 ? "Aparece em 1 lugar do site" : `Aparece em ${ls.length} lugares do site`;
    reg.lista.replaceChildren(...ls.map((l) => h("li", null, l.seletor
      ? h("button", { type: "button", class: "lugares__ir", onclick: () => irParaLugar(l.seletor, l.rotulo) }, h("span", { text: l.rotulo }), h("span", { class: "lugares__seta", html: ICONE.seta }))
      : h("span", { class: "lugares__fixo" }, h("span", { text: l.rotulo }), h("span", { class: "lugares__nota", text: "não aparece na rolagem da página" })))));
  }
  const caminhosValidos = (cs) => cs.filter((c) => obter(dados(), c) !== undefined);

  // conta aos poucos, sem travar a tela
  function contarTudo() {
    clearTimeout(filaTimer);
    for (const r of contadores) { r.feito = false; r.botao.disabled = true; r.botao.textContent = "Procurando onde aparece…"; }
    const passo = () => {
      if (raiz.hidden) return;
      const r = contadores.find((x) => !x.feito && x.botao.isConnected);
      if (!r) return;
      preencherContador(r);
      filaTimer = setTimeout(passo, 16);
    };
    filaTimer = setTimeout(passo, 30);
  }

  let seq = 0;
  function campo({ rotulo, ajuda, entrada, caminhos, extra }) {
    const id = entrada.id || (entrada.id = "ev-" + (++seq));
    caminhos.forEach((c) => usados.add(c));
    return h("div", { class: "ev-campo" },
      h("label", { class: "ev-campo__rotulo", for: id, text: rotulo }),
      ajuda ? h("p", { class: "ev-campo__ajuda", text: ajuda }) : null,
      entrada, extra || null,
      contador(caminhos));
  }

  function texto(c, { rotulo, ajuda, longo, tokens, larg } = {}) {
    const v = obter(dados(), c);
    const ent = h(longo ? "textarea" : "input", { class: "campo__entrada" + (larg ? " campo__entrada--" + larg : ""), rows: longo ? 3 : null, type: longo ? null : "text", autocomplete: "off" });
    ent.value = tokens ? paraTela(v) : v ?? "";
    let t = 0;
    const gravar = () => {
      clearTimeout(t);
      const novo = tokens ? doTela(ent.value) : ent.value;
      if (novo === obter(dados(), c)) return;
      mudar((d) => definir(d, c, novo), { rotulo: rotulo || rotuloDe(c), grupo: c, semAviso: true });
      depoisDeTexto();
    };
    ent.addEventListener("input", () => { clearTimeout(t); t = setTimeout(gravar, 700); });
    ent.addEventListener("change", gravar);
    return campo({ rotulo: rotulo || rotuloDe(c), ajuda, entrada: ent, caminhos: [c] });
  }

  function hora(c, rotulo) {
    const v = obter(dados(), c) || "";
    const ent = h("input", { class: "campo__entrada campo__entrada--curta", type: "text", inputmode: "numeric", value: v, placeholder: "08:30", maxlength: 5, autocomplete: "off" });
    const como = h("span", { class: "ev-campo__extra", text: v ? `aparece como ${v.replace(":", "h")}` : "" });
    ent.addEventListener("input", () => {
      let x = ent.value.replace(/[^\d]/g, "").slice(0, 4);
      if (x.length > 2) x = x.slice(0, 2) + ":" + x.slice(2);
      ent.value = x;
    });
    ent.addEventListener("change", () => {
      const m = ent.value.match(/^(\d{1,2}):?(\d{2})$/);
      if (!m || +m[1] > 23 || +m[2] > 59) { aviso("Escreva a hora assim: 08:30.", "erro"); ent.value = obter(dados(), c) || ""; return; }
      const novo = `${m[1].padStart(2, "0")}:${m[2]}`;
      ent.value = novo;
      como.textContent = `aparece como ${novo.replace(":", "h")}`;
      if (novo !== obter(dados(), c)) { mudar((d) => definir(d, c, novo), { rotulo, grupo: c }); depoisDeTexto(); }
    });
    return campo({ rotulo, entrada: ent, caminhos: [c], extra: como });
  }

  /* ---------------------------------------------------------------- calendário */
  function calendario({ valor, aoEscolher, minimo }) {
    let { a, m } = ISO.test(valor || "") ? deIso(valor) : (() => { const t = new Date(); return { a: t.getFullYear(), m: t.getMonth() + 1 }; })();
    const selMes = h("select", { class: "calendario__sel", "aria-label": "Mês" }, ...MESES.map((n, i) => h("option", { value: i + 1, text: n })));
    const anoBase = new Date().getFullYear();
    const selAno = h("select", { class: "calendario__sel", "aria-label": "Ano" }, ...Array.from({ length: 6 }, (_, i) => anoBase - 1 + i).map((y) => h("option", { value: y, text: String(y) })));
    const grade = h("div", { class: "calendario__grade", role: "grid" });
    const desenhar = () => {
      selMes.value = String(m); selAno.value = String(a);
      const primeiro = new Date(Date.UTC(a, m - 1, 1)).getUTCDay();
      const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
      const cab = SEMANA_CURTA.map((s) => h("span", { class: "calendario__sem", text: s }));
      const vazios = Array.from({ length: primeiro }, () => h("span"));
      const dias = Array.from({ length: total }, (_, i) => {
        const iso = paraIso(a, m, i + 1);
        const fora = minimo && iso <= minimo;
        return h("button", {
          type: "button", class: "calendario__dia" + (iso === valor ? " calendario__dia--sel" : ""), text: String(i + 1), disabled: fora,
          "aria-label": porExtenso(iso), "aria-pressed": String(iso === valor), "data-iso": iso, onclick: () => aoEscolher(iso),
        });
      });
      grade.replaceChildren(...cab, ...vazios, ...dias);
    };
    const mover = (n) => { m += n; if (m < 1) { m = 12; a--; } if (m > 12) { m = 1; a++; } if (![...selAno.options].some((o) => +o.value === a)) selAno.append(h("option", { value: a, text: String(a) })); desenhar(); };
    selMes.addEventListener("change", () => { m = +selMes.value; desenhar(); });
    selAno.addEventListener("change", () => { a = +selAno.value; desenhar(); });
    desenhar();
    return h("div", { class: "calendario" },
      h("div", { class: "calendario__topo" },
        h("button", { type: "button", class: "icone-botao calendario__nav", "aria-label": "Mês anterior", html: ICONE.voltar, onclick: () => mover(-1) }),
        selMes, selAno,
        h("button", { type: "button", class: "icone-botao calendario__nav calendario__nav--prox", "aria-label": "Próximo mês", html: ICONE.voltar, onclick: () => mover(1) })),
      grade);
  }

  function campoData(i) {
    const c = `datas.dias.${i}.data`;
    const v = obter(dados(), c);
    const caixaCal = h("div", { class: "ev-data__cal", hidden: true });
    const botao = h("button", { type: "button", class: "ev-data__valor", "aria-expanded": "false" },
      h("span", { class: "ev-data__icone", html: ICONE.calendario }),
      h("span", { class: "ev-data__texto", text: porExtenso(v) || "Escolher a data" }),
      h("span", { class: "ev-data__mudar", text: "Mudar" }));
    botao.addEventListener("click", () => {
      const abrir = caixaCal.hidden;
      raiz.querySelectorAll(".ev-data__cal").forEach((x) => { x.hidden = true; x.previousElementSibling?.setAttribute?.("aria-expanded", "false"); });
      if (abrir) {
        const dias = obter(dados(), "datas.dias") || [];
        caixaCal.replaceChildren(calendario({ valor: obter(dados(), c), minimo: i > 0 ? dias[i - 1]?.data : null, aoEscolher: (iso) => escolherData(i, iso) }));
        caixaCal.hidden = false;
        botao.setAttribute("aria-expanded", "true");
        caixaCal.querySelector(".calendario__dia--sel, .calendario__dia:not([disabled])")?.focus({ preventScroll: true });
      }
    });
    botao.id = "ev-data-" + i;
    usados.add(c);
    const nota = h("p", { class: "ev-campo__nota", id: "ev-nota-" + i, hidden: true });
    return h("div", { class: "ev-campo ev-data" },
      h("label", { class: "ev-campo__rotulo", for: botao.id, text: `Dia ${i + 1}` }),
      botao, caixaCal, nota, contador([c]));
  }

  // muda um dia; os dias seguintes andam junto, mantendo a distância (o Clube continua em dias seguidos)
  function escolherData(i, iso) {
    const dias = (obter(dados(), "datas.dias") || []).map((d) => d.data);
    if (i > 0 && dias[i - 1] && iso <= dias[i - 1]) { aviso(`O Dia ${i + 1} precisa ser depois do Dia ${i}.`, "erro"); return; }
    const novos = [...dias];
    novos[i] = iso;
    for (let k = i + 1; k < dias.length; k++) {
      const gap = ISO.test(dias[k] || "") && ISO.test(dias[k - 1] || "") ? Math.max(1, diasEntre(dias[k - 1], dias[k])) : 1;
      novos[k] = somarDias(novos[k - 1], gap);
    }
    const mudados = novos.map((x, k) => (x !== dias[k] ? `datas.dias.${k}.data` : null)).filter(Boolean);
    if (!mudados.length) { fecharCalendarios(); return; }
    let n = 0;
    try { n = lugaresDe(mudados).length; } catch { /* sem contagem */ }
    mudar((d) => novos.forEach((x, k) => definir(d, `datas.dias.${k}.data`, x)), { rotulo: "data do evento" });
    const acompanharam = mudados.filter((c) => c !== `datas.dias.${i}.data`).length;
    redesenhar();
    if (acompanharam) {
      const nota = raiz.querySelector(`#ev-nota-${i + 1}`);
      if (nota) { nota.hidden = false; nota.textContent = `Acompanhou o Dia ${i + 1}: continua ${diasEntre(novos[i], novos[i + 1]) === 1 ? "1 dia depois" : diasEntre(novos[i], novos[i + 1]) + " dias depois"}.`; }
    }
    aviso(n ? `Data atualizada em ${n} lugares do site.` : "Data atualizada.", null, { rotulo: "Desfazer", fazer: ctx.desfazer });
    raiz.querySelector(`#ev-data-${i}`)?.focus({ preventScroll: true });
  }
  const fecharCalendarios = () => raiz.querySelectorAll(".ev-data__cal").forEach((x) => { x.hidden = true; });

  /* ---------------------------------------------------------------- datas escritas à mão */
  function datasAntigas() {
    const isos = atuais();
    const achados = [];
    for (const { caminho, texto: t } of textosLivres(dados())) {
      const cs = citacoes(t).filter((c) => !confere(c, isos));
      if (cs.length) achados.push({ caminho, texto: t, citacoes: cs });
    }
    return achados;
  }

  function alertaDatas() {
    const achados = datasAntigas();
    const isos = atuais();
    if (!achados.length) {
      // tudo em dia: estas viram as datas de referência
      if (JSON.stringify(antigas) !== JSON.stringify(isos)) { antigas = isos; local.gravar(chaveDatas, antigas); }
      return null;
    }
    const trocaveis = achados.filter((x) => x.citacoes.some((c) => reescrever(c, antigas, isos)));
    const anoMudou = antigas[0] && isos[0] && deIso(antigas[0]).a !== deIso(isos[0]).a;
    const lista = h("ul", { class: "alerta__lista", hidden: true }, ...achados.map((x) => {
      const ctxNome = [contextoDe(x.caminho), rotuloDe(x.caminho)].filter(Boolean).join(" · ");
      const trecho = h("span", { class: "alerta__trecho" });
      let pos = 0;
      for (const c of x.citacoes) {
        trecho.append(x.texto.slice(Math.max(pos, c.inicio - 40), c.inicio).replace(/^/, pos < c.inicio - 40 ? "…" : ""));
        trecho.append(h("mark", { text: c.texto }));
        pos = c.fim;
      }
      trecho.append(x.texto.slice(pos, pos + 40) + (x.texto.length > pos + 40 ? "…" : ""));
      return h("li", null, h("span", { class: "alerta__onde", text: ctxNome }), trecho,
        h("button", { type: "button", class: "link-botao", text: "Mostrar na página", onclick: () => ctx.irParaCampo(x.caminho) }));
    }));
    const ver = h("button", { type: "button", class: "botao botao--claro botao--pequeno", text: "Ver", "aria-expanded": "false" });
    ver.addEventListener("click", () => { lista.hidden = !lista.hidden; ver.setAttribute("aria-expanded", String(!lista.hidden)); ver.textContent = lista.hidden ? "Ver" : "Esconder"; });
    const trocar = trocaveis.length ? h("button", { type: "button", class: "botao botao--pequeno", text: "Trocar também", onclick: () => trocarTambem(trocaveis) }) : null;
    const n = achados.length;
    return h("div", { class: "alerta", role: "status" },
      h("p", { class: "alerta__titulo" }, h("span", { html: ICONE.alerta }), h("strong", { text: `${n === 1 ? "1 texto ainda cita" : n + " textos ainda citam"} a data antiga` })),
      h("p", { class: "alerta__texto", text: (anoMudou ? `O ano mudou de ${deIso(antigas[0]).a} para ${deIso(isos[0]).a}. ` : "") + "Esses textos têm a data escrita à mão e não mudam sozinhos." + (trocaveis.length ? " “Trocar também” escreve a data nova no lugar." : "") }),
      h("div", { class: "alerta__botoes" }, trocar, ver),
      lista);
  }

  function trocarTambem(achados) {
    const isos = atuais();
    let n = 0;
    mudar((d) => {
      for (const x of achados) {
        let t = obter(d, x.caminho);
        if (typeof t !== "string") continue;
        const cs = citacoes(t).filter((c) => !confere(c, isos)).sort((a, b) => b.inicio - a.inicio);
        let mexeu = false;
        for (const c of cs) {
          const novo = reescrever(c, antigas, isos);
          if (novo == null) continue;
          t = t.slice(0, c.inicio) + novo + t.slice(c.fim);
          mexeu = true;
        }
        if (mexeu) { definir(d, x.caminho, t); n++; }
      }
    }, { rotulo: "datas escritas à mão" });
    redesenhar();
    aviso(n === 1 ? "1 texto atualizado com a data nova." : `${n} textos atualizados com a data nova.`, null, { rotulo: "Desfazer", fazer: ctx.desfazer });
  }

  function depoisDeTexto() {
    // contagens e alerta acompanham; os campos ficam como estão (não perde o que está sendo digitado)
    const alvo = raiz.querySelector(".ev-alerta-lugar");
    if (alvo) alvo.replaceChildren(...[alertaDatas()].filter(Boolean));
    atualizarCartao?.();
    contarTudo();
  }

  /* ---------------------------------------------------------------- cartões */
  const cartao = (titulo, sub, ...corpo) => h("section", { class: "ev-cartao" },
    h("header", { class: "ev-cartao__cabeca" }, h("h2", { class: "ev-cartao__titulo", text: titulo }), sub ? h("p", { class: "ev-cartao__sub", text: sub }) : null),
    ...corpo);

  function linkDoMapa(i) {
    const lat = obter(dados(), `datas.dias.${i}.latitude`), lng = obter(dados(), `datas.dias.${i}.longitude`);
    const ent = h("input", { class: "campo__entrada", type: "url", placeholder: "Cole aqui o link do Google Maps", autocomplete: "off" });
    ent.addEventListener("change", () => {
      const u = decodeURIComponent(ent.value);
      const m = u.match(/@(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || u.match(/[?&](?:q|ll|query|destination)=(-?\d+\.\d+),\s*(-?\d+\.\d+)/) || u.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/) || u.match(/^\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)\s*$/);
      if (!m) { aviso("Não achei o ponto nesse link. No Google Maps, toque no local, em Compartilhar e copie o link inteiro.", "erro"); return; }
      const [la, lo] = [Number(m[1]), Number(m[2])];
      const virarTexto = typeof lat === "string";
      mudar((d) => { definir(d, `datas.dias.${i}.latitude`, virarTexto ? String(la) : la); definir(d, `datas.dias.${i}.longitude`, virarTexto ? String(lo) : lo); }, { rotulo: "ponto no mapa" });
      ent.value = "";
      aviso(`Ponto do Dia ${i + 1} ajustado no mapa.`, null, { rotulo: "Desfazer", fazer: ctx.desfazer });
      redesenhar();
    });
    usados.add(`datas.dias.${i}.latitude`); usados.add(`datas.dias.${i}.longitude`);
    const ver = lat != null && lng != null ? h("a", { class: "link-botao", href: `https://www.google.com/maps?q=${lat},${lng}`, target: "_blank", rel: "noopener", text: "Ver o ponto atual no mapa ↗" }) : null;
    return h("details", { class: "ev-mapa" },
      h("summary", { text: "Ajustar ponto no mapa" }),
      h("p", { class: "ev-campo__ajuda", text: "Só se o Waze ou o Google levarem para o lugar errado." }),
      texto(`datas.dias.${i}.busca_mapa`, { rotulo: "Como o Google Maps acha o local" }),
      h("div", { class: "ev-campo" }, h("p", { class: "ev-campo__rotulo", text: "Ponto exato" }), ent, ver));
  }

  let atualizarCartao = null;
  function cartaoWhatsApp() {
    const img = h("img", { class: "zap__img", alt: "" });
    const tit = h("strong", { class: "zap__titulo" });
    const desc = h("span", { class: "zap__desc" });
    const dom = h("span", { class: "zap__dominio" });
    atualizarCartao = () => {
      let doc = null;
      try { doc = new DOMParser().parseFromString(R.renderizar(dados(), { edicao: false, midiaBase: R.MIDIA_URL, validar: false }), "text/html"); } catch { /* deixa o que tinha */ }
      const meta = (p) => doc?.querySelector(`meta[property="${p}"]`)?.getAttribute("content") || "";
      tit.textContent = meta("og:title") || doc?.title || "";
      desc.textContent = meta("og:description");
      img.src = urlDaMidia(obter(dados(), "textos.seo.imagem"));
      let host = "";
      try { host = new URL(doc?.querySelector('link[rel="canonical"]')?.href || "").host; } catch { /* sem domínio */ }
      dom.textContent = !host || /DOMINIO|localhost/i.test(host) ? new URL(ctx.baseSite).host : host;
    };
    atualizarCartao();
    return h("figure", { class: "zap", "aria-label": "Prévia do link no WhatsApp" },
      h("div", { class: "zap__balao" }, img, h("div", { class: "zap__texto" }, tit, desc, dom)),
      h("figcaption", { class: "ev-campo__ajuda", text: "Assim o link aparece quando alguém manda no WhatsApp. O WhatsApp pode levar alguns dias para mostrar a versão nova." }));
  }

  function redesenhar() {
    const y = raiz.scrollTop;
    const foco = document.activeElement && raiz.contains(document.activeElement) ? document.activeElement.id : null;
    usados.clear();
    contadores.length = 0;
    const d = dados();
    const dias = obter(d, "datas.dias") || [];

    const cDatas = cartao("Datas", "Todas as datas do site saem daqui: topo, programação, mapa, rodapé, Google e WhatsApp.",
      ...dias.map((_, i) => campoData(i)),
      h("div", { class: "ev-alerta-lugar" }, alertaDatas()));

    const cHoras = cartao("Horários", "Hora de chegada e a agenda de cada dia.",
      ...dias.map((dia, i) => h("div", { class: "ev-grupo" },
        h("h3", { class: "ev-grupo__titulo", text: `Dia ${i + 1}` }),
        dia.chegada !== undefined ? hora(`datas.dias.${i}.chegada`, "Chegada") : null,
        ...(dia.agenda || []).map((_, k) => h("div", { class: "ev-linha" },
          texto(`datas.dias.${i}.agenda.${k}.hora`, { rotulo: "Horário", larg: "curta" }),
          texto(`datas.dias.${i}.agenda.${k}.ato`, { rotulo: "O que acontece" }))),
        h("p", { class: "ev-campo__ajuda", text: "Para pôr ou tirar um horário da agenda, use a aba Página." }))));

    const cLocais = cartao("Locais", "Onde acontece cada dia.",
      ...dias.map((dia, i) => h("div", { class: "ev-grupo" },
        h("h3", { class: "ev-grupo__titulo", text: `Dia ${i + 1}` }),
        texto(`datas.dias.${i}.local`, { rotulo: "Nome do local" }),
        texto(`datas.dias.${i}.endereco`, { rotulo: "Endereço" }),
        h("div", { class: "ev-linha" },
          texto(`datas.dias.${i}.localidade`, { rotulo: "Bairro e cidade" }),
          texto(`datas.dias.${i}.uf`, { rotulo: "Estado", larg: "mini" })),
        texto(`datas.dias.${i}.cidade`, { rotulo: "Cidade, em uma palavra", ajuda: "Aparece na programação e na tabela dos aeroportos." }),
        linkDoMapa(i))),
      obter(d, "datas.deslocamento") !== undefined ? texto("datas.deslocamento", { rotulo: "Trajeto entre os dias", ajuda: "Ex.: cerca de 1h30 de carro · 90 km" }) : null,
      obter(d, "datas.local_curto") !== undefined ? texto("datas.local_curto", { rotulo: "Cidade ao lado da data", ajuda: "Ex.: Alphaville/SP" }) : null);

    const qtd = obter(d, "palestrantes.convidados.quantidade");
    let cNumeros = null;
    if (qtd !== undefined) {
      const ent = h("input", { class: "campo__entrada campo__entrada--curta", type: "number", min: 0, step: 1, inputmode: "numeric", value: qtd });
      ent.addEventListener("change", () => {
        const n = Math.max(0, Math.round(Number(ent.value)));
        if (!Number.isFinite(n) || n === obter(dados(), "palestrantes.convidados.quantidade")) return;
        mudar((x) => definir(x, "palestrantes.convidados.quantidade", n), { rotulo: "convidados" });
        depoisDeTexto();
      });
      cNumeros = cartao("Números do evento", null,
        campo({ rotulo: "Palestrantes convidados", ajuda: "Além de Ênio, Pablo e Nezio. Aparece como “+8”.", entrada: ent, caminhos: ["palestrantes.convidados.quantidade"] }));
    }

    const temSeo = obter(d, "textos.seo") !== undefined;
    const cSeo = temSeo ? cartao("Como aparece no Google e no WhatsApp", "O que está entre colchetes se atualiza sozinho com as datas.",
      cartaoWhatsApp(),
      texto("textos.seo.titulo", { rotulo: "Título", tokens: true }),
      texto("textos.seo.descricao", { rotulo: "Descrição", tokens: true, longo: true }),
      h("div", { class: "ev-campo" },
        h("p", { class: "ev-campo__rotulo", text: "Imagem do link" }),
        h("button", { type: "button", class: "botao botao--claro botao--pequeno", onclick: () => abrirPainelFoto(null, "textos.seo.imagem") }, h("span", { html: ICONE.foto }), " Trocar imagem"))) : null;
    usados.add("textos.seo.imagem"); usados.add("textos.seo.imagem_alt");

    // o que não cabe nos cartões, sem lugar na página
    const resto = camposSemLugar().filter((c) => !usados.has(c) && !/^datas\.dias\.\d+\.(latitude|longitude)$/.test(c));
    const nome = h("input", { class: "campo__entrada", id: "ev-nome", type: "text", value: E.edicao.nome || "", maxlength: 80 });
    nome.addEventListener("change", () => renomear(nome.value.trim()));
    const outros = h("details", { class: "ev-outros" },
      h("summary", null, h("span", { class: "ev-outros__titulo", text: "Outros ajustes" }), h("span", { class: "ev-cartao__sub", text: "Nome da edição no painel e códigos raros" })),
      h("div", { class: "ev-campo" }, h("label", { class: "ev-campo__rotulo", for: "ev-nome", text: "Nome da edição (só no painel)" }), nome),
      resto.length ? grupoDeCampos(resto) : null);

    raiz.replaceChildren(h("div", { class: "evento__miolo" },
      h("header", { class: "evento__cabeca" },
        h("h1", { class: "evento__titulo", text: "Evento" }),
        h("p", { class: "evento__sub", text: "Os dados do Clube num lugar só. Mudou aqui, muda no site inteiro." })),
      cDatas, cHoras, cLocais, cNumeros, cSeo, outros));
    raiz.scrollTop = y;
    if (foco) document.getElementById(foco)?.focus({ preventScroll: true });
    contarTudo();
  }

  return {
    el: raiz,
    mostrar() { raiz.hidden = false; redesenhar(); },
    esconder() { raiz.hidden = true; clearTimeout(filaTimer); },
    atualizar() { if (!raiz.hidden) redesenhar(); },
    get aberta() { return !raiz.hidden; },
  };
}
