import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// src/shared/ → a raiz do projeto fica dois níveis acima.
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const FRAMEWORK = join(PROJECT_ROOT, "ahrena", "ahrena-framework");
const ENGINEERING = join(FRAMEWORK, "engineering");

/**
 * Plugins do ahrena-framework que o Argos orquestrador precisa carregar: o
 * próprio `code-review` (o orquestrador), o `quality` (router + publicação do
 * verdict + landing + docs), as regras (`fundamentals`), e as lenses
 * (`security`, as linguagens e `foundation`). As lenses que disparam são
 * decididas pelo `routes.json`, que referencia skills nesses plugins.
 */
export const PLUGINS = [
  join(ENGINEERING, "code-review"),
  join(ENGINEERING, "quality"),
  join(ENGINEERING, "fundamentals"),
  join(ENGINEERING, "security"),
  join(ENGINEERING, "typescript"),
  join(ENGINEERING, "python"),
  join(ENGINEERING, "go"),
  join(ENGINEERING, "rust"),
  join(FRAMEWORK, "foundation"),
];
