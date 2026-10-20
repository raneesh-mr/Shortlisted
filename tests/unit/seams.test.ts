import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { features } from "@/config/features";
import { plans } from "@/lib/payments/types";

function files(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("Phase 5 seams", () => {
  it("keeps unbuilt features off", () => {
    expect(features.referrals).toBe(false);
    expect(features.payments).toBe(false);
    expect(features.analytics).toBe(false);
    expect(plans).toEqual([]);
  });

  // ms-/me-/ps-/pe-/start-/end-/text-start keep Arabic (RTL) working without rework.
  const physical = /(?<![\w-])-?(ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|border-l|border-r|float-left|float-right)(-[\w[\]./]+)?(?![\w-])/g;

  it("the RTL guard catches physical classes and allows logical ones", () => {
    expect("p-2 ml-2 text-right".match(physical)).toEqual(["ml-2", "text-right"]);
    expect("ms-2 pe-4 start-0 text-start border-s-2".match(physical)).toBeNull();
  });

  it("layout stays RTL-safe: no physical left/right Tailwind classes", () => {
    const offenders: string[] = [];
    for (const f of [...files(join(process.cwd(), "app")), ...files(join(process.cwd(), "components"))]) {
      for (const m of readFileSync(f, "utf8").matchAll(/className=\{?[`"]([^`"]*)[`"]/g)) {
        for (const hit of m[1]!.matchAll(physical)) offenders.push(`${f.replace(process.cwd(), "")}: ${hit[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
