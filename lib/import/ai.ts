import "server-only";
import { z } from "zod";
import { generateStructured } from "@/lib/llm";
import { loadPrompt } from "@/lib/prompts";
import { makeFact, type Fact } from "@/lib/model";
import type { ParsedDraft } from "./types";

// Flat, string-based schema: easy for structured output, normalised afterwards.
const aiImportSchema = z.object({
  contact: z.object({
    full_name: z.string(),
    headline: z.string(),
    email: z.string(),
    phone: z.string(),
    city: z.string(),
    country: z.string(),
    links: z.array(z.string()),
    date_of_birth: z.string(),
    nationality: z.string(),
    marital_status: z.string(),
    visa_status: z.string(),
  }),
  summary: z.string(),
  work: z.array(
    z.object({
      employer: z.string(),
      title: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      current: z.boolean(),
      responsibilities: z.array(z.string()),
      achievements: z.array(z.string()),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      qualification: z.string(),
      field: z.string(),
      location: z.string(),
      start: z.string(),
      end: z.string(),
      grade: z.string(),
    }),
  ),
  skills: z.array(z.string()),
  languages: z.array(z.object({ name: z.string(), level: z.string() })),
  certifications: z.array(z.object({ name: z.string(), issuer: z.string(), date: z.string() })),
});

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
const s = (v: string) => (v.trim() === "" ? undefined : v.trim());
const month = (v: string) => (MONTH.test(v.trim()) ? v.trim() : undefined);

export async function parseWithAi(text: string): Promise<ParsedDraft> {
  const prompt = loadPrompt("cv-import");
  const out = await generateStructured({
    system: prompt.body,
    user: `<cv>\n${text}\n</cv>`,
    schema: aiImportSchema,
    task: "extract",
  });

  const opts = { confirmed: false, source: "import" as const };
  const facts: Fact[] = [];
  const c = out.contact;
  if (c.full_name || c.email || c.phone) {
    facts.push(
      makeFact(
        "contact",
        {
          full_name: c.full_name.trim(),
          headline: s(c.headline),
          email: s(c.email),
          phone: s(c.phone),
          city: s(c.city),
          country: /^[A-Z]{2}$/.test(c.country.trim()) ? c.country.trim() : undefined,
          links: c.links.map((l) => l.trim()).filter(Boolean).slice(0, 6),
          date_of_birth: /^\d{4}-\d{2}-\d{2}$/.test(c.date_of_birth) ? c.date_of_birth : undefined,
          nationality: s(c.nationality),
          marital_status: s(c.marital_status),
          visa_status: s(c.visa_status),
        },
        opts,
      ),
    );
  }
  for (const w of out.work) {
    const work = makeFact(
      "work",
      { employer: w.employer.trim(), title: w.title.trim(), location: s(w.location), start: month(w.start), end: month(w.end), current: w.current },
      opts,
    );
    facts.push(work);
    for (const r of w.responsibilities.filter((x) => x.trim())) {
      facts.push(makeFact("achievement", { work_id: work.id, kind: "responsibility", text: r.trim() }, opts));
    }
    for (const a of w.achievements.filter((x) => x.trim())) {
      facts.push(makeFact("achievement", { work_id: work.id, kind: "achievement", text: a.trim() }, opts));
    }
  }
  for (const e of out.education) {
    facts.push(
      makeFact(
        "education",
        {
          institution: e.institution.trim(),
          qualification: e.qualification.trim(),
          field: s(e.field),
          location: s(e.location),
          start: month(e.start),
          end: month(e.end),
          grade: s(e.grade),
        },
        opts,
      ),
    );
  }
  for (const k of out.skills.map((x) => x.trim()).filter(Boolean)) facts.push(makeFact("skill", { name: k.slice(0, 80) }, opts));
  for (const l of out.languages.filter((x) => x.name.trim())) {
    facts.push(makeFact("language", { name: l.name.trim(), level: s(l.level) }, opts));
  }
  for (const ce of out.certifications.filter((x) => x.name.trim())) {
    facts.push(makeFact("cert", { name: ce.name.trim(), issuer: s(ce.issuer), date: month(ce.date) }, opts));
  }
  return { facts, summary: s(out.summary) ?? null, notes: [] };
}
