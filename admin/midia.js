/* Fotos enviadas pelo painel: o navegador gera as versões em WebP nas larguras que a página usa e envia todas ao bucket
   (midia/<slug>/<nome>-<largura>.webp). O JSON guarda "midia:<slug>/<nome>". */

export const TIPOS_IMAGEM = ["image/jpeg", "image/png", "image/webp"];
export const LIMITE_MB = 25;
export const LARGURAS_PADRAO = [800, 1280, 1400, 1600];

// larguras que o elemento pede: data-larguras="480 800" do renderizador, ou as do srcset, ou o padrão
export function largurasDe(img) {
  const attr = img?.getAttribute?.("data-larguras");
  if (attr) return attr.split(/[\s,]+/).map(Number).filter((n) => n > 0).sort((a, b) => a - b);
  const conj = new Set();
  const fontes = img ? [img, ...(img.closest("picture")?.querySelectorAll("source") || [])] : [];
  for (const f of fontes) {
    for (const m of String(f.getAttribute("srcset") || "").matchAll(/\s(\d+)w/g)) conj.add(Number(m[1]));
  }
  const w = Number(img?.getAttribute?.("width"));
  if (!conj.size && w > 0) conj.add(w);
  return conj.size ? [...conj].sort((a, b) => a - b) : LARGURAS_PADRAO;
}

export function slugArquivo(nome) {
  const base = String(nome || "foto").replace(/\.[^.]+$/, "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 36) || "foto";
  return `${base}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

async function decodificar(arquivo) {
  if ("createImageBitmap" in window) {
    try { return await createImageBitmap(arquivo, { imageOrientation: "from-image" }); } catch { /* cai no <img> */ }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

// variantes nas larguras min(L, largura da foto), sem repetir (regra do renderizador: LARGURAS_MIDIA)
export async function gerarVariantes(arquivo, larguras, { tipo = "image/webp", qualidade = 0.82 } = {}) {
  const fonte = await decodificar(arquivo);
  const W = fonte.width, H = fonte.height;
  const alvo = [...new Set(larguras.map((l) => Math.min(l, W)))].sort((a, b) => a - b);
  const saida = [];
  for (const l of alvo) {
    const h = Math.round((H * l) / W);
    const c = document.createElement("canvas");
    c.width = l; c.height = h;
    const g = c.getContext("2d");
    g.imageSmoothingQuality = "high";
    if (tipo === "image/jpeg") { g.fillStyle = "#fff"; g.fillRect(0, 0, l, h); }
    g.drawImage(fonte, 0, 0, l, h);
    const blob = await new Promise((ok, erro) => c.toBlob((b) => (b ? ok(b) : erro(new Error("O navegador não gerou a imagem."))), tipo, qualidade));
    if (blob.type !== tipo) throw new Error("Este navegador não gera WebP. Use o Chrome, o Edge ou o Safari atualizado.");
    saida.push({ largura: l, altura: h, blob });
  }
  fonte.close?.();
  return { variantes: saida, largura: W, altura: H };
}

// envia as variantes webp (e um JPG, quando a foto é a de compartilhar no WhatsApp); aoProgresso(0..1).
// Devolve o objeto de imagem do JSON v2: { src: "midia:<slug>/<nome>", w, h, larguras }
export async function enviarFoto(sb, { bucket, slug, arquivo, larguras, jpg, aoProgresso }) {
  aoProgresso?.(0.03);
  const { variantes } = await gerarVariantes(arquivo, larguras);
  const extra = jpg ? (await gerarVariantes(arquivo, [jpg], { tipo: "image/jpeg", qualidade: 0.86 })).variantes : [];
  const nome = slugArquivo(arquivo.name);
  const envios = [
    ...variantes.map((v) => ({ destino: `${slug}/${nome}-${v.largura}.webp`, blob: v.blob, tipo: "image/webp" })),
    ...extra.map((v) => ({ destino: `${slug}/${nome}-${v.largura}.jpg`, blob: v.blob, tipo: "image/jpeg" })),
  ];
  let feitos = 0;
  aoProgresso?.(0.08);
  for (const e of envios) {
    const { error } = await sb.storage.from(bucket).upload(e.destino, e.blob, { cacheControl: "31536000", upsert: false, contentType: e.tipo });
    if (error) throw error;
    feitos++;
    aoProgresso?.(0.08 + (0.92 * feitos) / envios.length);
  }
  const maior = variantes.at(-1);
  return { src: `midia:${slug}/${nome}`, w: maior.largura, h: maior.altura, larguras: variantes.map((v) => v.largura) };
}
