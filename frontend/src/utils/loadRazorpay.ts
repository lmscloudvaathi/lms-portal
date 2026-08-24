import { loadScript } from "./loadScript";

const RAZORPAY_SRC = "https://checkout.razorpay.com/v1/checkout.js";

export async function loadRazorpayScript(): Promise<boolean> {
  try {
    await loadScript(RAZORPAY_SRC, "cv-razorpay-checkout");
    return typeof (window as Window & { Razorpay?: unknown }).Razorpay === "function";
  } catch {
    return false;
  }
}
