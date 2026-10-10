#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Raiz do pacote (onde vive node_modules). Rodamos o node A PARTIR daqui para o
// tsx/esbuild resolverem as deps DA IMAGEM, não as do checkout montado (que
// podem ser de outro SO).
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// O repositório a revisar é o diretório de onde a CLI foi chamada.
const repoPath = process.cwd();

const result = spawnSync(
  process.execPath,
  ["--import", "tsx", join(root, "src", "cli.ts"), "--repo-path", repoPath, ...process.argv.slice(2)],
  { stdio: "inherit", cwd: root },
);
process.exit(result.status ?? 1);
