// Pipeline de optimización de GLB pesados (assets de IA de 50-60MB → <1MB jugables).
//
// Uso:
//   npm run optimize:assets                        # procesa todo assets-src/models/environment
//   node scripts/optimize-assets.js --filter trees # solo una subcarpeta/nombre
//   node scripts/optimize-assets.js --in assets-src/models/cars --out assets/models/cars/processed --tris 80000
//
// Por archivo: dedup → weld → simplify (meshoptimizer) → prune → texturas a WebP
// redimensionadas → compresión EXT_meshopt_compression. El runtime ya decodifica
// meshopt vía MeshoptDecoder en src/asset-pipeline/AssetLoader.js.

import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, prune, textureCompress, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const IN_DIR = getArg('in', 'assets-src/models/environment');
const OUT_DIR = getArg('out', 'assets/models/environment');
const TARGET_TRIS = parseInt(getArg('tris', '22000'), 10);
const TEX_SIZE = parseInt(getArg('tex', '1024'), 10);
const FILTER = getArg('filter', '');
const MAX_OUTPUT_MB = parseFloat(getArg('max-mb', '1.5'));
// Error relativo permitido por el simplificador: para props que se ven a 20-90m
// un 2-4% es invisible; con 0.001 el simplificador se rinde antes del objetivo.
const SIMPLIFY_ERROR = parseFloat(getArg('error', '0.03'));
// Modo agresivo para "sopa de triángulos" de IA (miles de componentes sueltos):
// usa el flag experimental 'Prune' de meshoptimizer, que sí elimina componentes
// desconectados pequeños — el simplificador topológico normal se atasca en ellos.
const SLOPPY = args.includes('--sloppy');

function* walkGlbs(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkGlbs(full);
    else if (entry.name.toLowerCase().endsWith('.glb')) yield full;
  }
}

function countTris(doc) {
  let tris = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      tris += (indices ? indices.getCount() : prim.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return Math.round(tris);
}

async function optimizeFile(io, srcPath) {
  const rel = path.relative(IN_DIR, srcPath);
  const outPath = path.join(OUT_DIR, rel);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const srcMB = fs.statSync(srcPath).size / 1048576;
  const doc = await io.read(srcPath);
  const trisBefore = countTris(doc);

  // Ratio de simplificación relativo al objetivo de triángulos
  const ratio = Math.min(1, TARGET_TRIS / Math.max(trisBefore, 1));

  if (SLOPPY) {
    await doc.transform(dedup(), weld());
    await bakeWeldSimplify(doc, ratio, Math.max(SIMPLIFY_ERROR, 0.25));
    await doc.transform(prune()); // las texturas horneadas quedan huérfanas y se van
  } else {
    await doc.transform(
      dedup(),
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio, error: SIMPLIFY_ERROR }),
      prune(),
      textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [TEX_SIZE, TEX_SIZE]
      })
    );
  }

  const trisAfter = countTris(doc);
  await io.write(outPath, doc);

  const outMB = fs.statSync(outPath).size / 1048576;
  const ok = outMB <= MAX_OUTPUT_MB;
  console.log(
    `${ok ? '✓' : '✗'} ${rel}  ${srcMB.toFixed(1)}MB → ${outMB.toFixed(2)}MB  ` +
    `tris ${trisBefore.toLocaleString()} → ${trisAfter.toLocaleString()}`
  );
  if (!ok) {
    console.error(`  ✗ Supera el presupuesto de ${MAX_OUTPUT_MB}MB — bajá --tris o --tex.`);
  }
  return ok;
}

// Pipeline para "sopa de triángulos" de IA (islas UV por triángulo → cada arista
// es un seam y el simplificador topológico no puede colapsar nada):
//   1. Hornear la textura baseColor a COLOR de vértice (muestreo por UV).
//   2. Soldar por POSICIÓN (reconstruye la conectividad real, promedia colores).
//   3. Simplificar agresivo sobre la topología ya conectada.
// El resultado usa vertex colors sin texturas: ideal para props a 20-90 m.
async function bakeWeldSimplify(doc, ratio, error) {
  // Todo accessor nuevo debe colgar de un Buffer para poder serializarse a GLB
  const buffer = doc.getRoot().listBuffers()[0] || doc.createBuffer();
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue; // solo TRIANGLES
      const posAcc = prim.getAttribute('POSITION');
      if (!posAcc) continue;

      const positions = posAcc.getArray();
      const vertCount = posAcc.getCount();
      const uvAcc = prim.getAttribute('TEXCOORD_0');
      const material = prim.getMaterial();

      // --- 1. Color por vértice: textura muestreada por UV (o baseColorFactor) ---
      const factor = material?.getBaseColorFactor() || [1, 1, 1, 1];
      let sampler = () => [factor[0] * 255, factor[1] * 255, factor[2] * 255];
      const texture = material?.getBaseColorTexture();
      if (texture && uvAcc) {
        const { data, info } = await sharp(Buffer.from(texture.getImage()))
          .ensureAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const uvs = uvAcc.getArray();
        sampler = (i) => {
          let u = uvs[i * 2] % 1;
          let v = uvs[i * 2 + 1] % 1;
          if (u < 0) u += 1;
          if (v < 0) v += 1;
          const px = Math.min(info.width - 1, Math.floor(u * info.width));
          const py = Math.min(info.height - 1, Math.floor(v * info.height));
          const o = (py * info.width + px) * 4;
          return [data[o] * factor[0], data[o + 1] * factor[1], data[o + 2] * factor[2]];
        };
      }

      // --- 2. Soldadura por posición (epsilon relativo al tamaño del modelo) ---
      let maxExtent = 0;
      for (let i = 0; i < positions.length; i++) {
        maxExtent = Math.max(maxExtent, Math.abs(positions[i]));
      }
      const inv = 1 / Math.max(maxExtent * 1e-3, 1e-6);

      const clusterOf = new Map();
      const remap = new Uint32Array(vertCount);
      const outPos = [];
      const colSum = [];
      for (let i = 0; i < vertCount; i++) {
        const x = positions[i * 3];
        const y = positions[i * 3 + 1];
        const z = positions[i * 3 + 2];
        const key = `${Math.round(x * inv)}_${Math.round(y * inv)}_${Math.round(z * inv)}`;
        let idx = clusterOf.get(key);
        if (idx === undefined) {
          idx = outPos.length / 3;
          clusterOf.set(key, idx);
          outPos.push(x, y, z);
          colSum.push([0, 0, 0, 0]);
        }
        remap[i] = idx;
        const c = sampler(i);
        const acc = colSum[idx];
        acc[0] += c[0];
        acc[1] += c[1];
        acc[2] += c[2];
        acc[3] += 1;
      }

      const srcIdxAcc = prim.getIndices();
      const srcIndices = srcIdxAcc
        ? srcIdxAcc.getArray()
        : Array.from({ length: vertCount }, (_, i) => i);
      const weldedIdx = [];
      for (let t = 0; t < srcIndices.length; t += 3) {
        const a = remap[srcIndices[t]];
        const b = remap[srcIndices[t + 1]];
        const c = remap[srcIndices[t + 2]];
        if (a !== b && b !== c && a !== c) weldedIdx.push(a, b, c); // sin degenerados
      }

      // --- 3. Simplificación sobre topología conectada ---
      const weldedPositions = new Float32Array(outPos);
      const indices = new Uint32Array(weldedIdx);
      const targetIndexCount = Math.max(3, Math.floor((srcIndices.length * ratio) / 3) * 3);
      const [newIndices] = MeshoptSimplifier.simplify(
        indices,
        weldedPositions,
        3,
        Math.min(targetIndexCount, indices.length),
        error,
        []
      );

      const colors = new Uint8Array((outPos.length / 3) * 3);
      for (let i = 0; i < colSum.length; i++) {
        const [r, g, b, n] = colSum[i];
        colors[i * 3] = r / n;
        colors[i * 3 + 1] = g / n;
        colors[i * 3 + 2] = b / n;
      }

      // --- Reescribir la primitiva: posición + color, sin UV/normales/textura ---
      for (const name of prim.listSemantics()) prim.setAttribute(name, null);
      const posOut = doc.createAccessor().setType('VEC3').setArray(weldedPositions).setBuffer(buffer);
      const colOut = doc.createAccessor().setType('VEC3').setArray(colors).setNormalized(true).setBuffer(buffer);
      prim.setAttribute('POSITION', posOut);
      prim.setAttribute('COLOR_0', colOut);
      const idxOut = doc.createAccessor().setType('SCALAR').setArray(newIndices).setBuffer(buffer);
      prim.setIndices(idxOut);
      compactPrimitive(prim);

      if (material) {
        material.setBaseColorTexture(null);
        material.setMetallicRoughnessTexture(null);
        material.setNormalTexture(null);
        material.setOcclusionTexture(null);
        material.setEmissiveTexture(null);
        material.setBaseColorFactor([1, 1, 1, 1]);
        material.setMetallicFactor(0);
        material.setRoughnessFactor(1);
        material.setDoubleSided(true); // follaje: visible de ambos lados
      }
    }
  }
}

async function main() {
  await MeshoptSimplifier.ready;
  await MeshoptEncoder.ready;
  MeshoptSimplifier.useExperimentalFeatures = true; // habilita el flag 'Prune'

  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

  const files = [...walkGlbs(IN_DIR)].filter((f) => !FILTER || f.includes(FILTER));
  if (files.length === 0) {
    console.log(`No hay .glb en ${IN_DIR}${FILTER ? ` con filtro "${FILTER}"` : ''}.`);
    return;
  }

  console.log(`Optimizando ${files.length} archivo(s): ${IN_DIR} → ${OUT_DIR}`);
  console.log(`Objetivo: ~${TARGET_TRIS.toLocaleString()} tris, texturas ${TEX_SIZE}px WebP, meshopt.\n`);

  let failures = 0;
  for (const file of files) {
    try {
      if (!(await optimizeFile(io, file))) failures++;
    } catch (err) {
      failures++;
      console.error(`✗ ${file}: ${err.message}`);
      if (process.env.DEBUG_OPT) console.error(err.stack);
    }
  }

  console.log(failures ? `\n${failures} archivo(s) con problemas.` : '\nTodo optimizado dentro de presupuesto.');
  process.exitCode = failures ? 1 : 0;
}

main();
