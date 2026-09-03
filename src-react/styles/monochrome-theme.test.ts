import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const coloredTailwind = /(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}/g;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!/\.(?:css|ts|tsx)$/.test(entry.name) || entry.name.includes(".test.")) return [];
    return [path];
  });
}

function lineNumber(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function achromaticHex(value: string): boolean {
  const raw = value.slice(1);
  const expanded = raw.length <= 4 ? raw.split("").map((digit) => digit + digit).join("") : raw;
  return expanded.slice(0, 2).toLowerCase() === expanded.slice(2, 4).toLowerCase()
    && expanded.slice(2, 4).toLowerCase() === expanded.slice(4, 6).toLowerCase();
}

describe("monochrome interface contract", () => {
  const files = sourceFiles(sourceRoot);

  it("contains no colored Tailwind palette utilities", () => {
    const violations = files.flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return Array.from(source.matchAll(coloredTailwind), (match) =>
        `${relative(sourceRoot, file)}:${lineNumber(source, match.index ?? 0)} ${match[0]}`,
      );
    });

    expect(violations).toEqual([]);
  });

  it("contains only achromatic static CSS colors", () => {
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/#(?:[\da-fA-F]{3,4}|[\da-fA-F]{6}|[\da-fA-F]{8})\b/g)) {
        if (!achromaticHex(match[0])) {
          violations.push(`${relative(sourceRoot, file)}:${lineNumber(source, match.index ?? 0)} ${match[0]}`);
        }
      }
      for (const match of source.matchAll(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/g)) {
        if (!(match[1] === match[2] && match[2] === match[3])) {
          violations.push(`${relative(sourceRoot, file)}:${lineNumber(source, match.index ?? 0)} ${match[0]}`);
        }
      }
      for (const match of source.matchAll(/hsla?\(\s*[-\d.]+(?:deg)?\s*,\s*([\d.]+)%/g)) {
        if (Number(match[1]) !== 0) {
          violations.push(`${relative(sourceRoot, file)}:${lineNumber(source, match.index ?? 0)} ${match[0]}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("does not desaturate the application or media at the root", () => {
    const globalStyles = readFileSync(join(sourceRoot, "styles/index.css"), "utf8");
    expect(globalStyles).not.toMatch(/(?:html|body|#root)[^{]*\{[^}]*\bfilter\s*:/s);
    expect(globalStyles).not.toContain("studio-page-glow");
  });
});
