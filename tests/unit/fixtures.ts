import { newCv } from "@/lib/cv/create";
import { emptyProfile, makeFact, type Cv, type Fact } from "@/lib/model";

export function sampleFacts(): Fact[] {
  const contact = makeFact("contact", {
    full_name: "Amira Haddad",
    headline: "Facilities manager",
    email: "amira@example.com",
    phone: "+971 50 000 0000",
    city: "Dubai",
    country: "AE",
    links: [],
    date_of_birth: "1990-04-12",
    nationality: "Jordanian",
    visa_status: "UAE residence visa",
  });
  const work = makeFact("work", { employer: "Harbour Estates", title: "Facilities Manager", location: "Dubai", start: "2021-03", current: true });
  const older = makeFact("work", { employer: "City Towers", title: "Assistant FM", start: "2017-01", end: "2021-02", current: false });
  return [
    contact,
    work,
    older,
    makeFact("achievement", { work_id: work.id, kind: "achievement", text: "Cut reactive maintenance calls by 18% in 12 months" }),
    makeFact("achievement", { work_id: work.id, kind: "responsibility", text: "Run a team of 14 technicians across 3 towers" }),
    makeFact("achievement", { work_id: older.id, kind: "responsibility", text: "Managed contractor schedules" }),
    makeFact("education", { institution: "University of Jordan", qualification: "BSc", field: "Mechanical Engineering", end: "2012-06" }),
    makeFact("skill", { name: "CAFM" }),
    makeFact("skill", { name: "Budgeting" }),
    makeFact("language", { name: "Arabic", level: "Native" }),
    makeFact("skill", { name: "Unconfirmed skill" }, { confirmed: false, source: "import" }),
  ];
}

export function cvFor(country: string): Cv {
  return newCv("Test CV", { ...emptyProfile, home_country: country, target_country: country });
}

/** A realistic job description with sections, tools, benefits and equal-opportunity text. */
export const JD = `Senior Facilities Manager
About Marina Living
We manage residential towers across Dubai Marina.

Location: Dubai, UAE (hybrid)

Key responsibilities
- Lead a team of technicians across residential towers
- Reduce reactive maintenance through planned preventive maintenance
- Manage contractor schedules and service agreements

Requirements
- 5+ years of facilities management experience
- Hands-on experience with CAFM systems
- Strong budgeting skills
- Fluent English; Arabic is a plus

Nice to have
- IOSH or NEBOSH certification
- Experience with Yardi

Benefits
- Annual flights home
- Health insurance

Marina Living is an equal opportunity employer and does not discriminate regardless of race, religion or gender.`;
