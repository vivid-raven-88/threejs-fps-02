// Kestrel Yard — entrypoint. Copies game/ and screenshots/ to /output and writes
// /output/dossier.json with the kit's buildDossier. Node 22, standard library only.
// Deterministic: the same repository always hands in the same bytes.
import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const REPO = dirname(fileURLToPath(import.meta.url));
const OUT = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function copyTree(src: string, dst: string): number {
  mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const name of readdirSync(src).sort()) {
    const from = join(src, name);
    const to = join(dst, name);
    if (statSync(from).isDirectory()) n += copyTree(from, to);
    else { cpSync(from, to); n++; }
  }
  return n;
}

function main(): void {
  const gameDir = join(REPO, 'game');
  const shotsDir = join(REPO, 'screenshots');
  if (!existsSync(join(gameDir, 'index.html'))) throw new Error('game/index.html is missing');
  if (!existsSync(shotsDir)) throw new Error('screenshots/ is missing: hand in 3 or 4 renders of the game');

  mkdirSync(OUT, { recursive: true });
  const gameFiles = copyTree(gameDir, join(OUT, 'game'));
  const shotFiles = copyTree(shotsDir, join(OUT, 'screenshots'));

  const dossier = buildDossier(REPO, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 48 * 1024 * 1024,
    game_path_max_bytes: 1000,
  });
  writeFileSync(join(OUT, 'dossier.json'), dossier);
  // Self-check: building the dossier again must produce the exact same bytes,
  // so the two grader runs agree with each other.
  const again = buildDossier(REPO, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 48 * 1024 * 1024,
    game_path_max_bytes: 1000,
  });
  if (!dossier.every((b, i) => b === again[i])) throw new Error('dossier is not deterministic');
  const textBytes = Buffer.byteLength(JSON.parse(Buffer.from(dossier).toString('utf8')).text, 'utf8');
  console.log(`kestrel-yard: ${gameFiles} game files, ${shotFiles} screenshots, dossier ${dossier.length} bytes (text ${textBytes}) -> ${OUT}`);
}

main();
