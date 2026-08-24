export const COURSE_CATEGORY_OPTIONS = [
  { id: "programming", label: "Programming" },
  { id: "web-development", label: "Web Development" },
  { id: "data-science", label: "Data Science" },
  { id: "cloud-devops", label: "Cloud & DevOps" },
  { id: "business", label: "Business" },
  { id: "marketing", label: "Marketing" },
  { id: "general", label: "General" },
] as const;

export type CourseCategoryId = (typeof COURSE_CATEGORY_OPTIONS)[number]["id"];

const CATEGORY_IDS = new Set<string>(COURSE_CATEGORY_OPTIONS.map((c) => c.id));

export type CategorySource = {
  title?: string;
  category?: string | null;
  course_type?: string | null;
  language?: string | null;
  description?: string | null;
};

export const categoryLabel = (id: string): string =>
  COURSE_CATEGORY_OPTIONS.find((c) => c.id === id)?.label || "General";

function matchesAny(text: string, keywords: string[]): boolean {
  return keywords.some((word) => text.includes(word));
}

export function resolveCourseCategory(course: CategorySource): CourseCategoryId {
  const explicit = String(course.category || "").trim().toLowerCase();
  if (CATEGORY_IDS.has(explicit)) return explicit as CourseCategoryId;

  const haystack = `${course.title || ""} ${course.description || ""}`.toLowerCase();
  const language = String(course.language || "").toLowerCase();

  if (matchesAny(haystack, ["data science", "data-science", "machine learning", "analytics", "pandas", "numpy"])) {
    return "data-science";
  }
  if (matchesAny(haystack, ["marketing", "seo", "brand"])) return "marketing";
  if (matchesAny(haystack, ["business", "mba", "finance", "excel", "accounting"])) return "business";
  if (matchesAny(haystack, ["aws", "azure", "gcp", "devops", "docker", "kubernetes", "cloud"])) {
    return "cloud-devops";
  }
  if (
    language === "javascript" ||
    matchesAny(haystack, ["web", "react", "html", "css", "javascript", "node", "frontend", "backend"])
  ) {
    return "web-development";
  }
  if (
    course.course_type === "coding" ||
    ["python", "java", "cpp", "c++"].includes(language) ||
    matchesAny(haystack, ["python", "java", "coding", "programming", "dsa", "algorithm", "compiler"])
  ) {
    return "programming";
  }

  return "general";
}

export function groupCoursesByCategory<T extends CategorySource>(courses: T[]): { id: CourseCategoryId; label: string; courses: T[] }[] {
  const buckets = new Map<CourseCategoryId, T[]>();
  for (const course of courses) {
    const id = resolveCourseCategory(course);
    const list = buckets.get(id) || [];
    list.push(course);
    buckets.set(id, list);
  }
  return COURSE_CATEGORY_OPTIONS
    .filter((option) => (buckets.get(option.id) || []).length > 0)
    .map((option) => ({
      id: option.id,
      label: option.label,
      courses: buckets.get(option.id) || [],
    }));
}
