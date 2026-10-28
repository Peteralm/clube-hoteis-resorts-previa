/* Prévia da página dentro do painel: o HTML que o renderizador devolve vira um iframe com o CSS e o JS reais do site,
   mas com o movimento desligado (como "reduzir movimento" do sistema), sem enviar cadastro e sem sair da página.
   Duas molduras se revezam: a nova carrega escondida e só aparece pronta, na mesma altura de rolagem (sem piscar). */

const cssCache = new Map();

// o CSS do site entra embutido, com "reduzir movimento" sempre ligado: as regras de movimento reduzido valem e as de
// animação nunca valem (o @media do navegador não pode ser trocado de dentro do iframe)
function desligarMovimento(css) {
  return css
    .replace(/\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/g, "(min-width: 0px)")
    .replace(/\(\s*prefers-reduced-motion\s*:\s*no-preference\s*\)/g, "(max-width: 0.01px)")
    .replace(/\(\s*prefers-reduced-motion\s*\)/g, "(max-width: 0.01px)");
}

async function cssDe(url) {
  if (!cssCache.has(url)) {
    cssCache.set(url, fetch(url, { cache: "no-cache" }).then((r) => (r.ok ? r.text() : "")).then(desligarMovimento).catch(() => ""));
  }
  return cssCache.get(url);
}

// roda dentro do iframe antes de qualquer script do site
const CALCO = `<script>(function(){
  var mm = window.matchMedia.bind(window);
  window.matchMedia = function(q){
    if (/prefers-reduced-motion/.test(q)) {
      var r = /reduce/.test(q);
      return { matches: r, media: q, onchange: null, addListener: function(){}, removeListener: function(){},
               addEventListener: function(){}, removeEventListener: function(){}, dispatchEvent: function(){ return false; } };
    }
    return mm(q);
  };
  var bloqueia = function(u){ u = String(u && u.url || u || ""); return /clint\\.digital|\\/functions\\/v1\\/lead|wa\\.me|api\\.whatsapp/.test(u); };
  var f = window.fetch;
  window.fetch = function(u, o){ if (bloqueia(u)) return Promise.resolve(new Response("prévia", { status: 200 })); return f.apply(this, arguments); };
  if (navigator.sendBeacon) { var sb = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function(u, d){ return bloqueia(u) ? true : sb(u, d); }; }
  var xo = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u){ if (bloqueia(u)) { arguments[1] = "data:text/plain,previa"; } return xo.apply(this, arguments); };
  window.open = function(){ return null; };
  window.__previaDoPainel = true;
})();<\/script>`;

// O renderizador escreve os caminhos de site/novo/ ("../vendor/", "../assets/"). No pacote publicado (tools/publicar.py)
// o site fica achatado: vendor/ e assets/ ao lado do index.html, e o novo.css publicado não tem mais "../assets/".
// O CSS do site (que a prévia busca de qualquer jeito) diz em qual dos dois a prévia está, sem pedido extra.
async function ehPacote(base) {
  const css = await cssDe(new URL("novo.css", base).href);
  return !!css && !css.includes("../assets/");
}

export async function prepararHtml(html, { base }) {
  // mesma troca que tools/publicar.py faz no index.html publicado
  if (await ehPacote(base)) html = html.replaceAll("../vendor/", "vendor/").replaceAll("../assets/", "assets/");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const head = doc.head;
  // endereços relativos do site (assets/, ../vendor) resolvem como se a página estivesse em /novo/
  const b = doc.createElement("base");
  b.href = base;
  head.prepend(b);
  // CSS do site embutido e sem movimento
  const links = [...doc.querySelectorAll('link[rel="stylesheet"]')];
  const textos = await Promise.all(links.map((l) => cssDe(new URL(l.getAttribute("href"), base).href)));
  links.forEach((l, i) => {
    const s = doc.createElement("style");
    s.setAttribute("data-de", l.getAttribute("href"));
    s.textContent = textos[i];
    l.replaceWith(s);
  });
  // barras fixas do site (botão de compra e seletor Premium/VIP) ficariam por cima do texto sendo editado
  const fixas = doc.createElement("style");
  fixas.textContent = ".barra-cta,.troca-ingresso{display:none!important}";
  head.append(fixas);
  // pré-carregamentos da animação do hero não servem para a prévia
  doc.querySelectorAll('link[rel="preload"][as="fetch"]').forEach((l) => l.remove());
  // o mapa do Google pesa e não é editável: fica uma moldura cinza no lugar
  doc.querySelectorAll("iframe").forEach((f) => { f.setAttribute("src", "about:blank"); f.setAttribute("data-previa-sem-mapa", ""); });
  // o JSON-LD e o manifesto não interessam aqui
  doc.querySelectorAll('link[rel="manifest"]').forEach((l) => l.remove());
  const html2 = "<!doctype html>\n" + doc.documentElement.outerHTML;
  // o calço entra como primeiro filho do <head>, antes de qualquer outro script
  return html2.replace(/<head([^>]*)>/i, (m) => m + CALCO);
}

/* Duas molduras alternadas. mostrar(html, ancora) devolve a janela e o documento novos quando visíveis. */
export function criarPrevia(caixa, { aoCarregar, estilo }) {
  const molduras = [0, 1].map(() => {
    const f = document.createElement("iframe");
    f.className = "previa__moldura";
    f.title = "Prévia da página";
    f.setAttribute("tabindex", "-1");
    caixa.append(f);
    return f;
  });
  let ativa = -1;
  let geracao = 0;

  async function mostrar(html, { ancora, estado } = {}) {
    const minha = ++geracao;
    const proxima = ativa === -1 ? 0 : 1 - ativa;
    const f = molduras[proxima];
    const velha = ativa >= 0 ? molduras[ativa] : null;
    const docVelho = velha?.contentDocument;
    // onde estava: a âncora (o elemento que a pessoa mexeu) na mesma altura da tela, ou a mesma rolagem
    let alvo = null;
    if (docVelho) {
      const y = velha.contentWindow.scrollY;
      const el = ancora ? docVelho.querySelector(ancora) : null;
      alvo = { y, ancora, topo: el ? el.getBoundingClientRect().top : null };
    }
    await new Promise((ok) => {
      f.onload = () => ok();
      f.srcdoc = html;
    });
    if (minha !== geracao) return null;
    const win = f.contentWindow, doc = f.contentDocument;
    if (estilo) {
      const s = doc.createElement("style");
      s.textContent = estilo;
      doc.head.append(s);
    }
    // espera as fontes e duas pinturas: o layout do site precisa estar assentado antes de rolar
    try { await Promise.race([doc.fonts.ready, new Promise((r) => setTimeout(r, 800))]); } catch { /* sem fonts API */ }
    await new Promise((r) => win.requestAnimationFrame(() => win.requestAnimationFrame(r)));
    if (minha !== geracao) return null;
    aoCarregar?.(win, doc, estado);
    // as fotos que vão aparecer na tela já decodificadas antes da troca (sem piscar foto vazia)
    try {
      const alvoY = alvo ? alvo.y : 0;
      const visiveis = [...doc.images].filter((im) => { const r = im.getBoundingClientRect(); return r.bottom + win.scrollY > alvoY - 200 && r.top + win.scrollY < alvoY + win.innerHeight + 200; });
      await Promise.race([Promise.allSettled(visiveis.map((im) => (im.loading = "eager", im.decode()))), new Promise((r) => setTimeout(r, 900))]);
    } catch { /* sem decode */ }
    if (minha !== geracao) return null;
    if (alvo) {
      const el = alvo.ancora ? doc.querySelector(alvo.ancora) : null;
      if (el && alvo.topo != null) win.scrollTo(0, win.scrollY + el.getBoundingClientRect().top - alvo.topo);
      else win.scrollTo(0, alvo.y);
    }
    f.classList.add("previa__moldura--ativa");
    f.setAttribute("tabindex", "0");
    if (velha) {
      velha.classList.remove("previa__moldura--ativa");
      velha.setAttribute("tabindex", "-1");
      velha.srcdoc = "<!doctype html><title>.</title>";
    }
    ativa = proxima;
    return { win, doc, moldura: f };
  }

  return {
    mostrar,
    get moldura() { return ativa >= 0 ? molduras[ativa] : null; },
    get doc() { return ativa >= 0 ? molduras[ativa].contentDocument : null; },
    get win() { return ativa >= 0 ? molduras[ativa].contentWindow : null; },
  };
}
