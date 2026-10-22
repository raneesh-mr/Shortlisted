import { apiFetch, downloadBlob, safeFilename } from "@/lib/client-api";

/** Where to send someone who wants the file for a CV they haven't paid for yet. */
export const payHref = (cvId: string) => `/quick/pay?cv=${encodeURIComponent(cvId)}`;

/** Downloads a paid CV. The server loads it from the account and checks the purchase. */
export async function downloadPaidCv(cvId: string, format: "pdf" | "docx", name: string): Promise<void> {
  const res = await apiFetch(`/api/export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "file", cv_id: cvId }),
  });
  downloadBlob(await res.blob(), `${safeFilename(name)}.${format}`);
}

/** Loads Razorpay Checkout once. */
let checkoutScript: Promise<void> | null = null;
export function loadCheckout(): Promise<void> {
  if (typeof window !== "undefined" && "Razorpay" in window) return Promise.resolve();
  checkoutScript ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      checkoutScript = null;
      reject(new Error("checkout_load_failed"));
    };
    document.head.appendChild(s);
  });
  return checkoutScript;
}

/** A checkout the user started as a guest; picked up again after sign-in. */
export const PENDING_CHECKOUT = "shortlisted_pending_checkout";
