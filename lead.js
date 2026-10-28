/* O pop-up de acesso: todo botão "Garantir meu acesso" abre este cadastro curto antes do WhatsApp.
   Nome completo, WhatsApp (com a bandeira e o código do país) e e-mail; o navegador preenche o que já sabe.
   Ao enviar: o lead vai para o sistema do cliente (data-webhook) e o pop-up confirma que o especialista vai chamar
   a pessoa no WhatsApp; ela não é levada a lugar nenhum. Sem script, o botão continua indo direto ao WhatsApp. */
(function () {
  "use strict";

  var dialogo = document.getElementById("acesso");
  if (!dialogo || typeof dialogo.showModal !== "function") return;

  // endereço que recebe o lead (POST com JSON), no atributo data-webhook do pop-up no index.html.
  // Vazio: o lead não é enviado e só o WhatsApp abre
  var WEBHOOK = dialogo.getAttribute("data-webhook") || "";

  var form = dialogo.querySelector(".acesso__form");
  var campoNome = form.elements.nome;
  var campoEmail = form.elements.email;
  var campoTelefone = form.elements.telefone;
  var botaoPais = dialogo.querySelector(".acesso__pais");
  var bandeira = botaoPais.querySelector(".acesso__bandeira");
  var ddiTexto = botaoPais.querySelector(".acesso__ddi");
  var lista = dialogo.querySelector(".acesso__lista");
  var busca = lista.querySelector(".acesso__busca");
  var ul = lista.querySelector("ul");
  var enviar = dialogo.querySelector(".acesso__enviar");
  var enviarTexto = enviar.querySelector("span");
  var numeroFinal = dialogo.querySelector(".acesso__numero");
  var listaEmail = document.getElementById("acesso-dominios");
  var dica = dialogo.querySelector(".acesso__dica");
  var origem = null, ingresso = "", gatilho = null;
  var enviando = false, jaEnviado = false;

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // ------------------------------------------------------------ os países: bandeira desenhada em SVG (o Windows não
  // mostra bandeira em emoji), código de discagem e, no Brasil, a máscara com DDD
  function faixas(cores, vertical) {
    var n = cores.length, s = "";
    cores.forEach(function (c, i) {
      s += vertical
        ? '<rect x="' + (30 / n * i) + '" width="' + (30 / n + 0.2) + '" height="20" fill="' + c + '"/>'
        : '<rect y="' + (20 / n * i) + '" width="30" height="' + (20 / n + 0.2) + '" fill="' + c + '"/>';
    });
    return s;
  }
  var EUA = (function () {
    var s = '<rect width="30" height="20" fill="#b22234"/>';
    for (var i = 1; i < 13; i += 2) s += '<rect y="' + (20 / 13 * i) + '" width="30" height="' + (20 / 13) + '" fill="#fff"/>';
    return s + '<rect width="13" height="10.77" fill="#3c3b6e"/>';
  })();
  var PAISES = [
    { iso: "BR", nome: "Brasil", ddi: "55", svg: '<rect width="30" height="20" fill="#009c3b"/><path d="M15 2.2 27.6 10 15 17.8 2.4 10z" fill="#ffdf00"/><circle cx="15" cy="10" r="4.6" fill="#002776"/><path d="M10.5 9.1c3-.9 6.2-.4 8.9 1.5" fill="none" stroke="#fff" stroke-width=".9"/>' },
    { iso: "PT", nome: "Portugal", ddi: "351", svg: '<rect width="30" height="20" fill="#da291c"/><rect width="12" height="20" fill="#046a38"/><circle cx="12" cy="10" r="3.6" fill="#ffe900"/><rect x="10.4" y="8.2" width="3.2" height="3.8" rx=".6" fill="#fff" stroke="#da291c" stroke-width=".8"/>' },
    { iso: "US", nome: "Estados Unidos", ddi: "1", svg: EUA },
    { iso: "AR", nome: "Argentina", ddi: "54", svg: faixas(["#74acdf", "#fff", "#74acdf"]) + '<circle cx="15" cy="10" r="1.8" fill="#f6b40e"/>' },
    { iso: "PY", nome: "Paraguai", ddi: "595", svg: faixas(["#d52b1e", "#fff", "#0038a8"]) + '<circle cx="15" cy="10" r="1.6" fill="none" stroke="#1b7b3a" stroke-width=".6"/>' },
    { iso: "UY", nome: "Uruguai", ddi: "598", svg: faixas(["#fff", "#0038a8", "#fff", "#0038a8", "#fff", "#0038a8", "#fff", "#0038a8", "#fff"]) + '<rect width="11" height="11.2" fill="#fff"/><circle cx="5.5" cy="5.6" r="2.6" fill="#fcd116"/>' },
    { iso: "CL", nome: "Chile", ddi: "56", svg: '<rect width="30" height="20" fill="#d52b1e"/><rect width="30" height="10" fill="#fff"/><rect width="10" height="10" fill="#0039a6"/><circle cx="5" cy="5" r="1.6" fill="#fff"/>' },
    { iso: "CO", nome: "Colômbia", ddi: "57", svg: '<rect width="30" height="20" fill="#ce1126"/><rect width="30" height="15" fill="#003893"/><rect width="30" height="10" fill="#fcd116"/>' },
    { iso: "MX", nome: "México", ddi: "52", svg: faixas(["#006847", "#fff", "#ce1126"], true) + '<circle cx="15" cy="10" r="1.8" fill="#8c5a2b"/>' },
    { iso: "ES", nome: "Espanha", ddi: "34", svg: '<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>' },
    { iso: "IT", nome: "Itália", ddi: "39", svg: faixas(["#009246", "#fff", "#ce2b37"], true) },
    { iso: "FR", nome: "França", ddi: "33", svg: faixas(["#0055a4", "#fff", "#ef4135"], true) },
    { iso: "DE", nome: "Alemanha", ddi: "49", svg: faixas(["#000", "#dd0000", "#ffce00"]) },
    { iso: "GB", nome: "Reino Unido", ddi: "44", svg: '<rect width="30" height="20" fill="#012169"/><path d="M0 0l30 20M30 0 0 20" stroke="#fff" stroke-width="4"/><path d="M0 0l30 20M30 0 0 20" stroke="#c8102e" stroke-width="1.4"/><path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6"/><path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.4"/>' },
    { iso: "XX", nome: "Outro país", ddi: "", svg: '<rect width="30" height="20" fill="#eef1ee"/><circle cx="15" cy="10" r="6" fill="none" stroke="#1c3a37" stroke-width="1"/><path d="M9 10h12M15 4c-2.6 3.4-2.6 8.6 0 12M15 4c2.6 3.4 2.6 8.6 0 12" fill="none" stroke="#1c3a37" stroke-width=".9"/>' }
  ];
  function desenho(p) { return '<svg viewBox="0 0 30 20" width="22" height="15">' + p.svg + "</svg>"; }
  var porIso = {};
  PAISES.forEach(function (p) {
    porIso[p.iso] = p;
    var li = document.createElement("li");
    li.id = "acesso-pais-" + p.iso;
    li.setAttribute("role", "option");
    li.setAttribute("aria-selected", "false");
    li.dataset.iso = p.iso;
    li.innerHTML = '<span class="acesso__bandeira" aria-hidden="true">' + desenho(p) + "</span>" +
      '<span class="acesso__pais-nome">' + p.nome + "</span>" +
      '<span class="acesso__pais-ddi">' + (p.ddi ? "+" + p.ddi : "") + "</span>";
    p.li = li;
    ul.appendChild(li);
  });
  var pais = porIso.BR;

  function mostrarPais(p) {
    if (pais.li) pais.li.setAttribute("aria-selected", "false");
    pais = p;
    p.li.setAttribute("aria-selected", "true");
    bandeira.innerHTML = desenho(p);
    ddiTexto.textContent = p.ddi ? "+" + p.ddi : "+";
    botaoPais.setAttribute("aria-label", "País do telefone: " + p.nome + (p.ddi ? ", +" + p.ddi : ""));
    campoTelefone.placeholder = p.iso === "BR" ? "(11) 91234-5678" : p.ddi ? "Número com código de área" : "+ código do país e número";
  }

  // ------------------------------------------------------------ a lista de países: abre sob a caixa do telefone,
  // com busca por nome ou código, setas para andar e Enter para escolher
  var ativo = null;
  var toque = !window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  function semAcento(s) { return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); }
  function visiveis() { return Array.prototype.filter.call(ul.children, function (li) { return !li.hidden; }); }
  function marcarAtivo(li) {
    if (ativo) ativo.classList.remove("ativo");
    ativo = li || null;
    if (ativo) {
      ativo.classList.add("ativo");
      // a busca (teclado) e a lista (celular, onde o foco vai para ela) anunciam a opção ativa
      busca.setAttribute("aria-activedescendant", ativo.id);
      ul.setAttribute("aria-activedescendant", ativo.id);
      ativo.scrollIntoView({ block: "nearest" });
    } else {
      busca.removeAttribute("aria-activedescendant");
      ul.removeAttribute("aria-activedescendant");
    }
  }
  function filtrar() {
    var q = semAcento(busca.value.trim()), n = q.replace(/\D/g, "");
    Array.prototype.forEach.call(ul.children, function (li) {
      var p = porIso[li.dataset.iso];
      var bate = !q || semAcento(p.nome).indexOf(q) >= 0 || (n && p.ddi.indexOf(n) === 0) || p.iso === "XX";
      li.hidden = !bate;
    });
    var v = visiveis();
    marcarAtivo(v.indexOf(pais.li) >= 0 && !q ? pais.li : v[0]);
  }
  function abrirLista() {
    lista.hidden = false;
    botaoPais.setAttribute("aria-expanded", "true");
    busca.setAttribute("aria-expanded", "true");
    busca.value = "";
    filtrar();
    marcarAtivo(pais.li);
    // no celular o teclado não sobe sozinho: a pessoa rola a lista ou toca na busca se quiser
    (toque ? ul : busca).focus({ preventScroll: true });
  }
  function fecharLista(foca) {
    if (lista.hidden) return;
    lista.hidden = true;
    botaoPais.setAttribute("aria-expanded", "false");
    busca.setAttribute("aria-expanded", "false");
    if (foca) botaoPais.focus({ preventScroll: true });
  }
  function escolher(p) {
    mostrarPais(p);
    fecharLista(false);
    formatarTelefone();
    campoTelefone.focus({ preventScroll: true });
  }
  ul.tabIndex = -1;
  botaoPais.addEventListener("click", function () { if (lista.hidden) abrirLista(); else fecharLista(true); });
  busca.addEventListener("input", filtrar);
  function teclas(e) {
    var v = visiveis(), i = v.indexOf(ativo);
    if (e.key === "ArrowDown") { e.preventDefault(); marcarAtivo(v[Math.min(v.length - 1, i + 1)]); }
    else if (e.key === "ArrowUp") { e.preventDefault(); marcarAtivo(v[Math.max(0, i - 1)]); }
    else if (e.key === "Enter") { e.preventDefault(); if (ativo) escolher(porIso[ativo.dataset.iso]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); fecharLista(true); }
    else if (e.key === "Tab") fecharLista(false);
  }
  busca.addEventListener("keydown", teclas);
  ul.addEventListener("keydown", teclas);
  ul.addEventListener("click", function (e) {
    var li = e.target.closest("li");
    if (li) escolher(porIso[li.dataset.iso]);
  });
  // toque ou clique fora da lista fecha
  dialogo.addEventListener("pointerdown", function (e) {
    if (!lista.hidden && !lista.contains(e.target) && !botaoPais.contains(e.target)) fecharLista(false);
  });

  // ------------------------------------------------------------ abrir e fechar
  function abrir(link) {
    gatilho = link;
    origem = link.closest("section, .barra-cta, footer");
    // vindo da escolha do nível de acesso, o pop-up já sabe qual ingresso a pessoa estava olhando
    var aba = link.closest("#ingressos") && document.querySelector('.chave[aria-selected="true"]');
    ingresso = aba ? aba.dataset.ingresso : "";
    // depois de um envio com sucesso o pop-up reabre na confirmação: o mesmo lead não é enviado duas vezes
    dialogo.classList.remove("falha");
    if (!jaEnviado) dialogo.classList.remove("enviado");
    fecharLista(false);
    dialogo.showModal();
    document.documentElement.classList.add("acesso-aberto");
    if (jaEnviado) {
      setTimeout(function () { dialogo.querySelector(".acesso__passo--fim .acesso__titulo").focus({ preventScroll: true }); }, 60);
      return;
    }
    // o primeiro campo vazio recebe o foco (o navegador costuma ter o nome guardado)
    var vazio = [campoNome, campoTelefone, campoEmail].filter(function (c) { return !c.value; })[0] || campoNome;
    setTimeout(function () { vazio.focus(); }, 60);
  }

  function fechar() {
    dialogo.classList.add("saindo");
    setTimeout(function () {
      dialogo.classList.remove("saindo");
      dialogo.close();
    }, 220);
  }

  dialogo.addEventListener("close", function () {
    document.documentElement.classList.remove("acesso-aberto");
    if (gatilho) gatilho.focus({ preventScroll: true });
  });

  document.addEventListener("click", function (e) {
    var link = e.target.closest && e.target.closest('a.botao[href^="https://wa.me/"]');
    if (!link || link.closest("#acesso")) return;
    e.preventDefault();
    abrir(link);
  });

  dialogo.querySelector(".acesso__fechar").addEventListener("click", fechar);
  // clique no fundo escuro fecha; clique dentro do painel não
  dialogo.addEventListener("click", function (e) { if (e.target === dialogo) fechar(); });
  dialogo.addEventListener("cancel", function (e) {
    e.preventDefault();
    // Esc com a lista de países aberta fecha só a lista
    if (!lista.hidden) { fecharLista(true); return; }
    fechar();
  });
  dialogo.querySelector(".acesso__voltar").addEventListener("click", fechar);
  var tentar = dialogo.querySelector(".acesso__tentar");
  tentar.addEventListener("click", function () {
    if (enviando) return;
    dialogo.classList.remove("falha");
    mandar();
  });

  // ------------------------------------------------------------ telefone: o código do país vira bandeira, o resto ganha máscara
  function digitos(v) { return v.replace(/\D/g, ""); }

  // o navegador costuma preencher o número inteiro, com +55 ou outro código: o código muda a bandeira e sai do campo
  function separarCodigo() {
    var v = campoTelefone.value.trim(), d = digitos(v);
    var comCodigo = /^\+/.test(v) || /^00/.test(v) || (pais.iso === "BR" && /^55\d{10,11}$/.test(d));
    if (!comCodigo) return;
    if (/^00/.test(v)) d = d.slice(2);
    var achado = PAISES.filter(function (p) { return p.ddi && d.indexOf(p.ddi) === 0; })
      .sort(function (a, b) { return b.ddi.length - a.ddi.length; })[0];
    if (achado) {
      mostrarPais(achado);
      campoTelefone.value = d.slice(achado.ddi.length);
    } else if (pais.iso !== "XX") {
      mostrarPais(porIso.XX);
      campoTelefone.value = "+" + d;
    }
  }

  function formatarTelefone() {
    var v = campoTelefone.value, d = digitos(v);
    if (pais.iso === "XX") {
      campoTelefone.value = d ? "+" + d.slice(0, 15) : (/^\s*\+/.test(v) ? "+" : "");
    } else if (pais.iso === "BR") {
      d = d.slice(0, 11);
      var f = d;
      if (d.length > 2) f = "(" + d.slice(0, 2) + ") " + d.slice(2);
      if (d.length > 6) f = "(" + d.slice(0, 2) + ") " + d.slice(2, d.length - 4) + "-" + d.slice(d.length - 4);
      campoTelefone.value = f;
    } else if (pais.iso === "US") {
      // EUA e Canadá (+1): (415) 555-0100; o número nacional nunca começa com 1
      if (d.length === 11 && d.charAt(0) === "1") d = d.slice(1);
      d = d.slice(0, 10);
      var u = d;
      if (d.length > 3) u = "(" + d.slice(0, 3) + ") " + d.slice(3);
      if (d.length > 6) u = "(" + d.slice(0, 3) + ") " + d.slice(3, 6) + "-" + d.slice(6);
      campoTelefone.value = u;
    } else {
      // Reino Unido, França e Alemanha discam um 0 antes do número dentro do país; com o código do país ele cai
      if (TRONCO[pais.iso] && d.charAt(0) === "0") d = d.slice(1);
      campoTelefone.value = agrupar(d.slice(0, 14), GRUPOS[pais.iso] || GRUPOS_3);
    }
  }

  // tamanhos dos grupos de dígitos do número nacional; o último grupo aceita o que sobrar. Os outros países seguem em grupos de 3
  var GRUPOS = { PT: [3, 3, 3], ES: [3, 3, 3], GB: [4, 6], FR: [1, 2, 2, 2, 2], IT: [3, 3, 4], DE: [3, 4, 4] };
  var GRUPOS_3 = [3, 3, 3, 3, 3];
  var TRONCO = { GB: 1, FR: 1, DE: 1 };
  function agrupar(d, grupos) {
    var partes = [], i = 0;
    for (var g = 0; g < grupos.length && i < d.length; g++) {
      var ultimo = g === grupos.length - 1;
      partes.push(ultimo ? d.slice(i) : d.slice(i, i + grupos[g]));
      i += grupos[g];
    }
    return partes.join(" ");
  }

  campoTelefone.addEventListener("input", function () {
    marcarErro(campoTelefone, false);
    separarCodigo();
    formatarTelefone();
  });

  function validoTelefone() {
    var d = digitos(campoTelefone.value);
    if (pais.iso === "BR") return d.length === 10 || d.length === 11;
    if (pais.iso === "XX") return d.length >= 8;
    return d.length >= 6;
  }

  // ------------------------------------------------------------ e-mail: os domínios mais comuns completam o endereço
  var DOMINIOS = ["gmail.com", "hotmail.com", "outlook.com", "icloud.com", "yahoo.com.br", "yahoo.com", "live.com",
    "uol.com.br", "bol.com.br", "terra.com.br", "globo.com", "me.com"];
  function validoEmail() { return EMAIL.test(campoEmail.value.trim()); }
  function sugerirDominios() {
    var v = campoEmail.value.trim(), i = v.indexOf("@");
    var opcoes = [];
    if (i > 0 && v.indexOf("@", i + 1) < 0) {
      var nome = v.slice(0, i), parte = v.slice(i + 1).toLowerCase();
      opcoes = DOMINIOS.filter(function (d) { return d.indexOf(parte) === 0 && d !== parte; }).slice(0, 5)
        .map(function (d) { return nome + "@" + d; });
    }
    listaEmail.innerHTML = opcoes.map(function (o) { return '<option value="' + o.replace(/"/g, "&quot;") + '"></option>'; }).join("");
  }
  // erro de digitação no domínio (gmial.com, hotmial.com): sugere a correção com um toque
  var ERROS = { "gmial.com": "gmail.com", "gmal.com": "gmail.com", "gamil.com": "gmail.com", "gmail.co": "gmail.com",
    "gmail.con": "gmail.com", "gnail.com": "gmail.com", "hotmial.com": "hotmail.com", "hotmal.com": "hotmail.com",
    "hotmail.co": "hotmail.com", "hotmail.con": "hotmail.com", "outlok.com": "outlook.com", "outlook.con": "outlook.com",
    "icloud.co": "icloud.com", "icoud.com": "icloud.com", "yaho.com.br": "yahoo.com.br", "yahoo.com.b": "yahoo.com.br" };
  function conferirDominio() {
    var v = campoEmail.value.trim(), i = v.lastIndexOf("@");
    var certo = i > 0 ? ERROS[v.slice(i + 1).toLowerCase()] : null;
    dica.hidden = !certo;
    if (certo) {
      var sugestao = v.slice(0, i + 1) + certo;
      dica.querySelector("b").textContent = sugestao;
      dica.dataset.valor = sugestao;
    }
  }
  dica.addEventListener("click", function () {
    campoEmail.value = dica.dataset.valor;
    dica.hidden = true;
    campoEmail.focus();
  });
  campoEmail.addEventListener("input", function () {
    marcarErro(campoEmail, false);
    sugerirDominios();
    dica.hidden = true;
  });
  campoEmail.addEventListener("blur", conferirDominio);

  // ------------------------------------------------------------ nome completo: nome e sobrenome no mesmo campo
  function partesNome() {
    return campoNome.value.trim().replace(/\s+/g, " ").split(" ").filter(Boolean);
  }
  campoNome.addEventListener("input", function () { marcarErro(campoNome, false); });

  function marcarErro(campo, erro) {
    campo.closest(".acesso__campo").classList.toggle("erro", erro);
    campo.setAttribute("aria-invalid", erro ? "true" : "false");
    // o leitor de tela só ganha a descrição quando o erro está à vista (o texto escondido ainda seria lido)
    var idErro = campo === campoTelefone ? "acesso-erro-tel" : "acesso-erro-" + campo.name;
    if (erro) campo.setAttribute("aria-describedby", idErro); else campo.removeAttribute("aria-describedby");
  }

  // ------------------------------------------------------------ enviar: lead para o sistema, conversa no WhatsApp
  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (form.elements.site.value) return; // campo escondido: só robô preenche
    if (enviando || jaEnviado) return;
    var erros = [];
    if (partesNome().length < 2) erros.push(campoNome);
    if (!validoTelefone()) erros.push(campoTelefone);
    if (!validoEmail()) erros.push(campoEmail);
    [campoNome, campoTelefone, campoEmail].forEach(function (c) { marcarErro(c, erros.indexOf(c) >= 0); });
    if (erros.length) { erros[0].focus(); return; }

    var partes = partesNome();
    var nomeCompleto = partes.join(" ");
    ultimoLead = {
      id: (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()),
      nome_completo: nomeCompleto,
      nome: partes[0],
      sobrenome: partes.slice(1).join(" "),
      email: campoEmail.value.trim(),
      telefone: (pais.ddi ? "+" + pais.ddi + " " : "") + campoTelefone.value.trim(),
      telefone_e164: "+" + (pais.ddi || "") + digitos(campoTelefone.value),
      pais: pais.iso === "XX" ? null : pais.iso,
      ingresso: ingresso || null,
      origem: origem ? (origem.id || origem.className.split(" ")[0]) : null,
      pagina: location.href,
      utm: utm(),
      criado_em: new Date().toISOString()
    };
    mandar();
  });

  // o lead vai para o sistema do cliente; a confirmação só aparece quando ele responde que recebeu.
  // A mesma id segue nas novas tentativas, para o sistema não criar o lead duas vezes
  var ultimoLead = null;
  function enviarLead(lead) {
    if (!WEBHOOK) {
      if (window.console) console.warn("lead.js: data-webhook vazio no index.html; o lead não foi enviado", lead);
      return Promise.resolve();
    }
    // o Clint lê os campos pelo nome exato, com maiúsculas: Nome, Email, telefone (+DDI e número: sem o +, o Clint põe +55 na frente de tudo) e as UTMs
    var corpo = { Nome: lead.nome_completo, Email: lead.email, telefone: "+" + lead.telefone_e164.replace(/\D/g, "") };
    for (var k in lead.utm) corpo[k] = lead.utm[k];
    // o webhook do Clint não libera chamadas de outros sites (CORS): vai como envio simples, que o navegador não bloqueia,
    // mas cuja resposta não pode ser lida. A confirmação aparece quando o envio chega ao servidor; falha de rede mostra o erro
    return fetch(WEBHOOK, { method: "POST", mode: "no-cors", keepalive: true, headers: { "Content-Type": "text/plain;charset=UTF-8" }, body: JSON.stringify(corpo) });
  }
  function mandar() {
    if (enviando) return;
    enviando = true;
    enviar.disabled = true;
    tentar.disabled = true;
    enviarTexto.textContent = "Enviando…";
    enviarLead(ultimoLead).then(function () {
      numeroFinal.textContent = ultimoLead.telefone;
      jaEnviado = true;
      dialogo.classList.add("enviado");
      dialogo.querySelector(".acesso__passo--fim .acesso__titulo").focus({ preventScroll: true });
    }, function () {
      dialogo.classList.add("falha");
      dialogo.querySelector(".acesso__passo--falha .acesso__titulo").focus({ preventScroll: true });
    }).then(function () {
      enviando = false;
      tentar.disabled = false;
      enviar.disabled = false;
      enviarTexto.textContent = "Garantir meu acesso";
    });
  }

  function utm() {
    var p = new URLSearchParams(location.search), o = {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"].forEach(function (k) { if (p.get(k)) o[k] = p.get(k); });
    return o;
  }

  mostrarPais(porIso.BR);
})();
