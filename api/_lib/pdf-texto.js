'use strict';
/*
 * Leitura simples do texto da 2ª via do VerSan (PDF gerado com fontes padrão Helvetica/WinAnsi).
 * Descomprime os streams FlateDecode e coleta cada texto (Tj) com a posição (x, y) na página.
 * Não depende de bibliotecas externas.
 */
const zlib = require('zlib');

function unescapePdf(t) {
  return t.replace(/\\([nrtbf()\\]|[0-7]{1,3})/g, (a, b) => {
    const map = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' };
    return map[b] !== undefined ? map[b] : String.fromCharCode(parseInt(b, 8));
  });
}

function streams(buf) {
  const bin = buf.toString('latin1');
  const out = [];
  const re = /(?<!end)stream\r?\n/g;
  let m;
  while ((m = re.exec(bin))) {
    const start = m.index + m[0].length;
    const dict = bin.slice(bin.lastIndexOf('<<', m.index), m.index);
    const L = Number((dict.match(/\/Length\s+(\d+)(?!\s+\d+\s+R)/) || [])[1] || 0);
    const end = L ? start + L : bin.indexOf('endstream', start);
    if (end <= start) continue;
    if (/FlateDecode/.test(dict)) {
      try { out.push(zlib.inflateSync(buf.subarray(start, end)).toString('latin1')); } catch { /* ignora stream inválido */ }
    }
    re.lastIndex = end;
  }
  return out;
}

/** Lista de { x, y, texto } de todo o documento. */
function textos(buf) {
  const lista = [];
  for (const s of streams(buf)) {
    if (!/T[jJ]/.test(s)) continue;
    let x = 0, y = 0;
    for (const op of s.split(/\r?\n/)) {
      let mm;
      if ((mm = op.match(/^\s*1 0 0 1 ([-\d.]+) ([-\d.]+) Tm\s*$/))) { x = +mm[1]; y = +mm[2]; continue; }
      if ((mm = op.match(/^\s*([-\d.]+) ([-\d.]+) Td\s*$/))) { x += +mm[1]; y += +mm[2]; continue; }
      if ((mm = op.match(/^\s*\((.*)\)\s*Tj\s*$/))) {
        const t = unescapePdf(mm[1]).trim();
        if (t) lista.push({ x, y, texto: t });
      }
    }
  }
  return lista;
}

/** Valor ao lado de um rótulo (mesma linha, à direita). Ex.: rotulo "Endereço:". */
function valorDoRotulo(lista, rotulo) {
  const r = lista.find(t => t.texto.toLowerCase() === rotulo.toLowerCase());
  if (!r) return '';
  const candidatos = lista.filter(t => t !== r && Math.abs(t.y - r.y) <= 2 && t.x > r.x).sort((a, b) => a.x - b.x);
  return candidatos.length ? candidatos[0].texto : '';
}

module.exports = { textos, valorDoRotulo };
