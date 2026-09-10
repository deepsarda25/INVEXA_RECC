// This file has exactly one job, done in this exact order, before the real
// application (server.ts) is allowed to load at all:
//
//   1. Install the reflect-metadata polyfill.
//   2. Verify it actually took effect.
//   3. Only then load the rest of the app.
//
// Why this song and dance: @simplewebauthn/server (added for fingerprint
// login) pulls in @peculiar/x509 (attestation certificate verification),
// which depends on tsyringe — a dependency-injection library that requires
// Reflect.getMetadata to exist globally before it's evaluated, or it throws
// immediately: "tsyringe requires a reflect polyfill."
//
// The standard fix is `import "reflect-metadata"` at the top of the entry
// point. That does NOT reliably work under Bun: ES module `import`
// declarations are hoisted and evaluated as part of a single static
// dependency graph, and — empirically, under Bun 1.1.30 — a plain import
// positioned "first" in the source does not guarantee it finishes
// evaluating before a *different* import's transitive chain (server.ts's
// eventual import of the webauthn module, and so on down to tsyringe) does.
// This is true even if that other import is written later in the file: it
// is still part of the same static graph, resolved together.
//
// A *dynamic* `import()` is not part of that static graph. It's a genuine
// runtime operation that only begins once the calling code actually
// reaches it during execution — so by using createRequire() (synchronous,
// runs immediately, not hoisted) to install the polyfill first, and then
// `await import("./server")` for literally everything else, we get a real,
// guaranteed ordering instead of relying on Bun's static-import evaluation
// order for something this fragile.
import { createRequire } from "node:module";

createRequire(import.meta.url)("reflect-metadata");

if (typeof Reflect === "undefined" || typeof (Reflect as any).getMetadata !== "function") {
  throw new Error(
    "reflect-metadata polyfill failed to install (Reflect.getMetadata is still missing). " +
      "This must be resolved before @simplewebauthn/server (and its @peculiar/x509 dependency) can be loaded."
  );
}

await import("./server");
