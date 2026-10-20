import { tokens } from "@/lib/import/text";
import { detectSpelling } from "@/lib/voice/profile";
import { splitBoilerplate } from "./boilerplate";
import type { JdAnalysis, Requirement } from "./schema";

/** Deterministic job-description analysis. Everything it returns is copied from the text. */

const BULLET = /^\s*(?:[•\-*–·▪●◦‣►✓]|\d+[.)])\s*/;
const HEADINGS: [keyof Pick<JdAnalysis, "must_have" | "nice_to_have" | "responsibilities">, RegExp][] = [
  ["nice_to_have", /^(nice[- ]to[- ]haves?|desirable|preferred( qualifications| skills)?|bonus( points)?|it would be (great|nice|a plus)|plus|additional skills)\b/i],
  [
    "must_have",
    /^(requirements|qualifications|essential( skills| criteria| requirements)?|what you('|’)?ll need|what we('|’)?re looking for|must[- ]haves?|about you|skills( and| &) experience|experience( required)?|who you are|you have|minimum qualifications|key skills)\b/i,
  ],
  ["responsibilities", /^(key )?(responsibilities|duties|what you('|’)?ll do|the role|your role|role overview|accountabilities|day[- ]to[- ]day|in this role)\b/i],
];
const OTHER_HEADING = /^(about (us|the company|the team)|who we are|our (company|story|mission)|how to apply|the company)\b/i;

const KNOWN_TOOLS = [
  "Excel", "Word", "PowerPoint", "Outlook", "Microsoft Office", "Office 365", "Google Workspace", "Salesforce", "HubSpot", "Jira",
  "Confluence", "Slack", "SAP", "Oracle", "Tableau", "Power BI", "Python", "Java", "JavaScript", "TypeScript", "React", "Node.js",
  "SQL", "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Figma", "Photoshop", "Illustrator", "AutoCAD", "Revit", "QuickBooks",
  "Xero", "Zendesk", "Workday", "SharePoint", "Google Analytics", "Git", "Maximo", "Yardi", "CAFM", "BIM", "Canva",
];
const NOT_TOOLS = new Set(["CV", "OK", "USA", "UK", "US", "UAE", "EU", "KSA", "GCC", "HR", "CEO", "CFO", "COO", "CTO", "FAQ", "ASAP", "AM", "PM", "LLC", "LTD", "INC", "TBC", "N/A", "NA"]);

const GENERIC = new Set(
  (
    "experience years year ability able strong excellent good great knowledge skills skill work working including include " +
    "using use within across must will would should can role candidate candidates team teams company job position " +
    "responsible responsibility responsibilities ensure ensuring support supporting provide providing other related " +
    "required requirement requirements preferred plus etc minimum least well new high level levels key we you our your " +
    "their this that these those who which also more all any each per day days time through into from about under over via"
  ).split(" "),
);

const LANGUAGES = ["English", "Arabic", "French", "German", "Spanish", "Hindi", "Urdu", "Mandarin", "Cantonese", "Japanese", "Portuguese", "Italian", "Dutch", "Russian", "Tagalog", "Malay", "Korean", "Turkish", "Polish", "Swedish"];

const clean = (s: string) => s.replace(BULLET, "").replace(/\s+/g, " ").trim().replace(/[;,]$/, "");
const isHeadingLine = (l: string) => {
  const t = l.trim().replace(/:$/, "");
  return t.length > 0 && t.length <= 60 && t.split(/\s+/).length <= 7 && !/[.!?]$/.test(t) && /^[A-Z]/.test(t);
};

function extractTools(text: string): string[] {
  const found = new Map<string, string>();
  for (const tool of KNOWN_TOOLS) {
    const re = new RegExp(`(?<![\\p{L}])${tool.replace(/[.+]/g, "\\$&")}(?![\\p{L}])`, "u");
    if (re.test(text)) found.set(tool.toLowerCase(), tool);
  }
  for (const m of text.matchAll(/\b([A-Z]{2,6}s?|[A-Z][a-z]+[A-Z][A-Za-z]+)\b/g)) {
    const t = m[1]!;
    if (NOT_TOOLS.has(t.replace(/s$/, "")) || found.has(t.toLowerCase())) continue;
    found.set(t.toLowerCase(), t);
  }
  return [...found.values()].slice(0, 20);
}

function keywords(core: string, focus: string[], tools: string[]): string[] {
  const scored = new Map<string, number>();
  const bump = (k: string, n: number) => scored.set(k, (scored.get(k) ?? 0) + n);
  for (const line of focus) {
    const words = tokens(line).filter((w) => !GENERIC.has(w) && !/^\d/.test(w));
    words.forEach((w) => bump(w, 1));
  }
  // Two-word phrases only when the same phrase repeats; one-off pairs are usually noise ("through planned").
  const pairs = new Map<string, number>();
  for (const line of focus) {
    const raw = tokens(line);
    for (let i = 0; i + 1 < raw.length; i++) {
      const [a, b] = [raw[i]!, raw[i + 1]!];
      if (GENERIC.has(a) || GENERIC.has(b) || /^\d/.test(a) || /^\d/.test(b)) continue;
      pairs.set(`${a} ${b}`, (pairs.get(`${a} ${b}`) ?? 0) + 1);
    }
  }
  for (const [pair, n] of pairs) if (n >= 2) bump(pair, n * 1.5);
  const lowerCore = core.toLowerCase();
  const ranked = [...scored.entries()]
    .filter(([k]) => lowerCore.includes(k)) // a keyword must occur in the text as written
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .map(([k]) => k);
  const out: string[] = [];
  for (const t of tools.slice(0, 5)) out.push(t);
  for (const k of ranked) {
    if (out.length >= 12) break;
    if (out.some((o) => o.toLowerCase().includes(k) || k.includes(o.toLowerCase()))) continue;
    out.push(k);
  }
  return out;
}

export function analyzeBasic(jd: string, hints: { title?: string; company?: string } = {}): JdAnalysis {
  const { core, removed } = splitBoilerplate(jd);
  const lines = core.split("\n").map((l) => l.trim()).filter(Boolean);
  const buckets: Record<"must_have" | "nice_to_have" | "responsibilities", string[]> = { must_have: [], nice_to_have: [], responsibilities: [] };
  let current: keyof typeof buckets | "other" | null = null;
  let company = hints.company ?? "";

  for (const line of lines) {
    if (isHeadingLine(line) || /:$/.test(line)) {
      const h = line.replace(/:$/, "").trim();
      const hit = HEADINGS.find(([, re]) => re.test(h));
      if (hit) {
        current = hit[0];
        continue;
      }
      if (OTHER_HEADING.test(h)) {
        current = "other";
        continue;
      }
      const about = h.match(/^About ([A-Z][\w&.' -]{1,40})$/);
      if (about && !company && !/^(you|us|the role|this role)$/i.test(about[1]!)) {
        company = about[1]!.trim();
        current = "other";
        continue;
      }
    }
    if (current && current !== "other") {
      const item = clean(line);
      if (item.length >= 3 && buckets[current].length < 30) buckets[current].push(item);
      continue;
    }
    // No section yet: classify obvious requirement lines.
    if (BULLET.test(line)) {
      const item = clean(line);
      if (/\b(preferred|desirable|a plus|nice to have|bonus)\b/i.test(item)) buckets.nice_to_have.push(item);
      else if (/\b(\d+\+? years|experience (in|with|of)|knowledge of|proficien|degree|certif|qualified|must|required|fluent)\b/i.test(item)) buckets.must_have.push(item);
      else buckets.responsibilities.push(item);
    }
  }

  const first = lines[0] ?? "";
  const title = hints.title || (first.split(/\s+/).length <= 8 && !/[.!?]$/.test(first) ? first.replace(/^(job title|role|position)\s*[:\-]\s*/i, "") : "");
  const seniority: JdAnalysis["seniority"] = /\b(director|vice president|vp|chief|head of)\b/i.test(title)
    ? "executive"
    : /\b(senior|sr\.?)\b/i.test(title)
      ? "senior"
      : /\b(junior|jr\.?|graduate|entry|intern|trainee|assistant)\b/i.test(title)
        ? "entry"
        : /\b(lead|principal|manager)\b/i.test(title)
          ? "lead"
          : title
            ? "mid"
            : "unspecified";
  const work_mode: JdAnalysis["work_mode"] = /\bhybrid\b/i.test(core) ? "hybrid" : /\b(fully remote|remote[- ]first|100% remote|work from home|remote)\b/i.test(core) ? "remote" : /\b(on[- ]?site|in[- ]office|office[- ]based)\b/i.test(core) ? "onsite" : "unspecified";
  const location = core.match(/\b(?:location|based in|located in)\s*[:\-]?\s*([^\n.;]{2,60})/i)?.[1]?.trim() ?? "";
  const tools = extractTools([...buckets.must_have, ...buckets.nice_to_have, ...buckets.responsibilities].join("\n") || core);
  const language_hints = LANGUAGES.filter((l) => new RegExp(`\\b${l}\\b`).test(core) && /\b(fluent|speak|speaking|language|bilingual|native|written|spoken)\b/i.test(core));

  return {
    title,
    company,
    seniority,
    location,
    work_mode,
    must_have: buckets.must_have,
    nice_to_have: buckets.nice_to_have,
    tools,
    responsibilities: buckets.responsibilities,
    spelling_hint: detectSpelling(core, null),
    language_hints,
    keywords: keywords(core, [...buckets.must_have, ...buckets.responsibilities, ...buckets.nice_to_have, title], tools),
    removed,
    method: "basic",
    edited: false,
  };
}

/** Requirements the match step checks, with stable keys for gap decisions. */
export function requirementsOf(a: JdAnalysis): Requirement[] {
  const out: Requirement[] = [];
  const seen = new Set<string>();
  const add = (kind: Requirement["kind"], text: string) => {
    const norm = text.toLowerCase().replace(/\s+/g, " ").trim();
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    out.push({ key: `${kind}:${norm}`.slice(0, 200), text, kind });
  };
  a.must_have.forEach((t) => add("must", t));
  a.tools.forEach((t) => {
    // Skip a tool already named inside a requirement line: that line covers it.
    if (![...a.must_have, ...a.nice_to_have].some((m) => m.toLowerCase().includes(t.toLowerCase()))) add("tool", t);
  });
  a.nice_to_have.forEach((t) => add("nice", t));
  a.responsibilities.forEach((t) => add("responsibility", t));
  return out;
}
