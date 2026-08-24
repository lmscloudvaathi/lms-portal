import axios from "axios";
import API_BASE_URL from "../config";

export async function downloadCertificatePdf(courseId: number, courseTitle: string) {
  const token = localStorage.getItem("token");
  const response = await axios.get(`${API_BASE_URL}/generate-pdf/${courseId}`, {
    headers: { Authorization: `Bearer ${token}` },
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  const safeTitle = (courseTitle || "certificate").replace(/\s+/g, "_");
  link.setAttribute("download", `${safeTitle}_Certificate.pdf`);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

export function certificateVerifyPath(credentialId: string) {
  return `/certificates/${encodeURIComponent(credentialId)}`;
}
