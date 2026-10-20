import { makeFact, type Fact, type FactData } from "@/lib/model";
import type { ParsedDraft } from "./types";
import { BULLET_PREFIX, DATE_RANGE, SINGLE_DATE, normaliseLines, parseDateToken } from "./text";

/**
 * Basic, no-AI parser. It aims to be conservative: anything it can't place
 * stays out of the facts and is surfaced by the coverage check.
 */

type Section = "top" | "summary" | "experience" | "education" | "skills" | "languages" | "certifications" | "personal" | "other";

const HEADINGS: [Section, RegExp][] = [
  ["summary", /^(professional |career |personal )?(summary|profile|objective|about( me)?)$/i],
  ["experience", /^((work|professional|employment|relevant) )?(experience|history|employment( history)?|career history)$/i],
  ["education", /^(education|academic (background|qualifications)|qualifications|education (and|&) training)$/i],
  ["skills", /^((key|core|technical|professional) )?(skills|competencies|expertise|skills (and|&) abilities)$/i],
  ["languages", /^languages?( skills)?$/i],
  ["certifications", /^(certifications?|certificates|licen[cs]es( (and|&) certifications)?|courses|training)$/i],
  ["personal", /^personal( (details|information|data))?$/i],
  ["other", /^(references|referees|interests|hobbies|projects|awards|achievements|volunteering|publications)$/i],
];

export function isHeading(line: string): boolean {
  return sectionFor(line) !== null;
}

function sectionFor(line: string): Section | null {
  const clean = line.replace(/[:\s]+$/, "").trim();
  if (clean.split(/\s+/).length > 5) return null;
  for (const [section, re] of HEADINGS) if (re.test(clean)) return section;
  return null;
}

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL = /\b((?:https?:\/\/|www\.)\S+|(?:linkedin\.com|github\.com)\/\S+)/i;
const DEGREE = /\b(bachelor|master|b\.?sc|m\.?sc|b\.?a|m\.?a|mba|phd|doctorate|diploma|degree|b\.?tech|m\.?tech|b\.?com|m\.?com|b\.?e|hsc|ssc|a-?levels?|gcse|high school|associate)\b/i;

function splitParts(text: string): string[] {
  return text
    .split(/\s+(?:at|@)\s+|\s*[|,–—]\s*|\s+-\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function readRange(line: string, notes: string[]) {
  const m = line.match(DATE_RANGE);
  if (!m) return null;
  const rest = line.replace(m[0], " ").replace(/[()\s|,–—-]+$/g, "").replace(/^[()\s|,–—-]+/g, "").trim();
  const start = parseDateToken(m[1]!);
  const endRaw = m[2]!;
  const current = /^(present|current|now|today|date)$/i.test(endRaw);
  const end = current ? null : parseDateToken(endRaw);
  if ((start && "year" in start) || (end && "year" in end)) {
    notes.push(`Dates in "${line}" only show a year. Add the months if you know them.`);
  }
  return {
    rest,
    start: start && "month" in start ? start.month : undefined,
    end: end && "month" in end ? end.month : undefined,
    current,
  };
}

export function parseHeuristic(text: string): ParsedDraft {
  const lines = normaliseLines(text);
  const facts: Fact[] = [];
  const notes: string[] = [];
  const summaryLines: string[] = [];
  const opts = { confirmed: false, source: "import" as const };

  const contact: FactData<"contact"> = { full_name: "", links: [] };
  let section: Section = "top";
  let currentWork: string | null = null;
  let pending: string[] = [];

  const flushEducationPending = () => {
    for (const p of pending) {
      if (DEGREE.test(p)) facts.push(makeFact("education", { institution: "", qualification: p }, opts));
    }
    pending = [];
  };

  for (const raw of lines) {
    const heading = sectionFor(raw);
    if (heading) {
      if (section === "education") flushEducationPending();
      section = heading;
      pending = [];
      currentWork = null;
      continue;
    }
    const isBullet = BULLET_PREFIX.test(raw);
    const line = raw.replace(BULLET_PREFIX, "");

    // Contact details can appear anywhere near the top.
    if (section === "top" || section === "personal") {
      const email = line.match(EMAIL)?.[0];
      const url = line.match(URL)?.[0];
      const phone = line.replace(EMAIL, "").replace(URL, "").match(PHONE)?.[0];
      if (email && !contact.email) contact.email = email;
      if (phone && !contact.phone) contact.phone = phone.trim();
      if (url && contact.links.length < 6) contact.links.push(url);
      const kv = line.match(/^(date of birth|dob|birth date|nationality|marital status|visa( status)?)\s*[:\-]\s*(.+)$/i);
      if (kv) {
        const key = kv[1]!.toLowerCase();
        const val = kv[3]!.trim();
        if (key.startsWith("nationality")) contact.nationality = val;
        else if (key.startsWith("marital")) contact.marital_status = val;
        else if (key.startsWith("visa")) contact.visa_status = val;
        else {
          const d = val.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
          if (d) notes.push(`Check your date of birth (${val}); day and month order varies by country.`);
        }
        continue;
      }
      if (section === "top" && !email && !phone && !url) {
        const words = line.split(/\s+/);
        if (!contact.full_name && words.length >= 2 && words.length <= 5 && !/\d/.test(line)) contact.full_name = line;
        else if (contact.full_name && !contact.headline && line.length <= 120) contact.headline = line;
      }
      continue;
    }

    switch (section) {
      case "summary":
        summaryLines.push(line);
        break;
      case "experience": {
        const range = readRange(line, notes);
        if (range) {
          const parts = splitParts(range.rest);
          let title = "";
          let employer = "";
          let location: string | undefined;
          if (parts.length >= 2) [title, employer, location] = [parts[0]!, parts[1]!, parts[2]];
          else if (parts.length === 1 && pending.length) [title, employer] = [pending.pop()!, parts[0]!];
          else if (parts.length === 1) title = parts[0]!;
          else if (pending.length >= 2) [employer, title] = [pending.shift()!, pending.pop()!];
          else if (pending.length) title = pending.pop()!;
          const work = makeFact("work", { employer, title, location, start: range.start, end: range.end, current: range.current }, opts);
          facts.push(work);
          currentWork = work.id;
          pending = [];
        } else if (currentWork && (isBullet || line.length > 60 || /[.;]$/.test(line))) {
          facts.push(makeFact("achievement", { work_id: currentWork, kind: "responsibility", text: line }, opts));
        } else {
          pending.push(line);
        }
        break;
      }
      case "education": {
        const range = readRange(line, notes);
        const single = !range ? line.match(SINGLE_DATE) : null;
        if (range || single) {
          const restText = range ? range.rest : line.replace(single![0], "").replace(/[\s|,–—-]+$/g, "").trim();
          const parts = splitParts(restText);
          let qualification = "";
          let institution = "";
          if (parts.length >= 2) [qualification, institution] = [parts[0]!, parts[1]!];
          else if (parts.length === 1 && pending.length) [qualification, institution] = [pending.pop()!, parts[0]!];
          else if (parts.length === 1) qualification = parts[0]!;
          else if (pending.length) qualification = pending.pop()!;
          if (DEGREE.test(institution) && !DEGREE.test(qualification)) [qualification, institution] = [institution, qualification];
          let end = range?.end;
          if (single) {
            const d = parseDateToken(single[1]!);
            if (d && "month" in d) end = d.month;
            else if (d) notes.push(`Dates in "${line}" only show a year. Add the months if you know them.`);
          }
          facts.push(makeFact("education", { institution, qualification, start: range?.start, end }, opts));
          pending = [];
        } else pending.push(line);
        break;
      }
      case "skills":
        for (const item of line.split(/[,;•|]/).map((s) => s.trim()).filter(Boolean)) {
          if (item.split(/\s+/).length <= 5 && item.length <= 80) facts.push(makeFact("skill", { name: item.replace(/^[^:]+:\s*/, "") || item }, opts));
        }
        break;
      case "languages":
        for (const item of line.split(/[,;•|]/).map((s) => s.trim()).filter(Boolean)) {
          const m = item.match(/^([\p{L} ]+?)\s*(?:[(\-–:]\s*([^)]+)\)?)?$/u);
          if (m) facts.push(makeFact("language", { name: m[1]!.trim(), level: m[2]?.trim() }, opts));
        }
        break;
      case "certifications": {
        const single = line.match(SINGLE_DATE);
        const d = single ? parseDateToken(single[1]!) : null;
        const name = single ? line.replace(single[0], "").replace(/[\s|,–—()-]+$/g, "").trim() : line;
        const [certName, issuer] = splitParts(name);
        if (certName) facts.push(makeFact("cert", { name: certName, issuer, date: d && "month" in d ? d.month : undefined }, opts));
        break;
      }
      default:
        // "other" sections are left for the coverage check to surface.
        break;
    }
  }
  if (section === "education") flushEducationPending();

  if (contact.full_name || contact.email || contact.phone || contact.links.length) {
    facts.unshift(makeFact("contact", contact, opts));
  }
  return { facts, summary: summaryLines.length ? summaryLines.join(" ") : null, notes };
}
