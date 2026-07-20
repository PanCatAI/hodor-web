import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const vendorRoot = fileURLToPath(new URL(".", import.meta.url));

function read(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

test("pins the vendored director desk source and preserves its licenses", () => {
  const source = JSON.parse(read("VENDOR_SOURCE.json"));
  const license = read("LICENSE");
  const modelLicense = read("assets/ue-mannequin-retopology.license.txt");

  assert.equal(source.repository, "https://github.com/jiguang132/storyai-3d-director-desk.git");
  assert.equal(source.commit, "8c8bd361790be4d37158a7430365e65546e358fe");
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 YZ/);
  assert.match(modelLicense, /sketchfab\.com\/3d-models\/ue-mannequin-retopology/);
  assert.ok(statSync(`${vendorRoot}/assets/ue-mannequin-retopology.glb`).size > 0);
});

test("exports a native React component for the Hodor route", () => {
  const entry = read("src/embed.tsx");

  assert.match(entry, /StoryAiDirectorDesk/);
  assert.match(entry, /export default StoryAiDirectorDesk/);
  assert.match(entry, /\.\/App/);
  assert.match(entry, /DirectorAssetRef/);
  assert.match(entry, /DirectorObject/);
  assert.doesNotMatch(entry, /DirectorProjectAsset|DirectorProjectObject/);
});

test("bundles the mannequin with the component instead of relying on a page-relative public path", () => {
  const rigSource = read("src/editor/runtime/ue4Mannequin/ue4MannequinRig.ts");

  assert.match(rigSource, /new URL\([\s\S]*ue-mannequin-retopology\.glb[\s\S]*import\.meta\.url/);
  assert.doesNotMatch(rigSource, /import\.meta\.env\.BASE_URL/);
});

test("keeps upstream global styles inside the embedded component", () => {
  const appSource = read("src/App.tsx");
  const embedSource = read("src/embed.tsx");

  assert.doesNotMatch(appSource, /styles\/index\.css/);
  assert.match(embedSource, /styles\/index\.css\?inline/);
  assert.match(embedSource, /attachShadow/);
});
