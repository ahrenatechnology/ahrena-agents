import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// src/shared/ → a raiz do projeto fica dois níveis acima.
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FRAMEWORK = join(PROJECT_ROOT, "ahrena", "ahrena-framework");

/** Plugin `quality` do ahrena-framework: agentes + skills + hooks. */
export const QUALITY_PLUGIN = join(FRAMEWORK, "engineering", "quality");

/** Roteador de review do framework (decide quais skills a mudança seleciona). */
export const ROUTE_REVIEW_HOOK = join(QUALITY_PLUGIN, "hooks", "route-review.py");
