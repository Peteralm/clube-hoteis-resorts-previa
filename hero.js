/* Hero: o foco de cinema.
   A cena do resort tem profundidade de verdade (passe do Blender) e o trio é desenhado no mesmo plano, pela mesma
   lente: o WebGL desfoca cada ponto pela distância ao plano de foco, deixa a luz do fundo passar pela borda do trio
   e põe o mesmo grão em tudo. A cena vive: água, folhas, névoa no vale e uma câmera que respira.
   Na abertura o foco sai do vale e vem para os três, com o Ênio escolhido: ele nítido, os outros dois um pouco
   desfocados, o resort bem desfocado atrás. O cursor num rosto passa a escolha para ele. Só um clique na paisagem
   leva o foco ao resort (os três desfocam); um clique num rosto traz o foco de volta para quem foi clicado.
   Sem WebGL, ou com movimento reduzido, as fotos do trio no HTML são o desenho e o fundo desfoca por CSS. */
(function () {
  "use strict";

  var hero = document.querySelector(".hero");
  if (!hero) return;

  var reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ponteiroFino = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var cena = hero.querySelector(".hero__cena");
  var plano = hero.querySelector(".hero__plano");
  var canvas = hero.querySelector(".hero__foco");
  var trio = hero.querySelector(".trio");
  var titulo = hero.querySelector(".hero__titulo");
  var cabeca = hero.querySelector(".hero__cabeca");
  var caixaFoco = hero.querySelector(".foco");
  var rotulo = hero.querySelector(".foco__rotulo");
  var rotuloNome = hero.querySelector(".foco__nome");
  var rotuloFato = hero.querySelector(".foco__fato");
  var dica = hero.querySelector(".hero__dica");

  var CENA = { nome: "Dia 2 · Resort das Oliveiras", fato: "Porto Feliz. Render do projeto." };
  var ORDEM = ["pablo", "nezio", "enio"]; // de trás para a frente, como no desenho
  var ordemToque = ["enio", "nezio", "pablo"]; // quem está na frente vem primeiro no teste de toque

  var pessoas = {};
  ORDEM.forEach(function (id) {
    var el = hero.querySelector(".pessoa--" + id);
    pessoas[id] = {
      id: id, el: el, img: el.querySelector("img"), recuo: 0, mascara: null, ultimoFiltro: "",
      rosto: el.dataset.rosto.split(",").map(Number)
    };
  });

  var S = {
    foco: 0, focoAlvo: 0,          // 0 = vale nítido, 1 = trio nítido
    alvo: null,
    modo: "trio",                  // "trio": o foco nos três; "cena": o resort nítido, depois de um clique nele
    escolhido: "enio",             // quem fica em foco no modo trio quando o cursor não aponta ninguém
    par: [0, 0], parAlvo: [0, 0],
    caixa: null,
    ponteiro: [0, 0],
    apontando: false,              // o cursor está em cima de alguém: só aí os outros recuam
    tocou: false,
    aberto: false,
    zoom: 1, zoomAlvo: 1,          // abertura: a câmera recua um pouco enquanto o foco vem para o trio
    trio: 0, trioAlvo: 0           // o trio aparece desfocado e entra em foco
  };

  // ------------------------------------------------------------ título palavra a palavra (só com movimento)
  if (!reduz) {
    titulo.setAttribute("aria-label", titulo.textContent.replace(/\s+/g, " ").trim());
    var n = 0, html = [];
    Array.prototype.forEach.call(titulo.childNodes, function (no) {
      if (no.nodeType === 1 && no.tagName === "BR") {
        html.push(no.outerHTML);
        return;
      }
      no.textContent.split(/(\s+)/).forEach(function (p) {
        if (!p) return;
        if (/^\s+$/.test(p)) html.push(p.indexOf(" ") >= 0 ? " " : " ");
        else html.push('<span class="palavra" aria-hidden="true" style="--i:' + n++ + '"><span>' + p + "</span></span>");
      });
    });
    titulo.innerHTML = html.join("");
  }

  // ------------------------------------------------------------ WebGL: a foto com profundidade e o trio na mesma lente
  var GL = null;

  var VERT = "#version 300 es\nin vec2 p;\nvoid main(){ gl_Position = vec4(p, 0.0, 1.0); }";
  var FRAG = [
    "#version 300 es",
    "precision highp float;",
    "uniform sampler2D uCena;",
    "uniform sampler2D uProf;",
    "uniform sampler2D uMasc;",
    "uniform sampler2D uP0;",
    "uniform sampler2D uP1;",
    "uniform sampler2D uP2;",
    "uniform vec2 uRes;",
    "uniform vec4 uCobre;",
    "uniform float uFoco;",
    "uniform float uRaio;",
    "uniform vec2 uPar;",
    "uniform float uTempo;",
    "uniform float uZoom;",
    "uniform float uZoomTrio;",
    "uniform vec2 uCentroTrio;",
    "uniform float uTrio;",
    "uniform vec4 uRect[3];",
    "uniform float uEsc[3];",
    "uniform float uBlur[3];",
    "uniform float uRecuo[3];",
    "uniform vec2 uVale;",
    "out vec4 cor;",
    // distância em metros a partir do passe em escala raiz (0 = 1 m, 1 = 2.500 m)
    "float metros(float D) { return 1.0 + 2499.0 * D * D; }",
    "float dioptria(float D) { return 1.0 / metros(D); }",
    "vec3 paraSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }",
    "vec3 paraLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }",
    "float acaso(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }",
    "float ruido(vec2 p) {",
    "  vec2 i = floor(p), f = fract(p);",
    "  vec2 u = f * f * (3.0 - 2.0 * f);",
    "  return mix(mix(acaso(i), acaso(i + vec2(1, 0)), u.x), mix(acaso(i + vec2(0, 1)), acaso(i + vec2(1, 1)), u.x), u.y);",
    "}",
    "float fbm(vec2 p) {",
    "  float s = 0.0, a = 0.5;",
    "  for (int i = 0; i < 4; i++) { s += a * ruido(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }",
    "  return s;",
    "}",
    "vec2 naFoto(vec2 uv0) { return uv0 * uCobre.xy + uCobre.zw; }",
    // o plano: profundidade, água, folhas, foco de cinema e névoa no vale
    "vec3 plano(vec2 uv0) {",
    "  vec2 uv = naFoto(uv0);",
    "  float D = texture(uProf, uv).r;",
    // paralaxe: o que está perto anda mais que o vale
    "  uv += uPar * (1.0 - D) * vec2(0.010, 0.006);",
    "  vec4 m = texture(uMasc, uv);",
    // a água da piscina se mexe de leve; as folhas das oliveiras balançam um pouco
    "  uv.x += m.r * sin(uv.y * 760.0 + uTempo * 1.6) * 0.00045;",
    "  uv.y += m.r * sin(uv.x * 380.0 - uTempo * 1.1) * 0.00030;",
    "  uv.x += m.g * (sin(uTempo * 1.3 + uv.y * 48.0) * 0.6 + sin(uTempo * 2.1 + uv.x * 83.0) * 0.4) * 0.0006 * (1.0 - D);",
    "  D = texture(uProf, uv).r;",
    "  float focoD = uFoco * (1.0 / 3.2);",
    "  float coc = clamp(abs(dioptria(D) - focoD) / (1.0 / 3.2), 0.0, 1.0);",
    "  float r = coc * uRaio;",
    "  vec2 texel = 1.0 / vec2(textureSize(uCena, 0));",
    "  float lod = log2(max(r * 0.34, 1.0));",
    "  vec3 soma = textureLod(uCena, uv, lod).rgb;",
    "  float peso = 1.0;",
    "  if (r > 0.75) {",
    "    for (int i = 1; i <= 12; i++) {",
    "      float f = float(i);",
    "      float ang = f * 2.39996;",
    "      vec2 o = vec2(cos(ang), sin(ang)) * sqrt(f / 12.0) * r * texel;",
    "      soma += textureLod(uCena, uv + o, lod).rgb;",
    "      peso += 1.0;",
    "    }",
    "  }",
    "  vec3 c = soma / peso;",
    // névoa de manhã no vale. O vale e os morros são a foto 360 (fundo infinito, sem profundidade própria):
    // a faixa vai do horizonte (uVale.x) à borda da piscina (uVale.y), na altura da foto. Perto do horizonte
    // o ar fica leitoso; no meio, faixas de névoa andam devagar. O céu claro fica de fora.
    "  float t = clamp((uv.y - uVale.x) / (uVale.y - uVale.x), 0.0, 1.0);",
    "  float lumc = dot(c, vec3(0.2126, 0.7152, 0.0722));",
    // a máscara do céu desfoca junto com a foto: senão a névoa desenha a silhueta nítida das copas e da ala
    "  float mb = textureLod(uMasc, uv, lod + 1.0).b;",
    "  float fundo = smoothstep(0.25, 0.75, mb) * (1.0 - smoothstep(0.5, 0.72, lumc));",
    "  float n = fbm(vec2(uv.x * 2.4 + uTempo * 0.011, uv.y * 14.0 - uTempo * 0.0025));",
    "  float faixa = smoothstep(0.42, 0.8, n) * smoothstep(0.08, 0.35, t) * (1.0 - smoothstep(0.75, 1.0, t));",
    "  float nevoa = fundo * clamp(pow(1.0 - t, 2.2) * 0.42 + faixa * 0.3, 0.0, 0.6);",
    "  c = mix(c, vec3(0.80, 0.84, 0.83), nevoa);",
    "  return c;",
    "}",
    // cada pessoa: amostra desfocada pela mesma lente; a luz do fundo passa pela borda de dentro
    "vec4 pessoa(sampler2D t, vec4 r, float esc, float raio, float recuo, vec2 px, vec3 luz) {",
    "  vec2 uv = (px - r.xy) / r.zw;",
    "  vec2 folga = vec2(raio + 2.0) / r.zw;",
    "  if (any(lessThan(uv, -folga)) || any(greaterThan(uv, 1.0 + folga))) return vec4(0.0);",
    "  float lod = log2(max(raio * esc * 0.34, 1.0));",
    "  vec2 passo = vec2(raio) / r.zw;",
    "  vec4 s = textureLod(t, uv, lod);",
    "  float n = 1.0;",
    "  if (raio > 0.75) {",
    "    for (int i = 1; i <= 12; i++) {",
    "      float f = float(i);",
    "      float ang = f * 2.39996;",
    "      s += textureLod(t, uv + vec2(cos(ang), sin(ang)) * sqrt(f / 12.0) * passo, lod);",
    "      n += 1.0;",
    "    }",
    "  }",
    "  s /= n;",
    "  if (s.a < 0.002) return vec4(0.0);",
    "  vec3 c = paraLinear(s.rgb / s.a);",
    // quem recua perde um pouco de cor e de luz, nunca fica transparente
    "  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));",
    "  c = mix(c, vec3(l), recuo * 0.14) * (1.0 - recuo * 0.04);",
    "  float larga = textureLod(t, uv, lod + 2.4).a;",
    "  float borda = clamp((1.0 - larga) * 1.5, 0.0, 1.0);",
    // a luz do vale vaza pela borda de dentro, metade da cor da cena, metade branca quente do sol
    "  float ll = dot(luz, vec3(0.2126, 0.7152, 0.0722));",
    "  c = mix(c, mix(luz, vec3(ll) * vec3(1.03, 1.0, 0.95), 0.5), borda * borda * 0.42);",
    "  return vec4(c * s.a, s.a);",
    "}",
    "void main() {",
    "  vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);",
    "  vec2 uv0 = px / uRes;",
    "  vec2 zc = vec2(0.5, 0.6);",
    "  vec2 uz = (uv0 - zc) / uZoom + zc;",
    "  vec3 c = plano(uz);",
    // luz do sol baixo, fora do quadro à direita: é dela a luz de contorno do trio
    "  float sol = exp(-length((uz - vec2(1.08, 0.44)) * vec2(1.0, 1.7)) * 2.6);",
    "  c += vec3(1.0, 0.84, 0.62) * sol * 0.07;",
    "  vec3 luz = textureLod(uCena, naFoto(uz), 5.5).rgb * 1.15 + vec3(1.0, 0.86, 0.66) * sol * 0.25;",
    "  vec2 pt = (px - uCentroTrio) / uZoomTrio + uCentroTrio;",
    // o trio é montado inteiro (de trás para a frente) e só depois entra na foto: na transparência da entrada
    // ninguém aparece através de quem está na frente
    "  vec4 g = pessoa(uP0, uRect[0], uEsc[0], uBlur[0], uRecuo[0], pt, luz);",
    "  vec4 p = pessoa(uP1, uRect[1], uEsc[1], uBlur[1], uRecuo[1], pt, luz);",
    "  g = p + g * (1.0 - p.a);",
    "  p = pessoa(uP2, uRect[2], uEsc[2], uBlur[2], uRecuo[2], pt, luz);",
    "  g = p + g * (1.0 - p.a);",
    // a mesma névoa da água sobe pela base do trio: os três ficam dentro do plano, não colados nele
    "  float chao = smoothstep(0.78, 1.0, uv0.y);",
    "  g.rgb = mix(g.rgb, vec3(0.84, 0.835, 0.82) * g.a, chao * 0.3);",
    "  c = c * (1.0 - g.a * uTrio) + g.rgb * uTrio;",
    "  vec3 s = paraSrgb(max(c, 0.0));",
    // um grão só para a foto e para o trio: os dois viram o mesmo plano filmado
    "  float gr = acaso(gl_FragCoord.xy + fract(uTempo * 7.3) * 113.0) - 0.5;",
    "  s += gr * 0.022 * (1.0 - abs(dot(s, vec3(0.333)) - 0.5));",
    "  cor = vec4(s, 1.0);",
    "}"
  ].join("\n");

  function compilar(gl, tipo, fonte) {
    // o resultado da compilação só é lido depois do link (programaPronto): ler aqui esperaria a placa de vídeo
    var s = gl.createShader(tipo);
    gl.shaderSource(s, fonte);
    gl.compileShader(s);
    return s;
  }

  function textura(gl, img, modo, unidade) {
    // modo: "srgb" (a foto, com mips), "dado" (profundidade e máscara) ou "pessoa" (pré-multiplicada, com mips).
    // img é um ImageBitmap já decodificado (os pixelStorei abaixo não valem para ele: as opções de bitmapDe() fazem
    // o mesmo papel) ou, sem createImageBitmap, a própria <img>
    var t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unidade);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, modo === "pessoa");
    gl.texImage2D(gl.TEXTURE_2D, 0, modo === "srgb" ? gl.SRGB8_ALPHA8 : gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    var mips = modo !== "dado";
    // a máscara tem mips para desfocar junto com a foto
    if (mips) gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    return t;
  }

  function carregar(src) {
    return new Promise(function (ok, erro) {
      var im = new Image();
      im.decoding = "async";
      im.onload = function () { ok(im); };
      im.onerror = erro;
      im.src = src;
    });
  }

  function pronta(img) {
    if (img.complete && img.naturalWidth) return Promise.resolve(img);
    return new Promise(function (ok, erro) {
      img.addEventListener("load", function () { ok(img); }, { once: true });
      img.addEventListener("error", erro, { once: true });
    });
  }

  // ------------------------------------------------------------ decodificação fora da thread principal
  // texImage2D e drawImage com uma <img> decodificam a foto inteira na thread principal (no celular, ~0,6 s parado).
  // createImageBitmap de um Blob decodifica numa thread do navegador; createImageBitmap(<img>) não (decodifica na
  // hora, na principal). Por isso os bytes vêm de fetch: para as fotos que a página já baixou, do cache HTTP
  // ("force-cache" não revalida); para profundidade e máscara, do preload as="fetch" do <head>.
  // Sem createImageBitmap/fetch, ou se falhar, volta para a <img> (o caminho antigo, o mesmo desenho).
  var podeBitmap = typeof window.createImageBitmap === "function" && typeof window.fetch === "function" && typeof Blob !== "undefined";
  var OPC_PESSOA = { premultiplyAlpha: "premultiply", colorSpaceConversion: "default", imageOrientation: "none" };
  var OPC_DADO = { premultiplyAlpha: "none", colorSpaceConversion: "default", imageOrientation: "none" };

  function bitmapDaUrl(url, opcoes, cache) {
    return fetch(url, cache ? { cache: cache } : {}).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.blob();
    }).then(function (b) { return createImageBitmap(b, opcoes); });
  }

  // uma <img> da página (já baixada) vira ImageBitmap; sem o caminho rápido, a própria <img>
  function bitmapDe(img, opcoes) {
    return pronta(img).then(function () {
      if (!podeBitmap) return img;
      return bitmapDaUrl(img.currentSrc || img.src, opcoes, "force-cache").catch(function () { return img; });
    });
  }

  // profundidade e máscara não estão no HTML: o preload do <head> já as pediu
  function bitmapDoArquivo(url) {
    if (!podeBitmap) return carregar(url);
    return bitmapDaUrl(url, OPC_DADO).catch(function () { return carregar(url); });
  }

  function largura(im) { return im.naturalWidth || im.width; }
  function altura(im) { return im.naturalHeight || im.height; }
  function fechar(im) { if (im && im.close && !(im instanceof HTMLImageElement)) im.close(); }

  // um passo pesado por tarefa: entre um upload e outro o navegador respira (toque, rolagem, quadro)
  function emTarefas(passos) {
    return passos.reduce(function (cadeia, passo) {
      return cadeia.then(function () {
        return new Promise(function (ok, erro) {
          setTimeout(function () {
            try { ok(passo()); } catch (e) { erro(e); }
          }, 0);
        });
      });
    }, Promise.resolve());
  }

  function prefixo() {
    // o <picture> escolhe a foto; profundidade e máscara seguem o mesmo enquadramento
    return /mobile-/.test(plano.currentSrc || plano.src) ? "assets/cena/mobile" : "assets/cena/desktop";
  }

  // o shader compila na placa de vídeo enquanto a página segue: com KHR_parallel_shader_compile a pergunta "linkou?"
  // só é feita quando a resposta já está pronta (perguntar antes trava a thread principal até o fim da compilação,
  // ~0,25 s no celular). Sem a extensão, pergunta na hora, como antes
  function programaPronto(gl, prog) {
    var ext = gl.getExtension("KHR_parallel_shader_compile");
    return new Promise(function (ok) {
      if (!ext) return ok();
      (function esperar() {
        if (gl.isContextLost() || gl.getProgramParameter(prog, ext.COMPLETION_STATUS_KHR)) ok();
        else setTimeout(esperar, 16);
      })();
    });
  }

  function iniciarGL() {
    if (reduz) return Promise.resolve(null);
    var gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!gl) return Promise.resolve(null);
    var prog, falhou = function () { GL = null; return null; };
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, compilar(gl, gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, compilar(gl, gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
    } catch (e) {
      return Promise.resolve(falhou());
    }
    // as texturas sobem enquanto o shader compila; os uniforms só depois do link
    GL = { gl: gl, u: null, tex: null, base: null, larg: 0, alt: 0, pessoas: null };
    var compilado = programaPronto(gl, prog).then(function () {
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, "p");
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      var u = {};
      ["uCena", "uProf", "uMasc", "uP0", "uP1", "uP2", "uRes", "uCobre", "uFoco", "uRaio", "uPar", "uTempo", "uZoom",
        "uZoomTrio", "uCentroTrio", "uTrio", "uRect", "uEsc", "uBlur", "uRecuo", "uVale"].forEach(function (n) {
        u[n] = gl.getUniformLocation(prog, n);
      });
      gl.uniform1i(u.uCena, 0);
      gl.uniform1i(u.uProf, 1);
      gl.uniform1i(u.uMasc, 2);
      gl.uniform1i(u.uP0, 3);
      gl.uniform1i(u.uP1, 4);
      gl.uniform1i(u.uP2, 5);
      if (GL) GL.u = u;
    });
    var meu = GL;
    return Promise.all([compilado, atualizarTexturas(), texturasDoTrio()]).then(function () { return GL; }, function () {
      // shader que não linka (ou textura que não carrega): sem WebGL, as fotos do HTML desenham, como antes
      if (GL === meu) falhou();
      return null;
    });
  }

  function texturasDoTrio() {
    // as mesmas fontes decodificadas que prepararMascaras() pediu: cada foto do trio é decodificada uma vez só
    return Promise.all(ORDEM.map(function (id) { return pessoas[id].fonte; })).then(function (fontes) {
      var gl = GL.gl, prontas = [];
      return emTarefas(fontes.map(function (im, i) {
        return function () {
          prontas[i] = { tex: textura(gl, im, "pessoa", 3 + i), larg: pessoas[ORDEM[i]].img.naturalWidth || largura(im) };
          pessoas[ORDEM[i]].texturaPronta = true;
          liberarFonte(pessoas[ORDEM[i]]);
        };
      })).then(function () { GL.pessoas = prontas; });
    });
  }

  // a foto do trio é solta quando já virou máscara de toque e (com WebGL) textura
  function liberarFonte(p) {
    if (p.mascaraFeita && (p.texturaPronta || !GL)) p.fonte.then(fechar);
  }

  // as três texturas da cena sobem numa unidade de rascunho (6) e só no fim tomam o lugar das antigas (0, 1, 2):
  // durante a troca (o celular girou para o desktop) nenhum quadro mistura a foto nova com a profundidade velha
  var RASCUNHO = 6;
  function atualizarTexturas() {
    var base = prefixo();
    if (!GL || GL.base === base && GL.tex) return Promise.resolve(GL);
    if (GL.pedido && GL.pedido.base === base) return GL.pedido.promessa;
    var pedido = { base: base };
    GL.pedido = pedido;
    pedido.promessa = Promise.all([bitmapDe(plano, OPC_DADO), bitmapDoArquivo(base + "-prof.webp"), bitmapDoArquivo(base + "-mascara.webp")]).then(function (r) {
      // GL.larg/GL.alt são as medidas da <img> (com srcset, naturalWidth já vem dividido pela densidade escolhida:
      // 1170w num celular de 390 px dá 390). O raio do desfoque sempre foi calculado com elas: o ImageBitmap tem os
      // pixels de verdade e mudaria o desenho
      var gl = GL.gl, novas = [], dims = [plano.naturalWidth || largura(r[0]), plano.naturalHeight || altura(r[0])];
      return emTarefas([
        function () { novas[0] = textura(gl, r[0], "srgb", RASCUNHO); fechar(r[0]); },
        function () { novas[1] = textura(gl, r[1], "dado", RASCUNHO); },
        function () { novas[2] = textura(gl, r[2], "mascara", RASCUNHO); fechar(r[2]); },
        function () {
          // a profundidade também fica na memória, em 256 px de largura, para o foco ir aonde o cursor clica
          try {
            var w = 256, h = Math.round(256 * altura(r[1]) / largura(r[1]));
            var c2 = document.createElement("canvas");
            c2.width = w;
            c2.height = h;
            var ctx = c2.getContext("2d", { willReadFrequently: true });
            ctx.drawImage(r[1], 0, 0, w, h);
            var dados = ctx.getImageData(0, 0, w, h).data;
            var d = new Uint8Array(w * h);
            for (var i = 0; i < w * h; i++) d[i] = dados[i * 4];
            PROF = { w: w, h: h, d: d };
          } catch (e) {
            PROF = null;
          }
          fechar(r[1]);
        }
      ]).then(function () {
        if (GL.pedido !== pedido) {
          // outro enquadramento foi pedido no meio: estas texturas já nasceram velhas
          novas.forEach(function (t) { gl.deleteTexture(t); });
          return GL.pedido ? GL.pedido.promessa : GL;
        }
        GL.pedido = null;
        if (GL.tex) GL.tex.forEach(function (t) { gl.deleteTexture(t); });
        novas.forEach(function (t, i) {
          gl.activeTexture(gl.TEXTURE0 + i);
          gl.bindTexture(gl.TEXTURE_2D, t);
        });
        GL.tex = novas;
        GL.base = base;
        // altura do horizonte e da borda da piscina em cada enquadramento (medidas no passe de máscara)
        GL.vale = /mobile/.test(base) ? [0.448, 0.642] : [0.391, 0.712];
        GL.larg = dims[0];
        GL.alt = dims[1];
        medir();
        return GL;
      });
    }, function (e) {
      if (GL.pedido === pedido) GL.pedido = null;
      throw e;
    });
    return pedido.promessa;
  }

  // ------------------------------------------------------------ medidas (tudo relativo à área da imagem)
  var M = { w: 0, h: 0, dpr: 1, rects: {}, trio: null };
  // a profundidade da foto também fica na memória, em baixa resolução: o foco da paisagem vai para onde o cursor está
  var PROF = null;

  function medir() {
    var r = cena.getBoundingClientRect();
    M.w = r.width;
    M.h = r.height;
    M.folga = parseFloat(getComputedStyle(caixaFoco).getPropertyValue("--folga")) || 10;
    // o fundo quase sempre está desfocado: no desktop 1,5x basta e poupa a placa de vídeo
    M.dpr = Math.min(window.devicePixelRatio || 1, M.w > M.h ? 1.5 : 1.75);
    if (GL) {
      canvas.width = Math.round(M.w * M.dpr);
      canvas.height = Math.round(M.h * M.dpr);
      GL.gl.viewport(0, 0, canvas.width, canvas.height);
      if (GL.larg) {
        // object-fit: cover com object-position 50% 40%, igual à foto
        var esc = Math.max(M.w / GL.larg, M.h / GL.alt);
        var dw = GL.larg * esc, dh = GL.alt * esc;
        var ox = (M.w - dw) * 0.5, oy = (M.h - dh) * 0.4;
        GL.cobre = [M.w / dw, M.h / dh, -ox / dw, -oy / dh];
        // raio máximo de desfoque: ~13 px de tela no desktop, ~9 px no celular, em texels da foto. Com o foco no
        // trio o resort vira fundo de retrato (a forma das alas e do lago ainda se adivinha); o clique o traz nítido
        GL.raio = (M.w > M.h ? 13 : 9) * (GL.larg / dw);
      }
    }
    // as caixas guardam a posição de repouso (sem a paralaxe do momento)
    var t = trio.getBoundingClientRect();
    var dx = S.par[0] * -10, dy = S.par[1] * -6;
    M.trio = { x: t.left - r.left - dx, y: t.top - r.top - dy, w: t.width, h: t.height };
    ORDEM.forEach(function (id) {
      var b = pessoas[id].el.getBoundingClientRect();
      M.rects[id] = { x: b.left - r.left - dx, y: b.top - r.top - dy, w: b.width, h: b.height };
    });
  }

  function rosto(id) {
    // a caixa do foco: do alto da testa ao queixo, um pouco mais justa que o rosto medido
    var b = M.rects[id], f = pessoas[id].rosto;
    var w = (f[2] - f[0]) * b.w, h = (f[3] - f[1]) * b.h;
    return [b.x + f[0] * b.w + w * 0.04 - S.par[0] * 10, b.y + f[1] * b.h + h * 0.14 - S.par[1] * 6, w * 0.92, h * 0.88];
  }

  // ------------------------------------------------------------ teste de toque pela transparência das fotos
  // a foto de cada pessoa é decodificada uma vez (fora da thread principal) e serve à máscara e à textura
  function prepararMascaras() {
    ORDEM.forEach(function (id) {
      var p = pessoas[id];
      var fazer = function (im) {
        try {
          var w = 96, h = Math.round(96 * altura(im) / largura(im));
          var c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          var ctx = c.getContext("2d", { willReadFrequently: true });
          ctx.drawImage(im, 0, 0, w, h);
          var dados = ctx.getImageData(0, 0, w, h).data;
          var a = new Uint8Array(w * h);
          for (var i = 0; i < w * h; i++) a[i] = dados[i * 4 + 3];
          p.mascara = { w: w, h: h, a: a };
        } catch (e) {
          p.mascara = null;
        }
        p.mascaraFeita = true;
        liberarFonte(p);
      };
      p.fonte = bitmapDe(p.img, OPC_PESSOA);
      // cada máscara numa tarefa própria, depois que a foto chegou decodificada
      p.fonte.then(function (im) { setTimeout(function () { fazer(im); }, 0); }, function () {});
    });
  }

  function quemEsta(x, y) {
    if (y > M.h) return null;
    for (var i = 0; i < ordemToque.length; i++) {
      var id = ordemToque[i], b = M.rects[id], p = pessoas[id];
      var lx = (x - b.x + S.par[0] * 10) / b.w, ly = (y - b.y + S.par[1] * 6) / b.h;
      if (lx < 0 || ly < 0 || lx >= 1 || ly >= 1) continue;
      if (!p.mascara) return id;
      if (p.mascara.a[Math.floor(ly * p.mascara.h) * p.mascara.w + Math.floor(lx * p.mascara.w)] > 128) return id;
    }
    return null;
  }

  // ------------------------------------------------------------ alvo do foco
  // foco da paisagem: 0 = infinito; a ala do resort, a ~30 m, dá ~0,1; a piscina perto, mais
  function focoNaPaisagem(x, y) {
    if (!PROF || !GL || !GL.cobre) return 0.1;
    var u = (x / M.w) * GL.cobre[0] + GL.cobre[2], v = (y / M.h) * GL.cobre[1] + GL.cobre[3];
    var i = Math.min(PROF.w - 1, Math.max(0, Math.floor(u * PROF.w)));
    var j = Math.min(PROF.h - 1, Math.max(0, Math.floor(v * PROF.h)));
    var D = PROF.d[j * PROF.w + i] / 255;
    return Math.min(0.6, 3.2 / (1 + 2499 * D * D));
  }

  function mirar(alvo) {
    if (alvo === "cena") S.focoAlvo = focoNaPaisagem(S.ponteiro[0], S.ponteiro[1]);
    if (S.alvo === alvo) return;
    S.alvo = alvo;
    if (alvo === "cena") {
      S.rotulo = [CENA.nome, CENA.fato];
    } else {
      S.focoAlvo = 1;
      S.rotulo = [pessoas[alvo].el.dataset.nome, pessoas[alvo].el.dataset.fato];
    }
    // sem animação o rótulo troca na hora; com ela, troca quando a caixa chega no novo alvo
    if (reduz || !rodando) trocarRotulo();
  }

  function trocarRotulo() {
    if (!S.rotulo) return;
    rotuloNome.textContent = S.rotulo[0];
    // cada fato num span; o "·" num span próprio, que some no celular (lá cada fato é uma linha)
    rotuloFato.textContent = "";
    S.rotulo[1].split(" · ").forEach(function (parte, i) {
      if (i) {
        var sep = document.createElement("span");
        sep.className = "foco__sep";
        sep.textContent = " · ";
        rotuloFato.appendChild(sep);
      }
      var s = document.createElement("span");
      s.className = "foco__parte";
      s.textContent = parte;
      rotuloFato.appendChild(s);
    });
    S.rotulo = null;
  }

  function alvoDaCaixa() {
    if (!S.alvo) return rosto("enio");
    if (S.alvo === "cena") {
      var w = Math.min(150, M.w * 0.2), h = w * 0.66;
      var x = Math.max(12, Math.min(M.w - w - 12, S.ponteiro[0] - w / 2));
      var y = Math.max(M.h * 0.3, Math.min(M.h * 0.7 - h, S.ponteiro[1] - h / 2));
      return [x, y, w, h];
    }
    return rosto(S.alvo);
  }

  // ------------------------------------------------------------ quadro a quadro
  var ultimo = 0, rodando = false, visivel = true, ultimoDesenho = 0, inicio = 0;

  function amortecer(atual, alvo, dt, vel) {
    return atual + (alvo - atual) * (1 - Math.exp(-dt * vel));
  }

  function blurDe(p) {
    // quem sai de foco desfoca de verdade: com pouco desfoque a borda do paletó continuava nítida
    return (1 - S.foco) * 12 + p.recuo * 5.5;
  }

  // sem WebGL: o desfoque de cada pessoa é um filtro de CSS
  function aplicarPessoas() {
    if (!GL) {
      ORDEM.forEach(function (id) {
        var p = pessoas[id];
        var px = blurDe(p);
        var f = px > 0.05 ? "blur(" + px.toFixed(2) + "px)" : "none";
        if (p.recuo > 0.02) f += " saturate(" + (1 - p.recuo * 0.14).toFixed(3) + ") brightness(" + (1 - p.recuo * 0.04).toFixed(3) + ")";
        if (f !== p.ultimoFiltro) {
          p.el.style.filter = f;
          p.ultimoFiltro = f;
        }
      });
    }
    trio.style.translate = (S.par[0] * -10).toFixed(2) + "px " + (S.par[1] * -6).toFixed(2) + "px";
  }

  function posicionarCaixa(c) {
    caixaFoco.style.transform = "translate3d(" + c[0].toFixed(1) + "px," + c[1].toFixed(1) + "px,0)";
    caixaFoco.style.width = c[2].toFixed(1) + "px";
    caixaFoco.style.height = c[3].toFixed(1) + "px";
    // o rótulo não sai da tela: encosta para dentro nas duas bordas
    var sobra = M.w - 10 - (c[0] + rotulo.offsetWidth);
    var desvio = Math.max(10 - c[0], Math.min(0, sobra)).toFixed(1) + "px";
    if (rotulo.style.left !== desvio) rotulo.style.left = desvio;
    // o rótulo sobe acima do rosto; num celular baixo ali já é o título, e só a caixa aparece
    // (a cena e o título começam no alto do hero nos dois layouts)
    var topoRotulo = c[1] - M.folga - rotulo.offsetHeight;
    caixaFoco.classList.toggle("sem-rotulo", topoRotulo < cabeca.offsetTop + cabeca.offsetHeight + 8);
  }

  var rectBuf = new Float32Array(12), escBuf = new Float32Array(3), blurBuf = new Float32Array(3), recuoBuf = new Float32Array(3);

  function desenhar(t) {
    if (!GL || !GL.u || !GL.tex || !GL.pessoas) return;
    var gl = GL.gl, u = GL.u, d = M.dpr;
    // a câmera respira: um passeio lento e pequeno, somado ao cursor
    var seg = t / 1000;
    var px = S.par[0] + Math.sin(seg * 0.21) * 0.16, py = S.par[1] + Math.sin(seg * 0.13 + 1.3) * 0.12;
    ORDEM.forEach(function (id, i) {
      var b = M.rects[id], p = pessoas[id];
      rectBuf[i * 4] = (b.x - px * 10) * d;
      rectBuf[i * 4 + 1] = (b.y - py * 6) * d;
      rectBuf[i * 4 + 2] = b.w * d;
      rectBuf[i * 4 + 3] = b.h * d;
      escBuf[i] = GL.pessoas[i].larg / (b.w * d);
      blurBuf[i] = blurDe(p) * d;
      recuoBuf[i] = p.recuo;
    });
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform4f(u.uCobre, GL.cobre[0], GL.cobre[1], GL.cobre[2], GL.cobre[3]);
    gl.uniform1f(u.uFoco, S.foco);
    gl.uniform1f(u.uRaio, GL.raio);
    gl.uniform2f(u.uPar, px, py);
    gl.uniform1f(u.uTempo, seg);
    gl.uniform1f(u.uZoom, 1 + 0.035 * S.zoom);
    gl.uniform1f(u.uZoomTrio, 1 + 0.07 * S.zoom);
    gl.uniform2f(u.uCentroTrio, (M.trio.x + M.trio.w * 0.5) * d, (M.trio.y + M.trio.h) * d);
    gl.uniform1f(u.uTrio, S.trio);
    gl.uniform4fv(u.uRect, rectBuf);
    gl.uniform1fv(u.uEsc, escBuf);
    gl.uniform1fv(u.uBlur, blurBuf);
    gl.uniform1fv(u.uRecuo, recuoBuf);
    gl.uniform2f(u.uVale, GL.vale[0], GL.vale[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function quadro(t) {
    if (!rodando) return;
    var dt = Math.min(0.05, (t - (ultimo || t)) / 1000);
    ultimo = t;
    S.foco = amortecer(S.foco, S.focoAlvo, dt, 2.4);
    S.zoom = amortecer(S.zoom, S.zoomAlvo, dt, 0.9);
    S.trio = amortecer(S.trio, S.trioAlvo, dt, 3.5);
    S.par[0] = amortecer(S.par[0], S.parAlvo[0], dt, 3.2);
    S.par[1] = amortecer(S.par[1], S.parAlvo[1], dt, 3.2);
    ORDEM.forEach(function (id) {
      // no modo trio quem não está escolhido recua (desfoca um pouco); no modo cena os três já saem de foco pela lente
      var alvo = S.modo === "trio" && S.alvo && S.alvo !== "cena" && S.alvo !== id ? 1 : 0;
      pessoas[id].recuo = amortecer(pessoas[id].recuo, alvo, dt, 5);
    });
    moverDica(dt);
    aplicarPessoas();
    // a caixa de foco anda até o alvo e só aparece quando o foco já assentou
    var alvoCaixa = alvoDaCaixa();
    if (!S.caixa) S.caixa = alvoCaixa.slice();
    for (var i = 0; i < 4; i++) S.caixa[i] = amortecer(S.caixa[i], alvoCaixa[i], dt, 9);
    posicionarCaixa(S.caixa);
    // o nome só aparece quando a caixa chega no rosto; no caminho, a etiqueta some
    var longe = Math.abs(S.caixa[0] - alvoCaixa[0]) + Math.abs(S.caixa[1] - alvoCaixa[1]) > 14;
    caixaFoco.classList.toggle("andando", longe || !!S.rotulo);
    if (!longe) trocarRotulo();
    var assentou = S.alvo === "cena" ? Math.abs(S.foco - S.focoAlvo) < 0.12 : S.foco > 0.8;
    caixaFoco.classList.toggle("visivel", S.aberto && assentou && S.zoom < 0.35);
    // água, folhas, névoa e grão pedem ~30 quadros por segundo
    if (t - ultimoDesenho > 30) {
      desenhar(t);
      ultimoDesenho = t;
    }
    requestAnimationFrame(quadro);
  }

  function ligar() {
    if (rodando || !visivel || document.hidden || reduz) return;
    rodando = true;
    ultimo = 0;
    requestAnimationFrame(quadro);
  }

  function desligar() {
    rodando = false;
  }

  // ------------------------------------------------------------ abertura
  function abrir() {
    hero.classList.add("aberto");
    S.aberto = true;
    S.zoomAlvo = 0;
    mirar(S.escolhido);
    if (!GL) plano.classList.add("desfocado");
    if (!ponteiroFino) {
      ciclar();
      // no toque não há cursor para descobrir o clique: a dica aparece uma vez sobre o resort
      setTimeout(function () {
        if (S.tocou || S.modo !== "trio") return;
        var texto = "Toque no resort para vê-lo nítido";
        mostrarDica(texto, lugarDaDica(texto), true);
        setTimeout(function () { mostrarDica(null); }, 3600);
      }, 2600);
    }
  }

  // no celular, sem cursor, a caixa apresenta os três uma vez e volta ao Ênio, que é o padrão
  var ciclo = null;
  function ciclar() {
    if (reduz || ciclo) return;
    var fila = ["enio", "pablo", "nezio", "enio"], i = 0;
    ciclo = setInterval(function () {
      if (S.tocou || S.modo !== "trio" || ++i >= fila.length) {
        clearInterval(ciclo);
        return;
      }
      if (visivel) mirar(fila[i]);
    }, 3600);
  }

  // ------------------------------------------------------------ modos
  function focarTrio(quem) {
    S.modo = "trio";
    S.escolhido = quem;
    hero.classList.remove("no-resort");
    mirar(quem);
  }

  function focarCena() {
    S.modo = "cena";
    hero.classList.add("no-resort");
    mirar("cena");
  }

  // a dica do cursor: diz o que o clique faz, segue o cursor com um pouco de atraso
  var D = { xy: [0, 0], alvo: [0, 0], texto: null, fixa: false };
  function mostrarDica(texto, xy, fixa) {
    if (!dica) return;
    if (xy) {
      D.alvo = xy.slice();
      if (!D.texto || fixa) D.xy = xy.slice();
    }
    D.fixa = !!fixa;
    // dica fixa já nasce no lugar; com movimento reduzido o laço de quadros não roda e moverDica() nunca a levaria
    // até ali (ela ficava no canto de cima, sobre a logo): vai direto para o ponto, sem seguir o cursor com atraso
    if (reduz && xy) D.xy = xy.slice();
    if (texto === D.texto) { if (texto && (fixa || reduz)) posDica(); return; }
    D.texto = texto;
    if (texto) dica.textContent = texto;
    if (texto && (fixa || reduz)) posDica();
    dica.classList.toggle("visivel", !!texto);
  }

  // a dica nunca passa da borda direita da cena (no celular de 320px "Toque no resort…" saía cortada)
  function posDica() {
    var x = Math.min(D.xy[0] + 18, M.w - dica.offsetWidth - 8);
    dica.style.transform = "translate3d(" + Math.max(8, x).toFixed(1) + "px," + (D.xy[1] + 20).toFixed(1) + "px,0)";
  }

  // onde a dica fixa do toque pode ficar: fora dos três rostos e de onde cada rótulo aparece durante o ciclo (o rótulo
  // anda Ênio → Pablo → Nezio → Ênio enquanto ela está na tela). Procura do meio da cena para cima (o céu sobre o
  // resort, entre o título e os rótulos); se não couber (celular baixo), do meio para baixo. Devolve o ponto no
  // formato de mostrarDica() (posDica() soma 18 e 20)
  function lugarDaDica(texto) {
    var padrao = [M.w * 0.3, M.h * 0.5];
    if (!dica) return padrao;
    dica.textContent = texto;
    var dw = dica.offsetWidth, dh = dica.offsetHeight, m = 6;
    var bloqueios = [];
    var rw = Math.max(rotulo.offsetWidth, Math.min(230, M.w - 20)), rh = rotulo.offsetHeight || 60;
    var tetoTitulo = cabeca.offsetTop + cabeca.offsetHeight + 8;
    ORDEM.forEach(function (id) {
      var b = M.rects[id], f = pessoas[id].rosto;
      bloqueios.push([b.x + f[0] * b.w, b.y + f[1] * b.h, b.x + f[2] * b.w, b.y + f[3] * b.h]);
      // o rótulo de cada um, como posicionarCaixa() o põe (some quando não cabe abaixo do título)
      var c = rosto(id), topo = c[1] - M.folga - rh;
      if (topo >= tetoTitulo) {
        var esq = c[0] + Math.max(10 - c[0], Math.min(0, M.w - 10 - (c[0] + rw)));
        bloqueios.push([esq, topo, esq + rw, c[1] - M.folga]);
      }
    });
    var livre = function (x, y) {
      for (var i = 0; i < bloqueios.length; i++) {
        var q = bloqueios[i];
        if (x < q[2] + m && x + dw > q[0] - m && y < q[3] + m && y + dh > q[1] - m) return false;
      }
      return true;
    };
    var xs = [(M.w - dw) / 2, Math.max(8, Math.min(M.w - dw - 8, padrao[0] + 18))];
    var y0 = padrao[1] + 20, piso = M.h - dh - 8, y, k;
    var tentar = function (yy) {
      for (k = 0; k < xs.length; k++) if (livre(xs[k], yy)) return [xs[k] - 18, yy - 20];
      return null;
    };
    for (y = y0; y >= tetoTitulo; y -= 4) { var achou = tentar(y); if (achou) return achou; }
    for (y = y0; y <= piso; y += 4) { var achou2 = tentar(y); if (achou2) return achou2; }
    return padrao;
  }

  function moverDica(dt) {
    if (!dica || !D.texto) return;
    D.xy[0] = amortecer(D.xy[0], D.alvo[0], dt, 14);
    D.xy[1] = amortecer(D.xy[1], D.alvo[1], dt, 14);
    posDica();
  }

  // ------------------------------------------------------------ eventos
  function dentroDoTexto(alvo) {
    return !!(alvo && alvo.closest && alvo.closest(".hero__cabeca, .hero__base, a, button"));
  }

  function noQuadro(e) {
    var r = cena.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  function primeiroNome(id) {
    return pessoas[id].el.dataset.nome;
  }

  hero.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse" || !S.aberto) return;
    var p = noQuadro(e);
    S.ponteiro = p;
    S.parAlvo = [(p[0] / M.w - 0.5) * 2, (p[1] / M.h - 0.5) * 2];
    if (dentroDoTexto(e.target)) {
      S.apontando = false;
      mostrarDica(null);
      if (S.modo === "trio") mirar(S.escolhido);
      return;
    }
    var quem = quemEsta(p[0], p[1]);
    S.apontando = !!quem;
    hero.classList.toggle("sobre-pessoa", !!quem);
    if (S.modo === "trio") {
      // passar o cursor só escolhe entre os três; a paisagem precisa de clique
      mirar(quem || S.escolhido);
      mostrarDica(quem ? null : "Clique para ver o resort", p);
    } else {
      if (!quem) mirar("cena");
      mostrarDica(quem ? "Clique para focar em " + primeiroNome(quem) : null, p);
    }
  });

  hero.addEventListener("pointerleave", function (e) {
    if (e.pointerType !== "mouse") return;
    S.apontando = false;
    S.parAlvo = [0, 0];
    mostrarDica(null);
    hero.classList.remove("sobre-pessoa");
    if (S.aberto && S.modo === "trio") mirar(S.escolhido);
  });

  cena.addEventListener("click", function (e) {
    if (dentroDoTexto(e.target) || !S.aberto) return;
    var p = noQuadro(e);
    S.tocou = true;
    S.ponteiro = p;
    var quem = quemEsta(p[0], p[1]);
    if (quem) focarTrio(quem);
    else focarCena();
    mostrarDica(null);
    // parado (movimento reduzido) não há quadro a quadro: a caixa vai direto ao novo alvo
    if (reduz) posicionarCaixa(alvoDaCaixa());
  });

  window.addEventListener("resize", function () {
    medir();
    atualizarTexturas();
  });
  plano.addEventListener("load", function () { atualizarTexturas(); });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden) desligar();
    else ligar();
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (ent) {
      visivel = ent[0].isIntersecting;
      if (visivel) ligar();
      else desligar();
    }).observe(hero);
  }

  // ------------------------------------------------------------ início
  medir();
  prepararMascaras();

  if (reduz) {
    // parado: o trio nítido, a caixa no Ênio, nada se move
    S.foco = 1;
    S.zoom = 0;
    abrir();
    aplicarPessoas();
    var parada = function () {
      medir();
      posicionarCaixa(rosto("enio"));
      caixaFoco.classList.add("visivel");
    };
    parada();
    window.addEventListener("load", parada);
    plano.classList.add("desfocado");
    return;
  }

  // ------------------------------------------------------------ a cortina de abertura (GSAP)
  // a página nasce na névoa: a logo do Clube aparece grande no centro, com o fio de ouro e a data. Quando a cena está
  // pronta, a névoa sobe como uma cortina, de baixo para cima (o trio e o resort aparecem primeiro), e a logo voa até o
  // lugar dela ao lado do título; no meio da subida o título entra palavra a palavra e o foco vem para os três.
  // Sem GSAP, com a página já rolada ou com movimento reduzido, a abertura é a de sempre
  function cortina(glPronto) {
    var marcaReal = hero.querySelector(".hero__marca");
    if (!window.gsap || !marcaReal || window.scrollY > 40) return false;
    var gs = window.gsap;
    // a logo da página fica sem a escala de entrada do CSS: é medida e recebida no tamanho final
    gs.set(marcaReal, { opacity: 0, transform: "none" });
    var estilo = getComputedStyle(marcaReal);
    var mascara = estilo.webkitMaskImage || estilo.maskImage;
    var alvo = marcaReal.getBoundingClientRect();
    if (!alvo.width || !mascara || mascara === "none") { gs.set(marcaReal, { clearProps: "opacity,transform" }); return false; }

    var vw = window.innerWidth, vh = window.innerHeight;
    // a logo da abertura é a mesma da página, maior: no desktop a vertical, no celular a horizontal
    var largura = Math.min(alvo.width * (alvo.width > alvo.height * 2 ? 1.35 : 1.6), vw * 0.72);
    var altura = largura * alvo.height / alvo.width;

    var veu = document.createElement("div");
    veu.className = "abertura";
    veu.setAttribute("aria-hidden", "true");
    veu.innerHTML = '<div class="abertura__veu"></div><div class="abertura__marca"></div>' +
      '<div class="abertura__fio"></div><p class="abertura__data">24 · 25 nov 2026</p>';
    hero.appendChild(veu);
    hero.classList.add("sem-veu");
    var veuFundo = veu.querySelector(".abertura__veu");
    var marca = veu.querySelector(".abertura__marca");
    var fio = veu.querySelector(".abertura__fio");
    var data = veu.querySelector(".abertura__data");
    marca.style.webkitMaskImage = mascara;
    marca.style.maskImage = mascara;
    var x0 = (vw - largura) / 2, y0 = (vh - altura) / 2 - Math.min(40, vh * 0.04);
    gs.set(marca, { width: largura, height: altura, x: x0, y: y0 });
    gs.set(fio, { y: y0 + altura + 26 });
    gs.set(data, { y: y0 + altura + 42 });

    var entrada = gs.timeline();
    entrada
      .fromTo(marca, { opacity: 0, scale: 0.94, filter: "blur(8px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.9, ease: "power3.out" })
      .fromTo(fio, { scaleX: 0 }, { scaleX: 1, duration: 0.8, ease: "expo.out" }, 0.3)
      .fromTo(data, { opacity: 0, yPercent: 60 }, { opacity: 1, yPercent: 0, duration: 0.6, ease: "power3.out" }, 0.5);

    // a cortina espera a cena (no máximo 2,4 s) e fica pelo menos 1,3 s, para a logo ser lida
    var minimo = new Promise(function (ok) { setTimeout(ok, 1300); });
    var teto = new Promise(function (ok) { setTimeout(ok, 2400); });
    Promise.race([Promise.all([minimo, glPronto]), teto]).then(function () {
      // onde a logo pousa: medido de novo, a fonte pode ter carregado no meio
      var r = marcaReal.getBoundingClientRect(), h = hero.getBoundingClientRect();
      var escala = r.width / largura;
      var sai = gs.timeline({
        onComplete: function () {
          gs.set(marcaReal, { clearProps: "opacity,transform" });
          veu.remove();
        }
      });
      sai
        .to([fio, data], { opacity: 0, duration: 0.3, ease: "power2.in" }, 0)
        .to(veuFundo, { clipPath: "inset(0% 0% 100% 0%)", duration: 1.25, ease: "expo.inOut" }, 0.1)
        .to(marca, { x: r.left - h.left, y: r.top - h.top, scale: escala, transformOrigin: "0 0", duration: 1.2, ease: "expo.inOut" }, 0.1)
        // a logo pousa: a da página assume no mesmo lugar e a da cortina some
        .set(marcaReal, { opacity: 1 }, 1.3)
        .to(marca, { opacity: 0, duration: 0.15 }, 1.3)
        .add(abrir, 0.55);
    });
    return true;
  }

  aplicarPessoas();
  var glPronto = iniciarGL().then(function () {
    if (GL) {
      trio.classList.add("no-plano");
      cena.classList.add("gl");
      S.trioAlvo = 1;
      S.trio = 1;
      desenhar(performance.now());
      canvas.classList.add("pronto");
    }
    inicio = performance.now();
    ligar();
  });
  if (!cortina(glPronto)) {
    hero.classList.add("sem-veu");
    // sem a cortina: um respiro com o vale nítido antes do foco vir para os três
    glPronto.then(function () { setTimeout(abrir, GL ? 900 : 250); });
  }
})();
