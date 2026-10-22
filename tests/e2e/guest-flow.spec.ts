import { expect, test, type Page } from "@playwright/test";

const JOB_AD = `Senior Facilities Manager
About Marina Living
We manage residential towers across Dubai Marina.

Key responsibilities
- Lead a team of technicians across residential towers
- Reduce reactive maintenance through planned preventive maintenance

Requirements
- 5+ years of facilities management experience
- Hands-on experience with CAFM systems
- Strong budgeting skills

Nice to have
- IOSH or NEBOSH certification
- Experience with Yardi

Benefits
- Annual flights home

Marina Living is an equal opportunity employer, regardless of race, religion or gender.`;

const SAMPLE_CV = `Amira Haddad
amira@example.com | +971 50 000 0000

Experience
Facilities Manager, Harbour Estates, Dubai    Mar 2021 – Present
• Cut reactive maintenance calls by 18% in 12 months
• Run a team of 14 technicians across 3 towers

Skills
CAFM, Budgeting

Hobbies
Desert hiking and photography`;

async function startAsGuest(page: Page) {
  await page.goto("/welcome");
  await page.getByRole("button", { name: /continue without an account/i }).click();
  // Consent is required and never pre-ticked.
  await expect(page.getByText(/please tick the box/i)).toBeVisible();
  await page.getByRole("checkbox", { name: /i agree that/i }).check();
  await page.getByRole("button", { name: /continue without an account/i }).click();
  await expect(page).toHaveURL(/\/onboarding/);
}

async function onboard(page: Page, start: "Import my existing CV" | "Start from blank") {
  // Step 1: detected country (from x-vercel-ip-country) is prefilled.
  await expect(page.getByText(/we guessed united arab emirates/i)).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  // Step 2: target defaults to home; the Gulf pack is summarised.
  await expect(page.getByText("CV style: Gulf (GCC)")).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  // Step 3: optional writing sample.
  await page.getByRole("button", { name: "Skip" }).click();
  await page.getByRole("button", { name: start }).click();
}

test("guest: import a CV, confirm facts, build and export", async ({ page }) => {
  await startAsGuest(page);
  await onboard(page, "Import my existing CV");

  await expect(page).toHaveURL(/\/cvs\/import/);
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.getByLabel("Paste your CV text").fill(SAMPLE_CV);
  await page.getByRole("switch", { name: /use ai/i }).click();
  await page.getByRole("button", { name: "Read my CV" }).click();

  await expect(page.getByRole("heading", { name: "Check what we found" })).toBeVisible();
  // The unplaceable line is surfaced, not dropped.
  await expect(page.getByText("Desert hiking and photography")).toBeVisible();
  for (const name of ["Contact details", "Work experience", "Skills"]) {
    await page.getByRole("region", { name }).getByRole("button", { name: "Confirm all here" }).click();
  }
  await page.getByRole("button", { name: "Confirm these lines" }).click();
  await page.getByRole("button", { name: "Not needed" }).click();
  await page.getByRole("button", { name: "Save and build CV" }).click();

  await expect(page).toHaveURL(/\/cvs\/edit\?id=/);
  const preview = page.getByRole("article", { name: "CV preview" });
  await expect(preview.getByText("Amira Haddad")).toBeVisible();
  await expect(preview.getByText("Cut reactive maintenance calls by 18% in 12 months")).toBeVisible();

  // Inline edit applies to this CV only.
  await preview.getByRole("button", { name: /Edit: Run a team of 14/ }).click();
  await page.getByLabel("This line").fill("Lead 14 technicians across 3 towers");
  await page.getByRole("button", { name: "Use on this CV" }).click();
  await expect(preview.getByText("Lead 14 technicians across 3 towers")).toBeVisible();

  await page.getByRole("tab", { name: "Check" }).click();
  await expect(page.getByText(/within the usual 3/)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Text in the PDF can be selected and read by software.")).toBeVisible();

  // Downloads are paid: guests see the price and go to checkout, which needs an account.
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(0);
  await page.getByRole("link", { name: "Get PDF + Word · ₹199" }).click();
  await expect(page).toHaveURL(/\/quick\/pay\?cv=/);
  await expect(page.getByRole("heading", { name: "Sign in to keep your CV" })).toBeVisible();
  await expect(page.getByText("Includes ₹30.36 GST (18%).", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay ₹199 securely" })).toBeDisabled();

  // The paid file endpoint refuses anyone not signed in.
  const res = await page.request.post("/api/export/pdf", { data: { mode: "file", cv_id: "6f1c2b8e-4a1d-4c55-9a0e-2f3b4c5d6e7f" } });
  expect(res.status()).toBe(401);

  // Data persists in the browser.
  await page.goto("/cvs");
  await expect(page.getByText("Imported CV")).toBeVisible();

  // Our own PDF and Word output can be imported again (read on the device).
  // Each format is read twice to catch parsers that only work once per page.
  const { readFileSync } = await import("node:fs");
  const files = [
    { name: "cv.pdf", mimeType: "application/pdf", buffer: readFileSync("tests/e2e/fixtures/cv.pdf") },
    { name: "cv.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: readFileSync("tests/e2e/fixtures/cv.docx") },
  ];
  for (const file of [files[0]!, files[0]!, files[1]!, files[1]!]) {
    await page.goto("/cvs/import");
    await page.getByLabel("Your CV file").setInputFiles(file);
    await page.getByRole("switch", { name: /use ai/i }).click();
    await page.getByRole("button", { name: "Read my CV" }).click();
    await expect(page.getByRole("heading", { name: "Check what we found" })).toBeVisible();
    await expect(page.getByText("Amira Haddad").first()).toBeVisible();
  }
});

test("guest: add facts by hand, then delete all data", async ({ page }) => {
  await startAsGuest(page);
  await onboard(page, "Start from blank");
  await expect(page).toHaveURL(/\/cvs\/facts/);

  await page.getByRole("button", { name: "Add your name and contact details" }).click();
  await page.getByLabel("Full name").fill("Sam Lee");
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("sam@example.com");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Sam Lee")).toBeVisible();

  await page.getByRole("button", { name: "+ Add role" }).click();
  await page.getByLabel("Job title").fill("Analyst");
  await page.getByLabel("Employer").fill("Acme");
  await page.getByRole("button", { name: "Save" }).click();
  await page.getByRole("button", { name: "+ Add what you did" }).click();
  await page.getByRole("textbox", { name: "What you did" }).fill("Built the monthly sales report");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Built the monthly sales report")).toBeVisible();

  await page.getByRole("link", { name: "Me", exact: true }).click();
  await page.getByLabel(/Type "delete my account" to confirm/).fill("delete my account");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page).toHaveURL(/\/\?deleted=1$/);
  await expect(page.getByText("Your data has been deleted.")).toBeVisible();
  await page.goto("/home");
  await expect(page).toHaveURL(/\/welcome/);
});

test("guest: full apply flow (basic mode): analyse, match, tailor, email, track", async ({ page }) => {
  await startAsGuest(page);
  await onboard(page, "Import my existing CV");
  await page.getByRole("tab", { name: "Paste text" }).click();
  await page.getByLabel("Paste your CV text").fill(SAMPLE_CV);
  await page.getByRole("switch", { name: /use ai/i }).click();
  await page.getByRole("button", { name: "Read my CV" }).click();
  for (const name of ["Contact details", "Work experience", "Skills"]) {
    await page.getByRole("region", { name }).getByRole("button", { name: "Confirm all here" }).click();
  }
  await page.getByRole("button", { name: "Confirm these lines" }).click();
  await page.getByRole("button", { name: "Save and build CV" }).click();
  await expect(page).toHaveURL(/\/cvs\/edit/);

  // Home's primary action starts an application.
  await page.getByRole("link", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Start an application" }).click();
  await expect(page).toHaveURL(/\/apply\/compose\?id=/);

  // Step 1: the job. AI off for the whole application (no key in tests).
  await page.getByLabel("Job title").fill("Facilities Manager");
  await page.getByLabel("Company").fill("Marina Living");
  await page.getByLabel("Job description").fill(JOB_AD);
  const aiAll = page.getByRole("switch", { name: /use ai for this application/i });
  await aiAll.click();
  await expect(aiAll).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Analyse the job" }).click();

  // Step 2: analysis, editable, with boilerplate set aside (not deleted).
  await expect(page.getByText("It follows headings and bullet points", { exact: false })).toBeVisible();
  await expect(page.getByText("Hands-on experience with CAFM systems")).toBeVisible();
  await expect(page.getByText(/Set aside: 2 blocks of boilerplate/)).toBeVisible();
  await page.getByRole("button", { name: "Check my facts against it" }).click();

  // Step 3: match, with cited facts, and gap questions.
  await expect(page.getByText(/\d+ strong · \d+ partial · \d+ gaps?/)).toBeVisible();
  const iosh = page.getByRole("listitem").filter({ hasText: "IOSH or NEBOSH certification" });
  await iosh.getByRole("button", { name: "I haven't done this" }).click();
  await expect(iosh.getByText("You said you haven't done this", { exact: false })).toBeVisible();
  const yardi = page.getByRole("listitem").filter({ hasText: "Experience with Yardi" });
  await yardi.getByRole("button", { name: "Yes, I have" }).click();
  await yardi.getByLabel(/Where and how/).fill("Used Yardi to track service charge collections");
  await yardi.getByLabel("Which role was this in?").selectOption({ index: 1 });
  await yardi.getByRole("button", { name: "Save as a fact" }).click();
  await expect(page.getByRole("listitem").filter({ hasText: "Experience with Yardi" }).getByText("From your facts:", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Suggest changes to my CV" }).click();

  // Step 4: tailor. Accept clean suggestions and create a tailored copy, or carry on if none are needed.
  await page.getByRole("button", { name: "Suggest changes", exact: true }).click();
  await expect(page.getByText("Basic suggestions", { exact: false })).toBeVisible();
  const acceptClean = page.getByRole("button", { name: /Accept the \d+ changes? with no flags/ });
  if (await acceptClean.isVisible()) {
    await acceptClean.click();
    await page.getByRole("button", { name: /Create tailored CV/ }).click();
    await expect(page.getByText("Tailored CV created")).toBeVisible();
    console.log("[e2e] tailored CV created");
    await page.getByRole("button", { name: "Next: email details" }).click();
  } else {
    await expect(page.getByText("No changes needed", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Skip, use my CV as it is" }).click();
  }

  // Step 5: details. Referral needs a referrer before it can be written.
  await page.getByRole("radio", { name: /Referral/ }).check();
  await expect(page.getByRole("button", { name: "Write my email" })).toBeDisabled();
  await page.getByRole("radio", { name: /Apply directly/ }).check();
  await page.getByLabel(/Recipient's name/).fill("Sara Khan");
  await page.getByLabel(/Recipient's email/).fill("sara@example.com");
  await page.getByLabel("Tone").selectOption("warm");
  await expect(page.getByRole("switch", { name: /use ai to word it/i })).toHaveAttribute("aria-checked", "false");
  await page.getByRole("button", { name: "Write my email" }).click();

  // Step 3: the email, built only from confirmed facts.
  await expect(page.getByText("Built from a plain template with your facts quoted word for word.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Edit Greeting/ })).toHaveText("Hi Sara,");
  await expect(page.getByRole("button", { name: /Edit Your experience/ })).toContainText("Cut reactive maintenance calls by 18% in 12 months");
  await expect(page.getByRole("button", { name: /Edit Sign-off/ })).toContainText("Amira Haddad");
  await expect(page.getByText("Reads naturally. Nothing flagged.")).toBeVisible();

  // An edit that adds a buzzword and an invented number gets flagged, not hidden.
  await page.getByRole("button", { name: /Edit Opening/ }).click();
  await page.getByLabel("Opening").fill("I'd like to apply for the Facilities Manager role. I spearheaded 40 projects.");
  await page.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText(/2 things to check \(2 to fix\)/)).toBeVisible();
  await expect(page.locator("mark", { hasText: "spearheaded" })).toBeVisible();
  await expect(page.locator("mark", { hasText: "40" })).toBeVisible();

  // Send path: mailto with encoded subject and body, .eml download, CV PDF beside it.
  const mailto = await page.getByRole("link", { name: "Open in my email app" }).getAttribute("href");
  expect(mailto).toMatch(/^mailto:sara@example\.com\?subject=Application%3A%20Facilities%20Manager%20at%20Marina%20Living&body=Hi%20Sara%2C%0D%0A/);
  const eml = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download as .eml" }).click();
  expect((await eml).suggestedFilename()).toMatch(/\.eml$/);
  // The CV beside the email is a paid download.
  await expect(page.getByRole("link", { name: "Get this CV as PDF · ₹199" })).toHaveAttribute("href", /\/quick\/pay\?cv=/);

  await page.getByRole("button", { name: "I've sent it" }).click();
  await expect(page).toHaveURL(/\/apply$/);
  const entry = page.getByRole("link", { name: /Facilities Manager.*Marina Living · Applied.*Email ready/ });
  await expect(entry).toBeVisible();

  // Reopening restores the saved email, edits included.
  await entry.click();
  await expect(page.locator("mark", { hasText: "spearheaded" })).toBeVisible();
  await expect(page.getByText(/2 things to check \(2 to fix\)/)).toBeVisible();

  // Tracker: the sent application sits in Applied.
  await page.getByRole("link", { name: "Tracker", exact: true }).click();
  const card = page.getByRole("button", { name: /Facilities Manager.*Marina Living.*Applied/ });
  await expect(card).toBeVisible();

  // Backdate the application by 10 days: the day-7 follow-up falls due.
  await card.click();
  const sheet = page.getByRole("dialog");
  const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
  await sheet.getByLabel("Applied on").fill(tenDaysAgo);
  await sheet.getByLabel("Notes").fill("Spoke to Sara at the careers fair.");
  await expect(sheet.getByRole("button", { name: "Add reminders to my calendar (.ics)" })).toBeVisible();
  const ics = page.waitForEvent("download");
  await sheet.getByRole("button", { name: "Add reminders to my calendar (.ics)" }).click();
  expect((await ics).suggestedFilename()).toMatch(/\.ics$/);
  await page.keyboard.press("Escape");

  await expect(page.getByRole("heading", { name: "Follow-up due" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Tracker 1 follow-up due/ })).toBeVisible();
  await page.getByRole("button", { name: "I've followed up" }).click();
  await expect(page.getByRole("heading", { name: "Follow-up due" })).toBeHidden();

  // Moving it on: a thumb-sized stage button in the sheet.
  await page.getByRole("button", { name: /Facilities Manager.*Marina Living/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Interview", exact: true }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: /Interview \(1\)/ }).click();
  await expect(page.getByRole("button", { name: /Facilities Manager.*Marina Living/ })).toBeVisible();

  // Posting check: questions to ask, never a verdict.
  await page.getByLabel("Job posting", { exact: true }).fill("URGENT HIRING. Work from home and earn $500 per day. Pay a small registration fee to start. Contact us on WhatsApp: jobs.fast@gmail.com");
  await expect(page.getByRole("heading", { name: /things worth double-checking/ })).toBeVisible();
  for (const title of ["Asks you to pay", "Recruiter uses a personal email", "Contact only by chat app", "Pay sounds unusually high or easy", "Pushes you to hurry"]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
});

test("quick flow: CV + job ad → tailored CV → review → checkout", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "A CV made for this job, in 60 seconds." })).toBeVisible();
  await expect(page.getByText("Preview free · ₹199 to download (incl. GST)", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "No CV? Paste your experience" }).click();
  await page.getByLabel("Your experience").fill(SAMPLE_CV);
  await page.getByLabel("Job ad").fill(JOB_AD);

  // Consent is asked once, never pre-ticked.
  await page.getByRole("button", { name: "Build my CV →" }).click();
  await expect(page.getByText(/please tick the box/i)).toBeVisible();
  await page.getByRole("checkbox", { name: /i agree that/i }).check();
  await page.getByRole("button", { name: "Build my CV →" }).click();

  // No AI key in tests: the basic method stands in, end to end.
  await expect(page).toHaveURL(/\/quick\/review\?app=/, { timeout: 30_000 });
  await expect(page.getByText("job keywords shown by your real experience")).toBeVisible();
  const preview = page.getByRole("article", { name: "CV preview" });
  await expect(preview.getByText("Amira Haddad")).toBeVisible();
  await expect(preview.getByText("Cut reactive maintenance calls by 18% in 12 months")).toBeVisible();

  // A gap is asked about, never assumed.
  const question = page.getByText(/The job asks for .+\. Have you used it\?/);
  if (await question.isVisible()) {
    await page.getByRole("button", { name: "No, I haven't" }).click();
  }

  // Inline edit, then a template switch.
  await preview.getByRole("button", { name: /Edit: Run a team of 14/ }).click();
  await page.getByRole("dialog").getByRole("textbox").fill("Lead 14 technicians across 3 towers");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(preview.getByText("Lead 14 technicians across 3 towers")).toBeVisible();
  await page.getByRole("radio", { name: "Classic" }).click();
  await expect(page.getByRole("radio", { name: "Classic" })).toHaveAttribute("aria-checked", "true");

  await page.getByRole("button", { name: "Looks right · Get it for ₹199 →" }).click();
  await expect(page).toHaveURL(/\/quick\/pay\?cv=/);
  await expect(page.getByRole("heading", { name: "Almost there." })).toBeVisible();
  await expect(page.getByText("Tailored CV · PDF + Word")).toBeVisible();
  await expect(page.getByRole("button", { name: "Pay ₹199 securely" })).toBeDisabled();

  // Reviewing confirmed the imported facts: they're in the guest's vault now.
  await page.goto("/cvs/facts");
  await expect(page.getByText("Cut reactive maintenance calls by 18% in 12 months")).toBeVisible();
});
