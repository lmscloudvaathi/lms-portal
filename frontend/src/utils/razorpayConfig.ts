/** Shared Razorpay frontend config + helpers. */

export function getRazorpayKeyId(): string {
  return String(import.meta.env.VITE_RAZORPAY_KEY_ID || "").trim();
}

export function getRazorpayPayLinkUrl(): string {
  return String(import.meta.env.VITE_RAZORPAY_PAYLINK_URL || "").trim();
}

export function isRazorpayKeyConfigured(): boolean {
  const key = getRazorpayKeyId();
  return Boolean(key) && !key.includes("replace_me") && !key.includes("your_razorpay");
}

/** Opens the hosted Razorpay.me payment link in a new tab. */
export function openRazorpayPayLink(): boolean {
  const url = getRazorpayPayLinkUrl();
  if (!url) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
