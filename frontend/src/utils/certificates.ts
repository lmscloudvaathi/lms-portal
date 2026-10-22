import axios from "axios";
import API_BASE_URL from "../config";

async function messageFromBlob(blob: Blob, fallback: string): Promise<string> {
  try {
    const text = await blob.text();
    const parsed = JSON.parse(text);
    if (typeof parsed?.detail === "string" && parsed.detail.trim()) return parsed.detail;
    if (typeof parsed?.message === "string" && parsed.message.trim()) return parsed.message;
  } catch {
    /* not JSON */
  }
  return fallback;
}

/**
 * Ensures a certificate exists (if the course is complete), then downloads the PDF.
 * Works for every enrolled course once requirements are met.
 */
export async function downloadCertificatePdf(courseId: number, courseTitle: string) {
  const token = localStorage.getItem("token");
  if (!token) {
    throw new Error("Please sign in again to download your certificate.");
  }

  const headers = { Authorization: `Bearer ${token}` };
  let claimHint = "";

  try {
    const claim = await axios.post(
      `${API_BASE_URL}/courses/${courseId}/claim-certificate`,
      {},
      { headers, timeout: 120000 }
    );
    if (claim.data?.status === "error" && typeof claim.data?.message === "string") {
      claimHint = claim.data.message;
    }
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data?.detail) {
      claimHint = String(err.response.data.detail);
    }
  }

  let response;
  try {
    response = await axios.get(`${API_BASE_URL}/generate-pdf/${courseId}`, {
      headers,
      responseType: "blob",
      timeout: 120000,
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.data instanceof Blob) {
      throw new Error(
        await messageFromBlob(
          err.response.data,
          claimHint ||
            (err.response.status === 403
              ? "Certificate not yet earned. Complete the course first."
              : "Could not download certificate. Please try again.")
        )
      );
    }
    if (axios.isAxiosError(err) && !err.response) {
      throw new Error("Cannot reach the server. Check your connection and try again.");
    }
    if (claimHint) throw new Error(claimHint);
    throw err instanceof Error ? err : new Error("Could not download certificate.");
  }

  const blob = response.data as Blob;
  const contentType = String(response.headers["content-type"] || blob.type || "");
  if (contentType.includes("application/json")) {
    throw new Error(await messageFromBlob(blob, claimHint || "Could not download certificate."));
  }

  const header = await blob.slice(0, 5).text();
  if (!header.startsWith("%PDF")) {
    throw new Error(await messageFromBlob(blob, "Certificate file was invalid. Please try again."));
  }

  const url = window.URL.createObjectURL(new Blob([blob], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  const safeTitle = (courseTitle || "certificate").replace(/[^\w\-]+/g, "_").replace(/_+/g, "_");
  link.setAttribute("download", `${safeTitle}_Certificate.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function certificateVerifyPath(credentialId: string) {
  return `/certificates/${encodeURIComponent(credentialId)}`;
}
