import consola from "consola";
import esbuild from "esbuild";
import fs from "fs/promises";
import path from "path";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const pkg = require("../package.json");

// 辞書ファイルをlib/にコピーする関数
async function copyDictionaries() {
  const dictSources = [
    { name: "kuromoji", src: "node_modules/kuromoji/dict", dest: "lib/kuromoji" },
    { name: "kuromoji-neologd", src: "node_modules/kuromoji-neologd/dict", dest: "lib/kuromoji-neologd" },
  ];

  for (const { name, src, dest } of dictSources) {
    try {
      await fs.mkdir(dest, { recursive: true });
      const files = await fs.readdir(src);
      for (const file of files) {
        const srcPath = path.join(src, file);
        const destPath = path.join(dest, file);
        await fs.copyFile(srcPath, destPath);
      }
      consola.success(`Copied ${name} dictionary to ${dest}`);
    } catch (err) {
      consola.error(`Failed to copy ${name} dictionary:`, err);
    }
  }
}

// This plugin provides the source code for the CJS build,
// with the problematic ESM-only lines already removed.
const cjsSourcePlugin = {
  name: "cjs-source",
  setup(build) {
    build.onResolve({ filter: /^cjs-entry$/ }, () => ({
      path: "cjs-entry",
      namespace: "cjs-source-ns",
    }));

    build.onLoad({ filter: /.*/, namespace: "cjs-source-ns" }, async () => {
      let contents = await fs.readFile("src/index.ts", "utf8");
      const esmDirnameLogicRegex =
        /const __filename = fileURLToPath\(import\.meta\.url\);(?:\r\n|\n|\r)\s*const __dirname = path\.dirname\(__filename\);/;
      contents = contents.replace(esmDirnameLogicRegex, "");
      return {
        contents,
        loader: "ts",
        resolveDir: "src",
      };
    });
  },
};

const commonOptions = {
  platform: "node",
  bundle: true,
  external: Object.keys(pkg.dependencies || {}),
};

// --- Build ESM (.js) ---
esbuild
  .build({
    ...commonOptions,
    entryPoints: ["src/index.ts"],
    outfile: "dist/index.js",
    format: "esm",
  })
  .catch((err) => consola.error("Faled to build ESM:", err))
  .then(() => consola.success("ESM build successful!"));

// --- Build CJS (.cjs) ---
esbuild
  .build({
    ...commonOptions,
    entryPoints: ["cjs-entry"], // Use a virtual entry point
    outfile: "dist/index.cjs",
    format: "cjs",
    plugins: [cjsSourcePlugin], // Use the new, more robust plugin
  })
  .catch((err) => consola.error("Faled to build CJS:", err))
  .then(() => consola.success("CJS build successful!"));

// --- Build CLI ---
esbuild
  .build({
    ...commonOptions,
    entryPoints: ["src/cli.ts"],
    outfile: "dist/cli.js",
    format: "esm",
    banner: {
      js: "#!/usr/bin/env node",
    },
  })
  .catch((err) => consola.error("Failed to build CLI:", err))

// --- Copy dictionaries to lib/ ---
copyDictionaries()
  .then(() => consola.success("CLI build successful!"));
