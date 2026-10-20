import type { EmailVariant } from "@/lib/model";
import { ensureSentence, type EmailDraft, type Paragraph } from "./assemble";
import { frame, type ComposeContext } from "./compose";

/**
 * Deterministic composer: fixed sentences, and the user's own fact lines
 * quoted word for word. Works without AI, offline-friendly and fully testable.
 */

const c = (ctx: ComposeContext, contracted: string, full: string) => (ctx.contractions ? contracted : full);

function roleAt(ctx: ComposeContext): string {
  const role = ctx.role.trim() ? `the ${ctx.role.trim()} role` : "the role";
  return ctx.company.trim() ? `${role} at ${ctx.company.trim()}` : role;
}

function evidenceList(ctx: ComposeContext, intro: string): Paragraph | null {
  if (!ctx.picks.length) return null;
  const lines = ctx.picks.map((p) => `- ${p.text}${p.context ? ` (${p.context})` : ""}`);
  return { slot: "evidence", text: [intro, ...lines].join("\n"), fact_ids: ctx.picks.map((p) => p.fact_id) };
}

function subjects(ctx: ComposeContext, v: EmailVariant): string[] {
  const role = ctx.role.trim() || "Application";
  const at = ctx.company.trim() ? ` at ${ctx.company.trim()}` : "";
  const who = ctx.name ? ` – ${ctx.name}` : "";
  const src = ctx.inputs.source.trim();
  switch (v) {
    case "apply_direct":
      return [`Application: ${role}${at}`, `${role} application${who}`, `${role}${at}`];
    case "referral":
      return [`${role}${at} – referred by ${src}`, `Application: ${role} (referral from ${src})`, `${src} suggested I get in touch`];
    case "follow_up":
      return [`Following up: ${role} application`, `${role} application – checking in`, `Re: ${role} application`];
    case "after_interview":
      return [`Following up on our ${role} conversation`, `${role} interview – next steps`, `Thanks, and a quick follow-up`];
    case "thank_you":
      return [`Thank you – ${role} interview`, "Thanks for your time", `${role}: thank you`];
    case "accept_offer":
      return [`Offer acceptance – ${role}`, `Accepting the ${role} offer`, `${role} offer${who}`];
    case "decline_offer":
      return [`${role} offer`, `Re: ${role} offer`, `Thank you – ${role} offer`];
  }
}

export function composeBasic(ctx: ComposeContext): EmailDraft {
  const v = ctx.spec.id;
  const i = ctx.inputs;
  const extra = (s: string) => (s.trim() ? ` ${ensureSentence(s)}` : "");
  const p = (slot: Paragraph["slot"], text: string): Paragraph => ({ slot, text: text.trim(), fact_ids: [] });
  const intro = c(ctx, "A few things from my background that fit what you're looking for:", "A few things from my background that fit what you are looking for:");
  const cvClose = {
    direct: c(ctx, "My CV is attached. Happy to talk whenever suits you.", "My CV is attached. I would be glad to talk whenever it suits you."),
    warm: c(ctx, "I've attached my CV, and I'd be glad to talk whenever it suits you.", "I have attached my CV, and I would be glad to talk whenever it suits you."),
    formal: "My CV is attached. I would be glad to speak whenever it is convenient for you.",
  }[ctx.tone];

  let middle: (Paragraph | null)[] = [];
  switch (v) {
    case "apply_direct":
      middle = [
        p("opener", `${c(ctx, "I'd", "I would")} like to apply for ${roleAt(ctx)}.${i.source ? ` I found it through ${i.source.trim()}.` : ""}${extra(i.company_detail)}`),
        evidenceList(ctx, intro),
        p("close", cvClose),
      ];
      break;
    case "referral":
      middle = [
        p("opener", `${i.source.trim()} suggested I get in touch about ${roleAt(ctx)}.${extra(i.company_detail)}`),
        evidenceList(ctx, intro),
        p("close", cvClose),
      ];
      break;
    case "follow_up":
      middle = [
        p("opener", `I applied for ${roleAt(ctx)}${i.date_note ? ` on ${i.date_note.trim()}` : ""} and wanted to check in.`),
        evidenceList(ctx, c(ctx, "In case it's useful, one thing from my CV that fits the role:", "In case it is useful, one thing from my CV that fits the role:")),
        p("close", c(ctx, "Is there any update on next steps? Thanks for your time.", "Could you let me know if there is any update on next steps? Thank you for your time.")),
      ];
      break;
    case "after_interview":
      middle = [
        p("opener", `Thank you again for talking with me about ${roleAt(ctx)}.${extra(i.interview_detail)}`),
        evidenceList(ctx, c(ctx, "One more thing from my background that's relevant:", "One more thing from my background that is relevant:")),
        p("close", "Could you let me know how the next steps look and when I might hear back?"),
      ];
      break;
    case "thank_you":
      middle = [
        p("opener", `Thank you for your time talking about ${roleAt(ctx)}.${extra(i.interview_detail)}`),
        evidenceList(ctx, c(ctx, "One thing I didn't mention:", "One thing I did not mention:")),
        p("close", c(ctx, "Thanks again, and I hope we speak soon.", "Thank you again. I hope we speak soon.")),
      ];
      break;
    case "accept_offer":
      middle = [
        p("opener", `Thank you for the offer for ${roleAt(ctx)}. ${c(ctx, "I'm", "I am")} happy to accept.`),
        p("close", `${i.date_note ? `I can start on ${i.date_note.trim()}. ` : ""}Please let me know what you need from me next.`),
      ];
      break;
    case "decline_offer":
      middle = [
        p("opener", `Thank you for offering me ${roleAt(ctx)}, and for your time during the process. After careful thought, ${c(ctx, "I've", "I have")} decided not to accept.${extra(i.reason)}`),
        p("close", c(ctx, "I'd be glad to stay in touch.", "I would be glad to stay in touch.")),
      ];
      break;
  }
  return frame(ctx, middle.filter((x): x is Paragraph => x !== null), subjects(ctx, v));
}
