/* Seções abaixo do hero. Cada movimento está preso à rolagem e explica algo:
   a mesa acende um lugar por vez, os riscos cortam o que o Clube não é, a régua e a grade medem os números do Ênio,
   a régua mostra o dia passando, o filme toca quando aparece. Sem script ou com movimento reduzido,
   tudo já está no estado final. */
(function () {
  "use strict";

  var reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var temGsap = !!(window.gsap && window.ScrollTrigger);
  var anima = temGsap && !reduz;
  if (temGsap) gsap.registerPlugin(ScrollTrigger);
  var LARGO = "(min-width: 900px) and (min-aspect-ratio: 1/1)";
  function largo() { return window.matchMedia(LARGO).matches; }
  function limita(v, a, b) { return Math.max(a, Math.min(b, v)); }
  var NS = "http://www.w3.org/2000/svg";

  // ------------------------------------------------------------ sequência de quadros (obra e voo)
  // Rede: no máximo REDE pedidos ao mesmo tempo, na ordem de prioridade dada; foco(i) passa à frente da fila os
  // quadros a até RAIO do quadro atual. Os bytes de cada quadro ficam guardados (comprimidos) assim que chegam.
  // Memória: só os quadros a até RAIO do atual ficam decodificados; os que saem são fechados e, se a rolagem voltar,
  // decodificados de novo a partir dos bytes guardados, fora da thread principal (createImageBitmap). O quadro em uso
  // na tela nunca é fechado: a tela nunca fica vazia.
  function Sequencia(urls, ordem, aoMudar) {
    var REDE = 6, DECOD = 4, RAIO = 12;
    var n = urls.length, bytes = [], quadros = [], decodificando = [], fila = ordem.slice(), naRede = 0, nDecod = 0;
    var centro = 0, emUso = {}, morta = false;
    var temBitmap = typeof window.createImageBitmap === "function";

    function decodificar(blob) {
      if (temBitmap) {
        return createImageBitmap(blob).then(function (bmp) {
          return { im: bmp, w: bmp.width, h: bmp.height, fechar: function () { bmp.close(); } };
        });
      }
      // sem createImageBitmap (Safari antigo): uma imagem do próprio blob, decodificada antes de entrar
      return new Promise(function (ok, falha) {
        var url = URL.createObjectURL(blob), im = new Image();
        im.decoding = "async";
        im.onload = function () {
          var pronto = function () { ok({ im: im, w: im.naturalWidth, h: im.naturalHeight, fechar: function () { URL.revokeObjectURL(url); } }); };
          if (im.decode) im.decode().then(pronto, pronto); else pronto();
        };
        im.onerror = function () { URL.revokeObjectURL(url); falha(); };
        im.src = url;
      });
    }

    function naJanela(i) { return Math.abs(i - centro) <= RAIO; }

    // decodifica os quadros da janela que já chegaram, do mais perto para o mais longe; fecha os que saíram dela
    function cuidarMemoria() {
      if (morta) return;
      for (var k = 0; k < n; k++) {
        if (quadros[k] && !naJanela(k) && !emUso[k]) { quadros[k].fechar(); quadros[k] = null; }
      }
      for (var d = 0; d <= RAIO && nDecod < DECOD; d++) {
        [centro - d, centro + d].forEach(function (i) {
          if (i < 0 || i >= n || nDecod >= DECOD || !bytes[i] || quadros[i] || decodificando[i]) return;
          decodificando[i] = true;
          nDecod++;
          decodificar(bytes[i]).then(function (q) {
            decodificando[i] = false;
            nDecod--;
            if (morta || (!naJanela(i) && !emUso[i])) { q.fechar(); }
            else { quadros[i] = q; aoMudar(i); }
            cuidarMemoria();
          }, function () { decodificando[i] = false; nDecod--; cuidarMemoria(); });
        });
      }
    }

    function puxar() {
      while (!morta && naRede < REDE && fila.length) {
        (function (i) {
          naRede++;
          // prioridade baixa: os quadros nunca passam na frente do resto da página (navegador sem suporte ignora)
          fetch(urls[i], { priority: "low" }).then(function (r) {
            if (!r.ok) throw new Error(r.status);
            return r.blob();
          }).then(function (b) {
            bytes[i] = b;
            if (naJanela(i)) cuidarMemoria();
          }, function () {}).then(function () { naRede--; puxar(); });
        })(fila.shift());
      }
    }

    puxar();
    return {
      n: n,
      // o quadro decodificado mais perto de i (ou null)
      perto: function (i) {
        for (var d = 0; d < n; d++) {
          if (quadros[i - d]) return quadros[i - d];
          if (quadros[i + d]) return quadros[i + d];
        }
        return null;
      },
      quadro: function (i) { return quadros[i] || null; },
      indice: function (q) { return quadros.indexOf(q); },
      // os quadros desenhados agora: não saem da memória enquanto estiverem na tela
      usar: function (lista) {
        emUso = {};
        lista.forEach(function (q) { var k = quadros.indexOf(q); if (k >= 0) emUso[k] = 1; });
      },
      foco: function (f) {
        var c = limita(Math.round(f), 0, n - 1);
        if (c === centro) return;
        centro = c;
        // os que faltam perto do quadro atual passam à frente, do mais perto para o mais longe; o resto mantém a ordem
        var perto = [], resto = [];
        fila.forEach(function (i) { (naJanela(i) ? perto : resto).push(i); });
        perto.sort(function (a, b) { return Math.abs(a - c) - Math.abs(b - c); });
        fila = perto.concat(resto);
        cuidarMemoria();
      },
      matar: function () {
        morta = true;
        fila = [];
        quadros.forEach(function (q) { if (q) q.fechar(); });
        quadros = [];
      }
    };
  }

  // ------------------------------------------------------------ topo sólido e barra de compra fora do hero
  var topo = document.querySelector(".topo");
  var heroEl = document.querySelector(".hero");
  var barra = document.querySelector(".barra-cta");
  var ingressosEl = document.getElementById("ingressos");
  var conviteEl = document.getElementById("convite");
  var obraEl = document.getElementById("obra");
  var vooEl = document.getElementById("voo");
  function aoRolar() {
    var fimHero = heroEl.getBoundingClientRect().bottom;
    topo.classList.toggle("topo--solido", fimHero < topo.offsetHeight + 4);
    if (barra) {
      // a barra some onde a compra já está na tela
      var h = window.innerHeight;
      var ri = ingressosEl.getBoundingClientRect(), rc = conviteEl.getBoundingClientRect();
      var naCompra = (ri.top < h * 0.8 && ri.bottom > h * 0.2) || rc.top < h * 0.9;
      // no timelapse e no voo presos a tela é da imagem, com o texto embaixo: a barra sai da frente
      [obraEl, vooEl].forEach(function (el) {
        var r = el ? el.getBoundingClientRect() : null;
        if (r && r.top <= 1 && r.bottom >= h - 1) naCompra = true;
      });
      var mostra = fimHero < h * 0.3 && !naCompra;
      barra.classList.toggle("visivel", mostra);
      var link = barra.querySelector("a");
      if (link) link.tabIndex = mostra ? 0 : -1;
      barra.setAttribute("aria-hidden", mostra ? "false" : "true");
    }
  }
  window.addEventListener("scroll", aoRolar, { passive: true });
  window.addEventListener("resize", aoRolar);
  aoRolar();

  // ------------------------------------------------------------ entradas: subir de leve ao aparecer
  if (anima) {
    var entram = document.querySelectorAll(
      ".secao .lede:not(.mesa__lede), .manifesto__antes, .manifesto__apoio, .retrato, .nome, .bio," +
      " .metrica, .premio, .fatos, .convidados, .chaves, .ingresso," +
      " .linha .dia__agenda li, .local__grupo, .aeroportos, .convite__antes, .convite__acoes, .convite__quando"
    );
    entram.forEach(function (el) { el.classList.add("revela"); });
    ScrollTrigger.batch(entram, {
      start: "top 88%",
      once: true,
      onEnter: function (lote) {
        gsap.to(lote, { opacity: 1, y: 0, duration: 0.9, ease: "expo.out", stagger: 0.08, overwrite: true });
      }
    });

    // entradas próprias, no lugar do esmaecer de sempre
    // edição: as fotos abrem de dentro, como o filme logo acima
    var fotosEd = document.querySelectorAll(".edicao__fotos img");
    if (fotosEd.length) {
      gsap.set(fotosEd, { clipPath: "inset(22% 22% 22% 22%)", opacity: 0.4 });
      ScrollTrigger.create({
        trigger: ".edicao__fotos", start: "top 85%", once: true,
        onEnter: function () { gsap.to(fotosEd, { clipPath: "inset(0% 0% 0% 0%)", opacity: 1, duration: 1.1, ease: "expo.out", stagger: 0.12 }); }
      });
    }
    // o que o Clube faz: cada célula abre de dentro (como as fotos da edição), a foto assenta e o texto sobe logo depois,
    // na ordem de leitura; a foto corre devagar dentro da célula com a rolagem (um plano só)
    var celulas = Array.prototype.slice.call(document.querySelectorAll(".oque__celula"));
    if (celulas.length) {
      var textosDe = function (c) { return c.querySelectorAll(".oque__quando, .oque__verbo, .oque__texto, .oque__planos, .oque__ir"); };
      celulas.forEach(function (c) {
        gsap.set(c, { clipPath: "inset(12% 12% 12% 12%)" });
        gsap.set(textosDe(c), { opacity: 0, y: 28 });
        var img = c.querySelector(".oque__foto img");
        if (img) gsap.set(img, { scale: 1.2 });
      });
      ScrollTrigger.batch(celulas, {
        start: "top 85%", once: true,
        onEnter: function (lote) {
          lote.forEach(function (c, i) {
            var atraso = i * 0.12;
            // o recorte sai no fim: com ele a borda de foco da célula ficaria cortada
            gsap.to(c, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.9, ease: "expo.out", delay: atraso, clearProps: "clipPath" });
            var img = c.querySelector(".oque__foto img");
            if (img) gsap.to(img, { scale: 1.08, duration: 0.9, ease: "expo.out", delay: atraso });
            gsap.to(textosDe(c), { opacity: 1, y: 0, duration: 0.7, ease: "expo.out", delay: atraso + 0.25, stagger: 0.08 });
          });
        }
      });
      {
        celulas.forEach(function (c) {
          var img = c.querySelector(".oque__foto img");
          if (!img) return;
          gsap.fromTo(img, { yPercent: -3 }, { yPercent: 3, ease: "none",
            scrollTrigger: { trigger: c, start: "top bottom", end: "bottom top", scrub: true } });
        });
      }
    }
    // selos: o fio de ouro se desenha quando o selo entra
    document.querySelectorAll(".selo").forEach(function (sl) {
      sl.classList.add("selo--espera");
      ScrollTrigger.create({ trigger: sl, start: "top 90%", once: true, onEnter: function () { sl.classList.remove("selo--espera"); } });
    });
    // títulos de seção: sobem por trás de uma máscara, como as linhas do fechamento (sem passar pelo cinza).
    // Os blocos do programa, do mapa e do filme aparecem sem esmaecer: o movimento ali é a barra, as rotas e o filme
    document.querySelectorAll(".secao .titulo").forEach(function (t) {
      gsap.set(t, { clipPath: "inset(0% 0% 100% 0%)", y: 40 });
      ScrollTrigger.create({
        trigger: t, start: "top 88%", once: true,
        onEnter: function () { gsap.to(t, { clipPath: "inset(0% 0% -20% 0%)", y: 0, duration: 1.0, ease: "expo.out" }); }
      });
    });
    // fechamento: cada linha do título sobe por trás de uma máscara, como um letreiro de cinema
    var linhas = document.querySelectorAll(".convite__titulo span");
    if (linhas.length) {
      gsap.set(linhas, { clipPath: "inset(0% 0% 100% 0%)", y: 36 });
      ScrollTrigger.create({
        trigger: ".convite__titulo", start: "top 85%", once: true,
        onEnter: function () { gsap.to(linhas, { clipPath: "inset(0% 0% -20% 0%)", y: 0, duration: 1.0, ease: "expo.out", stagger: 0.16 }); }
      });
    }
  }

  // ------------------------------------------------------------ a mesa: os cinco sentam um a um com a rolagem
  // a sala começa à meia-luz; cada lugar clareia devagar a partir da cadeira (máscara radial de borda larga) e o rótulo
  // aparece quando a pessoa já está ali. No fim a meia-luz sai e a frase de apoio dá lugar à confirmação
  var mesa = document.querySelector(".mesa");
  if (mesa) {
    var pessoasMesa = Array.prototype.slice.call(mesa.querySelectorAll(".mesa__pessoa"));
    var rotulosMesa = Array.prototype.slice.call(mesa.querySelectorAll(".rotulo-lugar"));
    var passosMesa = Array.prototype.slice.call(mesa.querySelectorAll(".mesa__passos li"));
    var pintarMesa = function (p) {
      pessoasMesa.forEach(function (img, k) {
        var a = limita((p - (0.1 + k * 0.14)) / 0.1, 0, 1);
        img.style.setProperty("--abre", a.toFixed(3));
        if (rotulosMesa[k]) rotulosMesa[k].classList.toggle("visivel", a > 0.6);
        if (passosMesa[k]) passosMesa[k].classList.toggle("feito", a > 0.6);
      });
      mesa.style.setProperty("--fim", limita((p - 0.8) / 0.08, 0, 1).toFixed(3));
    };
    // espaço que sobra para a planta no palco preso: a tela menos o topo, o cabeçalho da seção, a legenda e a barra de
    // compra fixa embaixo (no celular ela fica na tela durante a mesa). Sem isso a mesa descia para baixo da barra
    var palcoMesa = mesa.querySelector(".mesa__palco"), cabecaMesa = mesa.querySelector(".mesa__cabeca");
    var medirMesa = function () {
      var barraH = barra ? barra.offsetHeight : 0;
      mesa.style.setProperty("--mesa-barra", barraH + "px");
      var livre = palcoMesa.clientHeight - topo.offsetHeight - 14 - 22 - barraH - cabecaMesa.offsetHeight - 24 - 24;
      mesa.style.setProperty("--mesa-livre", Math.floor(livre) + "px");
      return livre;
    };
    // tela baixa demais: no celular (320x568, 360x740, 375x667) abaixo de 280px de planta os rótulos de baixo se
    // encostam; em qualquer tela com menos de 560px de altura (notebook com zoom de 200%, celular deitado) o palco
    // preso mostraria só uma faixa da mesa. Nesses casos a mesa fica parada, já completa, como sem movimento.
    // Decidido de novo quando a largura muda (zoom do navegador, girar o celular); a barra de endereço do celular, que
    // some e volta durante a rolagem, muda só a altura e não troca o modo no meio da leitura
    var mesaViva = null, stMesa = null, larguraMesa = window.innerWidth;
    var ajustarMesa = function () {
      var quer = false;
      if (anima) {
        mesa.classList.add("mesa--viva");
        var livre = medirMesa();
        quer = window.innerHeight >= 560 && (largo() || livre >= 280);
      }
      mesa.classList.toggle("mesa--viva", quer);
      if (quer === mesaViva) return;
      mesaViva = quer;
      if (quer) {
        if (!stMesa) {
          stMesa = ScrollTrigger.create({
            trigger: mesa, start: "top top", end: "bottom bottom", scrub: true,
            onUpdate: function (st) { pintarMesa(st.progress); }
          });
        } else stMesa.enable();
        pintarMesa(stMesa.progress);
      } else {
        if (stMesa) stMesa.disable();
        pintarMesa(1);
      }
    };
    ajustarMesa();
    if (anima) {
      window.addEventListener("resize", function () {
        if (window.innerWidth !== larguraMesa) { larguraMesa = window.innerWidth; ajustarMesa(); }
        else if (mesaViva) medirMesa();
      }, { passive: true });
    }
  }

  // ------------------------------------------------------------ a obra: a rolagem passa do desenho à primeira noite
  // os quadros (assets/obra/quadros.json) são desenhados num canvas, um sobre o outro com o seguinte se misturando;
  // as etapas do zero passam devagar, a obra corre por igual, a noite segura no fim. A régua anda com a data do quadro
  var obra = document.querySelector(".obra");
  if (obra && anima) {
    obra.classList.add("obra--viva");
    var telaObra = obra.querySelector(".obra__tela");
    var ctxObra = telaObra.getContext("2d");
    var frasesObra = obra.querySelectorAll(".obra__frase");
    var hojeObra = obra.querySelector(".obra__hoje");
    var MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    var Q = { lista: [], seq: null, velha: null, conjunto: null, f: 0, zero: 0 };
    var INI = Date.UTC(2021, 5, 1), FIM = Date.UTC(2022, 3, 1);

    var dataDe = function (s) {
      var p = s.split("-");
      return Date.UTC(+p[0], +p[1] - 1, +p[2]);
    };
    var textoData = function (ms) {
      var d = new Date(ms);
      return d.getUTCDate() + " " + MESES[d.getUTCMonth()] + " " + d.getUTCFullYear();
    };

    var medirObra = function () {
      var r = telaObra.getBoundingClientRect();
      var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      telaObra.width = Math.max(1, Math.round(r.width * dpr));
      telaObra.height = Math.max(1, Math.round(r.height * dpr));
      var conj = largo() ? "d" : "m";
      if (conj !== Q.conjunto && Q.lista.length) {
        Q.conjunto = conj;
        carregarObra();
      }
      desenharObra(Q.f);
    };

    var pedidoObra = 0, RAIO_REDESENHO = 13;
    var carregarObra = function () {
      // primeiro os quadros das pontas e de três em três: a rolagem rápida já tem o que mostrar
      var n = Q.lista.length, ordem = [], visto = {};
      [0, 1, n - 1].concat(Q.lista.map(function (_, i) { return i; }).filter(function (i) { return i % 3 === 0; }))
        .concat(Q.lista.map(function (_, i) { return i; })).forEach(function (i) {
          if (!visto[i]) { visto[i] = 1; ordem.push(i); }
        });
      var conj = Q.conjunto;
      var urls = Q.lista.map(function (_, i) { return "assets/obra/" + conj + "/" + String(i).padStart(2, "0") + ".webp"; });
      // o conjunto anterior (troca celular/largo) fica na tela até o novo ter um quadro
      if (Q.velha) Q.velha.matar();
      Q.velha = Q.seq;
      Q.seq = Sequencia(urls, ordem, function (i) {
        // um quadro novo perto do atual: redesenha uma vez no próximo quadro de animação
        if (Math.abs(i - Q.f) < RAIO_REDESENHO && !pedidoObra) {
          pedidoObra = requestAnimationFrame(function () { pedidoObra = 0; desenharObra(Q.f); });
        }
      });
      Q.seq.foco(Q.f);
    };

    var cobrir = function (q, alfa) {
      var cw = telaObra.width, ch = telaObra.height;
      var esc = Math.max(cw / q.w, ch / q.h);
      var w = q.w * esc, h = q.h * esc;
      ctxObra.globalAlpha = alfa;
      ctxObra.drawImage(q.im, (cw - w) * (largo() ? 0.6 : 0.5), (ch - h) * 0.5, w, h);
    };

    var desenharObra = function (f) {
      if (!Q.lista.length || !Q.seq) return;
      var i = Math.floor(f), t = f - i;
      // o quadro decodificado mais perto, para nunca desenhar vazio
      var a = Q.seq.perto(i);
      if (!a && Q.velha) { a = Q.velha.perto(i); if (!a) return; cobrir(a, 1); ctxObra.globalAlpha = 1; return; }
      if (!a) return;
      if (Q.velha) { Q.velha.matar(); Q.velha = null; }
      cobrir(a, 1);
      // dissolução contínua: o quadro seguinte entra ao longo de todo o trecho, o que dilui o tremor entre quadros
      var b = Q.seq.quadro(i + 1);
      if (t > 0.001 && b) cobrir(b, t);
      ctxObra.globalAlpha = 1;
      Q.seq.usar(b ? [a, b] : [a]);
    };

    var faseAtual = null;
    var marcarObra = function (f) {
      var n = Q.lista.length;
      // a fase vem do próprio quadro: zero, obra (e tarde, que ainda é a obra) ou noite
      var qf = Q.lista[Math.min(n - 1, Math.round(f))].fase;
      var nz = Q.zero, fase = qf === "zero" ? "zero" : qf === "noite" ? "noite" : "obra";
      if (fase !== faseAtual) {
        faseAtual = fase;
        frasesObra.forEach(function (el) { el.classList.toggle("ativa", el.dataset.fase === fase); });
        obra.classList.toggle("obra--antes", fase === "zero");
      }
      var ms;
      if (fase === "zero") ms = INI;
      else {
        var i = Math.min(n - 2, Math.max(nz, Math.floor(f))), t = Math.min(1, Math.max(0, f - i));
        var d0 = dataDe(Q.lista[i].data), d1 = Q.lista[i + 1] && Q.lista[i + 1].data ? dataDe(Q.lista[i + 1].data) : d0;
        ms = d0 + (d1 - d0) * t;
      }
      obra.style.setProperty("--t", limita((ms - INI) / (FIM - INI), 0, 1).toFixed(4));
      hojeObra.textContent = fase === "zero" ? "antes da obra" : textoData(ms);
    };

    // rolagem até quadro: a obra corre num ritmo constante; do sol à noite (fases tarde e noite) cada quadro ganha
    // PESO_FIM vezes mais rolagem, para o anoitecer acontecer devagar. Começo e fim seguram um instante
    var PESO_FIM = 4;
    var acumulado = null;
    var quadroDe = function (p) {
      var n = Q.lista.length;
      if (!acumulado) {
        acumulado = [0];
        for (var k = 1; k < n; k++) {
          var fim = Q.lista[k].fase === "tarde" || Q.lista[k].fase === "noite";
          acumulado.push(acumulado[k - 1] + (fim ? PESO_FIM : 1));
        }
      }
      var alvo = limita((p - 0.03) / 0.93, 0, 1) * acumulado[n - 1];
      var lo = 0, hi = n - 1;
      while (hi - lo > 1) {
        var mid = (lo + hi) >> 1;
        if (acumulado[mid] <= alvo) lo = mid; else hi = mid;
      }
      return lo + (alvo - acumulado[lo]) / (acumulado[hi] - acumulado[lo] || 1);
    };

    fetch("assets/obra/quadros.json").then(function (r) { return r.json(); }).then(function (dados) {
      Q.lista = dados.quadros;
      Q.zero = Q.lista.filter(function (q) { return q.fase === "zero"; }).length;
      new IntersectionObserver(function (ent, obs) {
        if (!ent[0].isIntersecting) return;
        obs.disconnect();
        Q.conjunto = largo() ? "d" : "m";
        carregarObra();
        medirObra();
      }, { rootMargin: "150% 0px" }).observe(obra);
      marcarObra(0);
      ScrollTrigger.create({
        trigger: obra, start: "top top", end: "bottom bottom", scrub: true,
        onUpdate: function (st) {
          Q.f = quadroDe(st.progress);
          if (Q.seq) Q.seq.foco(Q.f);
          desenharObra(Q.f);
          marcarObra(Q.f);
        }
      });
      window.addEventListener("resize", medirObra);
    }).catch(function () { obra.classList.remove("obra--viva"); });
  }

  // ------------------------------------------------------------ manifesto: o ouro risca o que o Clube não é
  var riscos = document.querySelectorAll(".risco");
  if (riscos.length && anima) {
    riscos.forEach(function (el) { el.style.setProperty("--risco", 0); });
    var lista = document.querySelector(".manifesto__nao");
    var estado = { p: 0 };
    gsap.to(estado, {
      p: 1,
      ease: "none",
      scrollTrigger: { trigger: lista, start: "top 75%", end: "bottom 45%", scrub: 0.5 },
      onUpdate: function () {
        var n = riscos.length;
        riscos.forEach(function (el, i) {
          el.style.setProperty("--risco", limita(estado.p * n - i, 0, 1).toFixed(3));
        });
      }
    });
  }

  // ------------------------------------------------------------ Ênio: a régua e as 6.000 unidades

  // régua dos 25 anos: um traço por ano, o de cada cinco mais alto e em ouro
  document.querySelectorAll(".regua").forEach(function (el) {
    var anos = 25, svg = '<svg viewBox="0 0 1000 30" preserveAspectRatio="none" aria-hidden="true"><path class="regua__base" d="M0 29.5 H1000"/>';
    for (var i = 0; i <= anos; i++) {
      var x = Math.min(999.5, Math.max(0.5, i * 1000 / anos));
      var alto = i % 5 === 0;
      svg += '<path class="regua__ano' + (alto ? " regua__ano--cinco" : "") + '" style="--i:' + i + '" d="M' + x.toFixed(1) + " 30 V" + (alto ? 4 : 16) + '"/>';
    }
    el.innerHTML = svg + "</svg>";
    if (anima) {
      el.classList.add("regua--espera");
      ScrollTrigger.create({ trigger: el, start: "top 88%", once: true, onEnter: function () { el.classList.remove("regua--espera"); } });
    }
  });

  var unidades = document.querySelector(".unidades");
  if (unidades) {
    var uctx = unidades.getContext("2d");
    var TOTAL = 6000;
    var contador = document.querySelector("[data-contar]");
    var feito = anima ? 0 : 1;
    // cada unidade acende numa ordem fixa sorteada, como um bairro inteiro sendo entregue
    var quando = new Float32Array(TOTAL), tom = new Uint8Array(TOTAL);
    (function () {
      var semente = 0x1e0c64b4;
      function sorteio() { semente = (Math.imul(semente, 1664525) + 1013904223) >>> 0; return semente / 4294967296; }
      var ordem = [];
      for (var i = 0; i < TOTAL; i++) ordem.push(i);
      for (var j = TOTAL - 1; j > 0; j--) { var k = Math.floor(sorteio() * (j + 1)), t = ordem[j]; ordem[j] = ordem[k]; ordem[k] = t; }
      // os blocos de 100 acendem em ordem, como andares de um empreendimento; dentro do bloco, uma varredura rápida
      var BLOCOS = TOTAL / 100;
      for (var p = 0; p < TOTAL; p++) { quando[p] = (Math.floor(p / 100) + 0.6 * ((p % 100) / 100)) / BLOCOS; var r = sorteio(); tom[p] = r < 0.9 ? 0 : r < 0.97 ? 1 : 2; }
    })();
    // só tons da tinta verde: cada quadrado é uma unidade, nenhuma cor codifica outra coisa
    var CORES = ["#1c3a37", "#24433f", "#2c4a46"];
    var VAZIO = "rgba(28, 58, 55, 0.09)";
    var grade = {};
    function reservarContador() {
      if (!contador) return;
      var antes = contador.textContent;
      contador.style.display = "inline-block";
      contador.style.minWidth = "";
      contador.textContent = TOTAL.toLocaleString("pt-BR");
      contador.style.minWidth = contador.getBoundingClientRect().width.toFixed(1) + "px";
      // o número cresce para a esquerda, colado no "+"
      contador.style.textAlign = "right";
      contador.style.fontVariantNumeric = "tabular-nums";
      contador.textContent = antes;
    }
    // aceso[i]: o estado com que a unidade i está pintada agora; dprU: a escala da tela ao pintar
    var aceso = new Uint8Array(TOTAL), pintada = false, dprU = 1;
    function medirUnidades() {
      reservarContador();
      var w = unidades.clientWidth;
      if (!w) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      // blocos de 10 x 10: 15 x 4 blocos no largo, 10 x 6 no estreito
      var bx = w < 520 ? 10 : 15, by = TOTAL / 100 / bx;
      var vao = w < 520 ? 4 : 6, g = 0.6;
      var cw = (w - (bx - 1) * vao - bx * 9 * g) / (bx * 10);
      grade = { bx: bx, by: by, vao: vao, g: g, cw: cw };
      var h = by * (10 * cw + 9 * g) + (by - 1) * vao;
      unidades.style.height = h.toFixed(1) + "px";
      unidades.width = Math.round(w * dpr);
      unidades.height = Math.round(h * dpr);
      uctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      dprU = dpr;
      // tamanho novo: a tela foi apagada, tudo é pintado de novo
      desenharUnidades(true);
    }
    function posUnidade(i) {
      var gd = grade, bloco = 10 * gd.cw + 9 * gd.g;
      var b = Math.floor(i / 100), d = i % 100;
      return [(b % gd.bx) * (bloco + gd.vao) + (d % 10) * (gd.cw + gd.g),
        Math.floor(b / gd.bx) * (bloco + gd.vao) + Math.floor(d / 10) * (gd.cw + gd.g)];
    }
    function pintarUnidade(i) {
      var p = posUnidade(i);
      uctx.fillStyle = aceso[i] ? CORES[tom[i]] : VAZIO;
      uctx.fillRect(p[0], p[1], grade.cw, grade.cw);
    }
    // repinta o bloco de 100 unidades como a pintura inteira faria: apaga só os pixels do bloco (os blocos ficam a 4px
    // ou mais um do outro, nenhum pixel é dividido entre dois) e pinta as 100 na ordem de sempre. Dentro do bloco as
    // bordas suavizadas das unidades dividem pixels (vão de 0,6px), por isso o bloco inteiro e não a unidade sozinha
    function repintarBloco(b) {
      var p = posUnidade(b * 100), lado = 10 * grade.cw + 9 * grade.g;
      var x0 = Math.floor(p[0] * dprU) - 1, y0 = Math.floor(p[1] * dprU) - 1;
      var x1 = Math.ceil((p[0] + lado) * dprU) + 1, y1 = Math.ceil((p[1] + lado) * dprU) + 1;
      uctx.setTransform(1, 0, 0, 1, 0, 0);
      uctx.clearRect(x0, y0, x1 - x0, y1 - y0);
      uctx.setTransform(dprU, 0, 0, dprU, 0, 0);
      for (var i = b * 100; i < b * 100 + 100; i++) pintarUnidade(i);
    }
    function desenharUnidades(tudo) {
      var gd = grade;
      if (!gd.cw) return;
      if (tudo || !pintada) {
        uctx.clearRect(0, 0, unidades.width, unidades.height);
        for (var i = 0; i < TOTAL; i++) {
          aceso[i] = quando[i] < feito ? 1 : 0;
          pintarUnidade(i);
        }
        pintada = true;
      } else {
        // só os blocos com alguma unidade que mudou desde a última pintura
        var blocoMudou = {};
        for (var k = 0; k < TOTAL; k++) {
          var v = quando[k] < feito ? 1 : 0;
          if (v !== aceso[k]) { aceso[k] = v; blocoMudou[Math.floor(k / 100)] = 1; }
        }
        for (var bm in blocoMudou) repintarBloco(+bm);
      }
      if (contador) contador.textContent = Math.round(TOTAL * feito).toLocaleString("pt-BR");
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(medirUnidades);
    medirUnidades();
    window.addEventListener("resize", medirUnidades);
    if (anima) {
      var proxy = { v: 0 };
      gsap.to(proxy, {
        v: 1, duration: 3, ease: "power1.inOut",
        // começa quando o número entra na tela: o "0+" parado nunca aparece
        scrollTrigger: { trigger: contador || unidades, start: "top 96%" },
        onUpdate: function () { feito = proxy.v; desenharUnidades(); }
      });
    }
  }

  // ------------------------------------------------------------ o voo: a rolagem percorre os quadros do render
  (function () {
    var voo = document.getElementById("voo");
    if (!voo || !anima || !window.fetch) return;
    // a altura final (palco preso) entra desde já: a seção não muda de tamanho quando o quadro 0 chega (sem salto de
    // layout); até lá o pôster cobre o quadro e a tela, ainda vazia, é transparente
    voo.classList.add("voo--vivo");
    var quadro = voo.querySelector(".voo__quadro");
    var tela = voo.querySelector(".voo__tela");
    var ctx = tela.getContext("2d");
    var marcas = [].slice.call(voo.querySelectorAll(".voo__marca"));
    var textoVoo = voo.querySelector(".voo__texto");
    // em que trecho do voo cada marca aparece (fração da rolagem)
    var JANELA = { lago: [0.03, 0.4], alas: [0.28, 0.7], piscina: [0.72, 1.01] };
    var pontos = null, seq = null, N = 0, prog = 0, pedido = 0, ultimo = "", pasta = "";
    // os quadros do celular são o recorte em pé do centro do quadro (x de 450 a 1150 em 1600): as marcas também
    var RECORTE_M = [450 / 1600, 700 / 1600], recorte = [0, 1];
    function suave(a, b, t) { t = limita((t - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

    function nome(i) { return pasta + ("00" + i).slice(-3) + ".webp"; }

    function carregar() {
      fetch("assets/voo/pontos.json").then(function (r) { return r.json(); }).then(function (j) {
        pontos = j.pontos;
        N = j.quadros;
        pasta = largo() ? "assets/voo/d/" : "assets/voo/m/";
        recorte = largo() ? [0, 1] : RECORTE_M;
        // primeiro um quadro a cada 10 (o voo já anda, aos saltos), depois os do meio
        var ordem = [];
        for (var passo = 10; passo >= 1; passo = passo > 1 ? Math.floor(passo / 2) : 0) {
          for (var i = 0; i < N; i += passo) if (ordem.indexOf(i) < 0) ordem.push(i);
          if (passo === 1) break;
        }
        var urls = [];
        for (var k = 0; k < N; k++) urls.push(nome(k));
        seq = Sequencia(urls, ordem, pedir);
        seq.foco(prog * (N - 1));
        pedir();
      }).catch(function () {
        // sem a lista de pontos o voo não anda: volta ao pôster parado
        voo.classList.remove("voo--vivo");
        ScrollTrigger.refresh();
      });
    }

    function pedir() {
      if (!pedido) pedido = requestAnimationFrame(desenhar);
    }

    function desenhar() {
      pedido = 0;
      if (!N || !seq) return;
      var w = quadro.clientWidth, h = quadro.clientHeight;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (tela.width !== Math.round(w * dpr) || tela.height !== Math.round(h * dpr)) {
        tela.width = Math.round(w * dpr);
        tela.height = Math.round(h * dpr);
        ultimo = "";
      }
      var alvo = Math.round(prog * (N - 1));
      // o quadro decodificado mais perto do pedido
      var q = seq.perto(alvo);
      if (!q) return;
      var i = seq.indice(q), im = q.im, iw = q.w, ih = q.h;
      seq.usar([q]);
      // cobre o quadro como object-fit: cover; no meio do voo (vista aérea) amplia até 12% em torno de um ponto
      // abaixo e à direita do centro, e a névoa do topo desce: a borda da cena extraída fica fora do quadro
      var bruma = suave(0.3, 0.42, prog) * (1 - suave(0.7, 0.8, prog));
      var z = 1 + 0.12 * bruma;
      var esc = Math.max(w / iw, h / ih) * z;
      var dw = iw * esc, dh = ih * esc;
      var fx = w * (0.5 + 0.12 * bruma), fy = h * (0.5 + 0.14 * bruma);
      var ox = fx - (fx - (w - iw * esc / z) / 2) * z, oy = fy - (fy - (h - ih * esc / z) / 2) * z;
      var chave = i + ":" + z.toFixed(3);
      if (chave !== ultimo) {
        ctx.drawImage(im, ox * dpr, oy * dpr, dw * dpr, dh * dpr);
        ultimo = chave;
        quadro.style.setProperty("--bruma", bruma.toFixed(3));
      }
      // no celular o texto fica por cima da imagem: as marcas não descem até ele
      var piso = largo() ? h - 24 : h - textoVoo.offsetHeight + 60;
      marcas.forEach(function (m) {
        var nomeP = m.dataset.ponto, p = pontos[nomeP] && pontos[nomeP][alvo], jan = JANELA[nomeP];
        var x = p ? ox + (p[0] - recorte[0]) / recorte[1] * dw : 0, y = p ? oy + p[1] * dh : 0;
        var dentro = p && prog >= jan[0] && prog <= jan[1] && x > 16 && x < w - 16 && y > 90 && y < piso;
        m.style.setProperty("--o", dentro ? 1 : 0);
        if (p) {
          m.style.setProperty("--x", x.toFixed(1) + "px");
          m.style.setProperty("--y", y.toFixed(1) + "px");
          // perto da borda direita o nome vira para o lado de dentro, só quando não cabe à direita e há mais
          // espaço à esquerda (no celular estreito virar fixo em 260px jogava o nome para fora da tela)
          if (!m._larg) m._larg = m.querySelector("span").offsetWidth;
          m.classList.toggle("voo__marca--esq", x + m._larg + 8 > w && x > w - x);
        }
      });
    }

    new IntersectionObserver(function (ent, obs) {
      if (ent[0].isIntersecting) { obs.disconnect(); carregar(); }
    }, { rootMargin: "150% 0px" }).observe(voo);

    ScrollTrigger.create({
      trigger: voo,
      start: "top top",
      end: "bottom bottom",
      onUpdate: function (s) {
        prog = s.progress;
        if (seq) seq.foco(prog * (N - 1));
        pedir();
      }
    });
    window.addEventListener("resize", pedir, { passive: true });
  })();

  // ------------------------------------------------------------ os dois dias: a linha enche com a rolagem e cada dia acende
  // quando ela passa; o quadro preso troca a mesa pelo resort quando o Dia 2 chega ao meio da tela
  var programa = document.querySelector(".programa");
  if (programa && temGsap) {
    var linhaProg = programa.querySelector(".linha");
    var diasProg = Array.prototype.slice.call(programa.querySelectorAll(".linha .dia"));
    var dia2Prog = programa.querySelector('.linha .dia[data-dia="2"]');
    var trocaProg = function (v) {
      programa.style.setProperty("--troca", v.toFixed(4));
      programa.classList.toggle("programa--dia2", v > 0.5);
    };
    if (anima) {
      linhaProg.style.setProperty("--progresso", "0");
      ScrollTrigger.create({
        trigger: linhaProg, start: "top 65%", end: "bottom 65%", scrub: 0.4,
        onUpdate: function (st) {
          linhaProg.style.setProperty("--progresso", st.progress.toFixed(4));
          var ate = st.progress * linhaProg.offsetHeight;
          diasProg.forEach(function (d) { d.classList.toggle("passou", ate >= d.offsetTop + 8); });
        }
      });
      ScrollTrigger.create({
        trigger: dia2Prog, start: "top 85%", end: "top 45%", scrub: 0.4,
        onUpdate: function (st) { trocaProg(st.progress); }
      });
    } else {
      // movimento reduzido: a linha já está cheia e a troca de imagem é imediata
      diasProg.forEach(function (d) { d.classList.add("passou"); });
      ScrollTrigger.create({
        trigger: dia2Prog, start: "top 60%",
        onEnter: function () { trocaProg(1); },
        onLeaveBack: function () { trocaProg(0); }
      });
    }
  }

  // ------------------------------------------------------------ edição anterior: o filme toca quando aparece
  var video = document.querySelector(".filme__video");
  if (video) {
    var som = document.querySelector(".filme__som:not(.filme__pausa)");
    var pausa = document.querySelector(".filme__pausa");
    // a pessoa pausou: a rolagem não volta a tocar o filme até ela pedir
    var pausouAMao = false;
    var carregado = false;
    function carregar() {
      if (carregado) return;
      carregado = true;
      video.src = window.innerWidth < 700 ? video.dataset.srcCurto : video.dataset.srcLargo;
      video.load();
    }
    function tocar() {
      carregar();
      var p = video.play();
      if (p && p.catch) p.catch(function () {});
    }
    if (reduz) {
      // movimento reduzido: nada toca sozinho; o botão toca com som
      video.controls = true;
    } else if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (ent) {
        ent.forEach(function (e) {
          if (e.isIntersecting && e.intersectionRatio > 0.35) { if (!pausouAMao) tocar(); }
          else if (!video.paused) video.pause();
        });
      }, { threshold: [0, 0.35, 0.7] }).observe(video);
      // começa a baixar um pouco antes de aparecer
      new IntersectionObserver(function (ent, obs) {
        if (ent[0].isIntersecting) { carregar(); obs.disconnect(); }
      }, { rootMargin: "600px 0px" }).observe(video);
    }
    som.addEventListener("click", function () {
      var ligar = video.muted;
      video.muted = !ligar;
      som.setAttribute("aria-pressed", ligar ? "true" : "false");
      som.querySelector(".filme__texto").textContent = ligar ? "Sem som" : "Ouvir";
      if (ligar) { pausouAMao = false; tocar(); }
    });
    if (pausa) {
      // o ícone e o nome seguem o estado real do vídeo (tocar pela rolagem, pelo "Ouvir" ou pelos controles nativos)
      var marcarPausa = function () {
        var parado = video.paused;
        pausa.dataset.estado = parado ? "parado" : "tocando";
        pausa.setAttribute("aria-label", parado ? "Tocar o filme" : "Pausar o filme");
      };
      video.addEventListener("play", marcarPausa);
      video.addEventListener("pause", marcarPausa);
      pausa.addEventListener("click", function () {
        if (video.paused) { pausouAMao = false; tocar(); }
        else { pausouAMao = true; video.pause(); }
      });
      marcarPausa();
    }
  }

  // ------------------------------------------------------------ abas acessíveis (setas do teclado trocam a aba)
  function abas(lista, aoMudar) {
    var botoes = Array.prototype.slice.call(lista.querySelectorAll('[role="tab"]'));
    function seleciona(b, foca) {
      botoes.forEach(function (x) {
        var sel = x === b;
        x.setAttribute("aria-selected", sel ? "true" : "false");
        x.tabIndex = sel ? 0 : -1;
      });
      if (foca) b.focus();
      aoMudar(b);
    }
    botoes.forEach(function (b, i) {
      b.addEventListener("click", function () { seleciona(b, false); });
      b.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
          e.preventDefault();
          var j = (i + (e.key === "ArrowRight" ? 1 : botoes.length - 1)) % botoes.length;
          seleciona(botoes[j], true);
        }
      });
    });
    seleciona(botoes[0], false);
    return function (qual) {
      botoes.forEach(function (x) { if (x.dataset.ingresso === qual) seleciona(x, false); });
    };
  }

  // ------------------------------------------------------------ ingressos: o ingresso escolhido acende as salas em que entra
  // cada sala ganha três peças: a luz (uma cópia do piso, por baixo da parede), a porta (vão, folha e arco na parede de
  // baixo) e, nas que só o Premium abre, o cadeado com o nome do ingresso que abre
  var planta = document.querySelector(".acessos");
  var chavesIng = document.querySelector(".ingressos .chaves");
  if (planta && chavesIng) {
    planta.querySelectorAll(".sala").forEach(function (g) {
      var r = g.querySelector("rect");
      var x = parseFloat(r.getAttribute("x")), y = parseFloat(r.getAttribute("y"));
      var w = parseFloat(r.getAttribute("width")), h = parseFloat(r.getAttribute("height"));
      function el(tag, attrs) {
        var e = document.createElementNS(NS, tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        return e;
      }
      var luz = r.cloneNode(false);
      luz.setAttribute("class", "sala__luz");
      g.insertBefore(luz, r);
      if (g.matches(".sala--zona, .sala--online, .sala--fora")) return;
      var L = Math.min(22, w * 0.2), px = x + w - 22 - L, yb = y + h;
      g.appendChild(el("path", { "class": "porta__vao", d: "M" + px + " " + yb + " H" + (px + L) }));
      g.appendChild(el("path", { "class": "porta__folha", d: "M" + px + " " + yb + " V" + (yb - L) }));
      g.appendChild(el("path", { "class": "porta__arco", d: "M" + px + " " + (yb - L) + " A" + L + " " + L + " 0 0 1 " + (px + L) + " " + yb }));
      if (!g.hasAttribute("data-vip")) {
        // o cadeado no canto de baixo à esquerda, longe do nome da sala e da porta
        var c = el("g", { "class": "sala__cadeado", transform: "translate(" + (x + 16) + " " + (yb - 30) + ")" });
        c.appendChild(el("path", { d: "M2.5 7 V4.5 a3.5 3.5 0 0 1 7 0 V7" }));
        c.appendChild(el("rect", { x: 0.5, y: 7, width: 11, height: 8.5, rx: 1.5 }));
        var tx = el("text", { x: 17, y: 14 });
        tx.textContent = "PREMIUM";
        c.appendChild(tx);
        g.appendChild(c);
      }
    });

    var salasIng = planta.querySelectorAll(".sala");
    var paineis = document.querySelectorAll(".ingresso");
    var painelWrap = document.getElementById("painel-ingresso");
    var escolhe = abas(chavesIng, function (b) {
      var qual = b.dataset.ingresso, n = 0;
      painelWrap.setAttribute("aria-labelledby", b.id);
      salasIng.forEach(function (s) {
        var abre = s.hasAttribute("data-" + qual);
        // as luzes acendem uma depois da outra, as que apagam saem juntas
        s.style.setProperty("--atraso", abre && !s.classList.contains("aberta") ? (n++ * 0.07).toFixed(2) + "s" : "0s");
        s.classList.toggle("aberta", abre);
        s.classList.toggle("trancada", !abre && !s.classList.contains("sala--zona"));
      });
      paineis.forEach(function (p) {
        p.hidden = p.dataset.painel !== qual;
        // o painel que estava escondido nunca passou pela entrada da rolagem: entra aqui, senão fica com opacidade 0
        if (!p.hidden && anima) gsap.fromTo(p, { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out", overwrite: true });
        else if (!p.hidden) p.style.opacity = 1;
      });
    });
    // celular: lendo os benefícios, a pessoa troca de ingresso sem subir até os cartões. Um seletor fixo embaixo do
    // cabeçalho aparece quando os cartões saem da tela por cima e some quando a seção acaba
    var corpoIng = document.querySelector(".ingressos__corpo");
    var troca = document.createElement("div");
    troca.className = "troca-ingresso";
    troca.setAttribute("aria-hidden", "true");
    troca.innerHTML = '<button type="button" data-ir="premium" tabindex="-1">Premium</button><button type="button" data-ir="vip" tabindex="-1">VIP</button>';
    document.body.appendChild(troca);
    var botoesTroca = Array.prototype.slice.call(troca.querySelectorAll("button"));
    function marcarTroca() {
      var sel = chavesIng.querySelector('[aria-selected="true"]');
      botoesTroca.forEach(function (bt) { bt.classList.toggle("ativo", sel && bt.dataset.ir === sel.dataset.ingresso); });
    }
    botoesTroca.forEach(function (bt) {
      bt.addEventListener("click", function () { escolhe(bt.dataset.ir); marcarTroca(); });
    });
    chavesIng.addEventListener("click", marcarTroca);
    marcarTroca();
    function mostrarTroca() {
      var topoH = topo.offsetHeight;
      var rc = chavesIng.getBoundingClientRect(), rb = corpoIng.getBoundingClientRect();
      var mostra = !largo() && rc.bottom < topoH && rb.bottom > topoH + 140;
      troca.classList.toggle("visivel", mostra);
      troca.setAttribute("aria-hidden", mostra ? "false" : "true");
      botoesTroca.forEach(function (bt) { bt.tabIndex = mostra ? 0 : -1; });
    }
    window.addEventListener("scroll", mostrarTroca, { passive: true });
    window.addEventListener("resize", mostrarTroca);
    mostrarTroca();
    document.querySelectorAll(".subir__botao").forEach(function (bt) {
      bt.addEventListener("click", function () {
        escolhe(bt.dataset.ir);
        document.getElementById("aba-" + bt.dataset.ir).focus({ preventScroll: true });
      });
    });

    // entrada: as paredes se desenham no escuro, os nomes aparecem e só então as luzes do ingresso acendem
    if (anima) {
      planta.classList.add("apagada");
      planta.querySelectorAll(".acessos__planta").forEach(function (svg) {
        // só a planta visível neste tamanho de tela (a outra está escondida e ficaria sem os nomes)
        if (!svg.getBoundingClientRect().width) return;
        var paredes = Array.prototype.slice.call(svg.querySelectorAll(".sala:not(.sala--online):not(.sala--fora) > rect:not(.sala__luz)"));
        var resto = svg.querySelectorAll(".sala text, .sala--online > rect:not(.sala__luz), .sala--fora > rect:not(.sala__luz), .porta__folha, .porta__arco, .acessos__escala");
        paredes.forEach(function (r) {
          var L = r.getTotalLength ? r.getTotalLength() : 0;
          if (L) { r.style.strokeDasharray = L; r.style.strokeDashoffset = L; }
        });
        gsap.set(resto, { opacity: 0 });
        ScrollTrigger.create({
          trigger: svg, start: "top 80%", once: true,
          onEnter: function () {
            gsap.to(paredes, { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut", stagger: 0.06,
              onComplete: function () { paredes.forEach(function (r) { r.style.strokeDasharray = ""; r.style.strokeDashoffset = ""; }); } });
            gsap.to(resto, { opacity: 1, duration: 0.5, ease: "power1.out", delay: 0.6, stagger: 0.015, clearProps: "opacity" });
            setTimeout(function () { planta.classList.remove("apagada"); }, 1250);
          }
        });
      });
    }
  }

  // ------------------------------------------------------------ como chegar: o mapa fica no trajeto; clicar no nome de um
  // endereço (A ou B) traz o mapa de volta ao trajeto inteiro, depois de a pessoa arrastar ou dar zoom.
  // As barras dos aeroportos crescem quando a tabela aparece
  var mapa = document.querySelector(".mapa");
  if (mapa) {
    var iframeMapa = mapa.querySelector(".mapa__iframe");
    // num mapa estreito o trajeto inteiro só cabe com um nível a menos de zoom
    var srcTrajeto = mapa.offsetWidth < 600 ? iframeMapa.getAttribute("src").replace("&z=10&", "&z=9&") : iframeMapa.getAttribute("src");
    iframeMapa.setAttribute("src", srcTrajeto);
    mapa.addEventListener("click", function (e) {
      if (!e.target.closest(".mapa__nome")) return;
      // trocar o src pelo mesmo endereço não recarrega: passa por about:blank
      iframeMapa.setAttribute("src", "about:blank");
      requestAnimationFrame(function () { iframeMapa.setAttribute("src", srcTrajeto); });
      if (iframeMapa.scrollIntoView && window.innerWidth < 900) iframeMapa.scrollIntoView({ behavior: reduz ? "auto" : "smooth", block: "center" });
    });
  }
  var barras = document.querySelectorAll(".voos-tabela td i");
  if (barras.length && anima) {
    barras.forEach(function (b) { b.style.setProperty("--barra", 0); });
    ScrollTrigger.create({
      trigger: ".voos-tabela", start: "top 80%", once: true,
      onEnter: function () {
        barras.forEach(function (b, i) {
          gsap.to(b, { "--barra": 1, duration: 0.9, ease: "expo.out", delay: (i % 2) * 0.08 + Math.floor(i / 2) * 0.1 });
        });
      }
    });
  }

  // ------------------------------------------------------------ fechamento: a foto se aproxima devagar
  // fechamento: a câmera chega devagar (zoom), os morros andam menos que a ala e a água, e a frente respira de leve
  var camadas = document.querySelector(".convite__fundo");
  if (camadas && anima) {
    var perto = camadas.querySelector(".convite__perto"), longe = camadas.querySelector(".convite__longe");
    var chegada = { trigger: camadas, start: "top bottom", end: "bottom bottom", scrub: true };
    gsap.fromTo(longe, { "--zoom-longe": 1.0 }, { "--zoom-longe": 1.04, ease: "none", scrollTrigger: chegada });
    gsap.fromTo(perto, { "--zoom-perto": 1.02 }, { "--zoom-perto": 1.09, ease: "none", scrollTrigger: chegada });
    // a frente respira de leve; o zoom mínimo de 1,02 cobre a borda
    gsap.to(perto, { "--perto-x": "5px", duration: 9, ease: "sine.inOut", yoyo: true, repeat: -1 });
  }

  // as fontes mudam a altura das seções: as posições da rolagem são medidas de novo quando elas chegam
  if (temGsap && document.fonts && document.fonts.ready) document.fonts.ready.then(function () { ScrollTrigger.refresh(); });
})();
