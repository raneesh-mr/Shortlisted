/**
 * Getting the email into the user's own mail app. Nothing is sent by our
 * servers. Note: mailto: links can't carry attachments, so the UI reminds the
 * user to attach their CV.
 */

/** Some mail apps truncate very long mailto: links; past this we suggest copying or the .eml file. */
export const MAILTO_SOFT_LIMIT = 1800;

const enc = (s: string) => encodeURIComponent(s.replace(/\r?\n/g, "\r\n"));

export function mailtoHref(to: string, subject: string, body: string): string {
  const params = [`subject=${enc(subject)}`, `body=${enc(body)}`].join("&");
  return `mailto:${encodeURIComponent(to.trim()).replace(/%40/g, "@")}?${params}`;
}

/** RFC 2047 encoded-word, so non-ASCII subjects survive every mail client. */
function encodeHeader(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  const bytes = new TextEncoder().encode(value);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return `=?UTF-8?B?${btoa(bin)}?=`;
}

function base64Lines(text: string): string {
  const bytes = new TextEncoder().encode(text.replace(/\r?\n/g, "\r\n"));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return (btoa(bin).match(/.{1,76}/g) ?? []).join("\r\n");
}

/**
 * A draft .eml file. "X-Unsent: 1" makes Outlook and Apple Mail open it as an
 * editable draft, where the user can attach their CV and press send.
 */
export function buildEml(opts: { to: string; subject: string; body: string; date?: Date }): string {
  const headers = [
    ...(opts.to.trim() ? [`To: ${opts.to.trim()}`] : []),
    `Subject: ${encodeHeader(opts.subject)}`,
    `Date: ${(opts.date ?? new Date()).toUTCString()}`,
    "X-Unsent: 1",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  return `${headers.join("\r\n")}\r\n\r\n${base64Lines(opts.body)}\r\n`;
}
