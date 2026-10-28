/* Painel do Clube: entrar, lista de edições, nova edição a partir de outra, o editor na própria página (editor.js)
   e a publicação acompanhada pela tabela publicacoes. ES modules, sem build. Depende de window.supabase (UMD). */
import { $, h, aviso, anunciar, local, quando, datasPorExtenso, slugificar, msgDeErro, botaoCarregando, dialogo, confirmar, campoSimples, dialogoAberto } from "./ui.js";
import { abrirEditor } from "./editor.js";

const SB_URL = "https://xfylbdxeciujemyavbaq.supabase.co";
const CONFIG = {
  url: SB_URL,
  // chave pública (publishable): feita para ir no navegador; o acesso real é decidido pelo RLS
  chave: "sb_publishable_GrGwrqg-z-51fDMsxBwOsg_GRxzA2We",
  bucket: "midia",
  schema: new URL("../conteudo/edicao.schema.json", location.href).href,
  renderizador: new URL("../render/renderizar.mjs", location.href).href,
  editorPlanta: new URL("./planta/planta.js", location.href).href,
  cssPlanta: new URL("./planta/planta.css", location.href).href,
  baseSite: new URL("../", location.href).href,
  site: "../",
  urlPublica: (c) => `${SB_URL}/storage/v1/object/public/midia/${String(c).split("/").map(encodeURIComponent).join("/")}`,
  intervaloPublicacao: 3000,
  publicacaoDemorada: 5 * 60 * 1000,
  publicacaoDesiste: 20 * 60 * 1000,
};
const RE_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

let sb = null;
let usuario = null;
let editor = null; // editor aberto (editor.js)

const main = () => $("#conteudo");

function trocarTela(...nos) {
  const m = main();
  m.replaceChildren(...nos);
  window.scrollTo(0, 0);
  const alvo = m.querySelector("h1");
  if (alvo) { alvo.setAttribute("tabindex", "-1"); alvo.focus({ preventScroll: true }); }
}

/* ------------------------------------------------------------ schema e renderizador (carregados uma vez) */
let schemaP = null, renderP = null;
function carregarSchema() {
  schemaP ??= fetch(CONFIG.schema, { cache: "no-cache" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  return schemaP;
}
// o módulo da Frente A: o import já carrega o Nunjucks, o modelo e o schema (await no topo)
function carregarRenderizador() {
  renderP ??= (async () => {
    const m = await import(CONFIG.renderizador);
    for (const k of ["preparar", "carregar", "iniciar"]) if (typeof m[k] === "function") { await m[k](); break; }
    const f = m.renderizar || m.default;
    if (typeof f !== "function") throw new Error("renderizar() não encontrado");
    return m;
  })();
  renderP.catch(() => { renderP = null; });
  return renderP;
}

/* ------------------------------------------------------------ telas de entrada */
function telaEntradaBase(...conteudo) {
  document.body.dataset.tela = "entrada";
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
    const emailOk = /^\S+@\S+\.\S+$/.test(ve);
    email.erro(!ve ? "Informe seu e-mail." : !emailOk ? "Confira o e-mail: falta algo como nome@empresa.com.br." : "");
    senha.erro(!vs ? "Informe sua senha." : "");
    if (!ve || !vs || !emailOk) { (!ve || !emailOk ? email.entrada : senha.entrada).focus(); return; }
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
    h("p", { class: "entrada__sub", text: "Entre para mudar textos, fotos, datas e ingressos do site." }),
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
  if (rotaAtual?.tela === "editor" && !(r.tela === "editor" && r.id === rotaAtual.id) && editor) {
    if (editor.pendente) {
      // sai só depois de salvar; se não der, pergunta
      const ok = await editor.salvarAgora();
      if (!ok && !(await confirmar("Sair sem salvar?", "A última mudança não chegou ao servidor. Ela fica guardada neste aparelho e volta quando você abrir a edição de novo.", "Sair assim mesmo", "botao--perigo"))) {
        ignorarProximaRota = true;
        location.hash = "#/edicao/" + rotaAtual.id;
        return;
      }
    }
    editor.fechar();
    editor = null;
  }
  rotaAtual = r;
  if (r.tela === "editor") telaEditor(r.id);
  else telaLista();
}

window.addEventListener("hashchange", aoMudarRota);
window.addEventListener("unhandledrejection", (e) => {
  console.warn("painel: falha não tratada", e.reason);
  aviso("Algo falhou na comunicação com o servidor. Tente de novo; se continuar, recarregue a página.", "erro");
});

function entrar(sessao) {
  usuario = sessao?.user || null;
  if (!usuario) return telaLogin();
  retomarPublicacao();
  rotaAtual = null;
  aoMudarRota();
}

/* ------------------------------------------------------------ lista de edições */
function datasDaEdicao(dados) {
  const dias = dados?.datas?.dias;
  return Array.isArray(dias) ? datasPorExtenso(dias.map((d) => d?.data).filter(Boolean)) : "";
}

async function telaLista() {
  document.body.dataset.tela = "lista";
  $("#topo").hidden = false;
  trocarTela(h("div", { class: "carregando" }, h("span", { class: "giro", "aria-hidden": "true" }), "Carregando edições…"));
  carregarRenderizador().catch(() => {}); // adianta o editor
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
        h("p", { class: "pagina__sub", text: "Cada edição é uma versão do site para um Clube. A marcada com “No site agora” é a que está no ar." }))),
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
  let novoId = null;
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
      novoId = data.id;
      return true;
    },
  });
  if (r === "criar" && novoId) {
    aviso("Edição criada. Agora é só mudar o que for diferente.");
    location.hash = "#/edicao/" + novoId;
  }
}

/* ------------------------------------------------------------ editor */
async function telaEditor(id) {
  document.body.dataset.tela = "editor";
  $("#topo").hidden = true;
  trocarTela(h("div", { class: "carregando" }, h("span", { class: "giro", "aria-hidden": "true" }), "Abrindo edição…"));
  let q, schema, R, erroRender = null;
  [q, schema, R] = await Promise.all([
    sb.from("edicoes").select("id,slug,nome,ativa,dados,atualizado_em,atualizado_por").eq("id", id).maybeSingle(),
    carregarSchema(),
    carregarRenderizador().catch((e) => { erroRender = e; return null; }),
  ]);
  if (rota().id !== id) return;
  if (q.error || !q.data || !R) {
    $("#topo").hidden = false;
    const texto = !R ? "Não foi possível carregar a prévia da página. Recarregue; se continuar, avise o suporte técnico." + (erroRender ? ` (${erroRender.message})` : "")
      : q.error ? "Não foi possível abrir esta edição. " + msgDeErro(q.error)
      : "Esta edição não existe mais ou você não tem acesso a ela.";
    trocarTela(h("div", { class: "pagina" }, h("a", { class: "voltar", href: "#/", text: "← Todas as edições" }), h("h1", { class: "pagina__titulo", text: "Edição" }),
      h("div", { class: "erro-tela", role: "alert" }, h("p", { text: texto }),
        h("button", { type: "button", class: "botao", text: "Tentar de novo", onclick: () => telaEditor(id) }))));
    return;
  }
  const linha = q.data;
  // dados num formato mais velho que o do renderizador: abrir assim quebraria a prévia (a conversão é feita fora do painel)
  const versaoModelo = R.SCHEMA_EDICAO?.properties?.versao?.const;
  if (versaoModelo != null && linha.dados?.versao !== versaoModelo) {
    $("#topo").hidden = false;
    trocarTela(h("div", { class: "pagina" }, h("a", { class: "voltar", href: "#/", text: "← Todas as edições" }), h("h1", { class: "pagina__titulo", text: linha.nome || "Edição" }),
      h("div", { class: "erro-tela", role: "alert" },
        h("p", { text: `Esta edição foi salva no formato antigo do painel (versão ${linha.dados?.versao ?? "?"}) e precisa ser convertida para a versão ${versaoModelo} antes de abrir no editor novo. Avise o suporte técnico; nada foi alterado.` }))));
    return;
  }
  // alterações que ficaram só neste aparelho (sessão caiu, sem internet)
  const rasc = local.ler("painel-rascunho:" + id);
  let recuperar = null;
  if (rasc?.dados && JSON.stringify(rasc.dados) !== JSON.stringify(linha.dados)) {
    const mudou = rasc.base !== linha.atualizado_em;
    const sim = await confirmar("Recuperar alterações deste aparelho?",
      [`Ficaram aqui alterações desta edição que não chegaram ao servidor (${quando(new Date(rasc.em).toISOString())}).`,
        mudou ? "Atenção: a edição foi salva depois disso, talvez por outra pessoa. Recuperar troca essa versão pelas suas alterações." : "Recupere para continuar de onde parou, ou descarte."],
      "Recuperar");
    if (sim) recuperar = rasc.dados; else local.apagar("painel-rascunho:" + id);
  }
  editor?.fechar();
  editor = abrirEditor({ sb, CONFIG, publicarEdicao, dialogoAberto: () => !!document.querySelector("#dialogo[open]") }, { linha, R, schema: R.SCHEMA_EDICAO || schema });
  main().replaceChildren(editor.raiz);
  editor.ao_montar();
  if (recuperar) editor.recuperar(recuperar);
}

/* ------------------------------------------------------------ publicar */
const pub = { id: null, timer: 0, inicio: 0, falhas: 0, edicaoId: null };

function faixa(tipo, partes) {
  const f = $("#faixa-publicacao");
  f.className = "faixa-publicacao" + (tipo ? " faixa-publicacao--" + tipo : "");
  f.replaceChildren(...partes);
  f.hidden = false;
}
function fecharFaixa() { $("#faixa-publicacao").hidden = true; }

// chamada pelo editor (com antes = salvar) ou pela faixa "Tentar de novo"
async function publicarEdicao(edicao, { antes, sujo, semConfirmar } = {}) {
  if (!edicao) return;
  if (pub.id && pub.timer) { aviso("Já existe uma publicação em andamento. Espere ela terminar."); return; }
  if (!semConfirmar) {
    const corpo = [h("p", null, "O site passa a mostrar a edição ", h("strong", { text: edicao.nome || edicao.slug }), " como está nesta prévia. Leva cerca de 1 a 2 minutos.")];
    if (!edicao.ativa) corpo.push("Ela substitui a edição que está no site agora.");
    if (!(await confirmar("Publicar no site?", corpo, "Publicar agora", "botao--ouro"))) return;
  }
  const botao = $("#publicar");
  if (botao) botaoCarregando(botao, true, "Publicando…");
  if (antes && sujo !== false) {
    const ok = await antes();
    if (!ok) {
      if (botao) botaoCarregando(botao, false, "Publicar");
      aviso("Não deu para salvar a última mudança. Confira a internet e tente publicar de novo.", "erro");
      return;
    }
  }
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
  if (!data?.publicacao_id) { faixaErro("A publicação não começou.", "O servidor não devolveu o número da publicação.", edicao); return; }
  edicao.ativa = true;
  editor?.marcarAtiva();
  acompanhar(data.publicacao_id, edicao);
}

async function erroDaFuncao(error) {
  const nome = error?.name || "";
  const resp = error?.context;
  const status = resp?.status;
  let corpo = null;
  if (resp && typeof resp.clone === "function") {
    try { corpo = await resp.clone().json(); } catch { try { corpo = { error: await resp.clone().text() }; } catch { /* sem corpo */ } }
  }
  const detalheServidor = corpo?.erro || corpo?.error || corpo?.message || corpo?.detalhe || "";
  if (nome === "FunctionsFetchError" || (!status && /fetch|network/i.test(String(error?.message)))) {
    return { titulo: "Sem conexão com o servidor.", detalhe: "Verifique a internet e tente de novo. Suas alterações estão salvas." };
  }
  if (status === 503) return { titulo: "A publicação ainda não está ligada.", detalhe: "Falta configurar a conexão do painel com o GitHub (onde o site é gerado). Suas alterações estão salvas; avise o suporte técnico." };
  if (status === 401 || status === 403) return { titulo: "Sua conta não tem permissão para publicar.", detalhe: "Peça para conferirem seu acesso ao painel." };
  if (status === 409) return { titulo: "Já existe uma publicação em andamento.", detalhe: "Espere ela terminar e publique de novo." };
  return { titulo: "Não foi possível começar a publicação.", detalhe: (status ? `Erro ${status}. ` : "") + (detalheServidor || String(error?.message || "")) };
}

function faixaErro(titulo, detalhe, edicao) {
  faixa("erro", [
    h("span", { class: "faixa-publicacao__texto" }, h("strong", { text: titulo }), detalhe ? h("span", { class: "faixa-publicacao__detalhe", text: detalhe }) : null),
    h("span", { class: "faixa-publicacao__acoes" },
      edicao ? h("button", { type: "button", class: "botao botao--pequeno", text: "Tentar de novo", onclick: () => { fecharFaixa(); publicarEdicao(edicao, { semConfirmar: true }); } }) : null,
      h("button", { type: "button", class: "botao botao--claro botao--pequeno", text: "Fechar", onclick: fecharFaixa })),
  ]);
}

function acompanhar(id, edicao, inicio = Date.now()) {
  clearTimeout(pub.timer);
  Object.assign(pub, { id, inicio, falhas: 0, edicaoId: edicao?.id });
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
        anunciar("Publicado.");
        if (rota().tela === "lista") telaLista();
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
    : "Você pode continuar mexendo" + (demorando ? " ou fechar o painel; a publicação continua." : ".");
  faixa(null, [h("span", { class: "giro", "aria-hidden": "true" }),
    h("span", { class: "faixa-publicacao__texto" }, h("strong", { text: titulo }), h("span", { class: "faixa-publicacao__detalhe", text: detalhe }))]);
}

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
let saindo = false;

async function iniciar() {
  if (!window.supabase?.createClient) {
    $("#carregando").replaceChildren(h("div", { class: "erro-tela", role: "alert" },
      h("p", { text: "Não foi possível carregar o painel. Verifique a internet e recarregue a página." }),
      h("button", { type: "button", class: "botao", text: "Recarregar", onclick: () => location.reload() })));
    return;
  }
  carregarSchema();
  const hash = location.hash;
  const params = new URLSearchParams(hash.replace(/^#\/?/, "") + "&" + location.search.slice(1));
  const ehRecuperacao = params.get("type") === "recovery";
  const erroLink = params.get("error_description") || params.get("error");

  sb = window.supabase.createClient(CONFIG.url, CONFIG.chave, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "implicit", storageKey: "painel-clube-auth" },
  });

  let recuperando = ehRecuperacao;
  sb.auth.onAuthStateChange((evento) => {
    setTimeout(() => {
      if (evento === "PASSWORD_RECOVERY") { recuperando = true; telaNovaSenha(); }
      else if (evento === "SIGNED_OUT") {
        if (saindo) { saindo = false; return; }
        usuario = null;
        clearTimeout(pub.timer); pub.timer = 0; pub.id = null;
        const guardado = editor?.pendente;
        editor?.fechar(); editor = null;
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
  clearTimeout(pub.timer); pub.timer = 0; pub.id = null;
  fecharFaixa();
  saindo = true;
  await sb.auth.signOut();
  usuario = null;
  history.replaceState(null, "", location.pathname + "#/");
  telaLogin({ mensagem: "Você saiu do painel." });
});

// para os testes automáticos: o editor aberto
Object.defineProperty(window, "__painel", { get: () => ({ editor }) });

iniciar();
