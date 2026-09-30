/** Conservative major relevance: evidence from the employer's listing, not a guessed eligibility claim. */
type JobText = { title: string; field: string; description: string; requirements: string };
export type MajorMatch = { level: "High" | "Medium" | "Low" | "Unclear"; reason: string };

const relatedMajors = [
  ["computer science", "software engineering", "information technology", "information systems", "computer engineering", "cybersecurity", "data science", "artificial intelligence"],
  ["business administration", "management", "marketing", "human resources"],
  ["finance", "accounting", "economics"],
  ["mechanical engineering", "industrial engineering", "electrical engineering", "civil engineering"],
  ["graphic design", "visual design", "architecture"],
];
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").replace(/\s+/g, " ").trim();
const contains = (haystack: string, needle: string) => !!needle && (` ${haystack} `).includes(` ${needle} `);
const groupFor = (major: string) => relatedMajors.find(group => group.some(name => normalize(name) === major)) ?? [major];
const knownMajors = [...new Set(relatedMajors.flat())];

export function matchMajor(rawMajor: string, job: JobText): MajorMatch {
  const major = normalize(rawMajor);
  if (!major) return { level: "Unclear", reason: "Enter your major to see relevance." };
  const role = normalize(`${job.title} ${job.field}`);
  const details = normalize(`${job.requirements} ${job.description}`);
  const variants = groupFor(major).map(normalize);
  if (/\b(all majors|any major|all fields of study|any discipline)\b/.test(details)) {
    return { level: "High", reason: "The employer states that all majors may apply." };
  }
  // Restrict "explicit" evidence to nearby degree/major/field language. A
  // company description mentioning a discipline does not establish eligibility.
  const rawRequirements = `${job.requirements}. ${job.description}`;
  const requirementWindows = [...rawRequirements.matchAll(/\b(?:majors?|degree|field of study|academic background|studying|students? (?:in|of)|bachelor(?:'s)? (?:in|degree in))\b/gi)]
    .slice(0, 30).map(match => normalize(rawRequirements.slice(Math.max(0, match.index! - 80), match.index! + 180))).join(" ");
  const accepted = variants.find(variant => contains(requirementWindows, variant));
  if (accepted === major) return { level: "High", reason: `The listed requirements mention ${rawMajor.trim()}.` };
  if (accepted) return { level: "Medium", reason: `The listed requirements mention a related major: ${accepted}. Check eligibility on the employer site.` };
  const namedOtherMajors = knownMajors.map(normalize).filter(name => contains(requirementWindows, name));
  if (namedOtherMajors.length && !/\b(related fields?|or equivalent|all majors|any major)\b/.test(requirementWindows)) {
    return { level: "Low", reason: "The listing names other majors; check its eligibility requirements." };
  }
  if (contains(role, major)) return { level: "Medium", reason: "The role title or department matches your major; eligibility is not explicit." };
  const relatedRole = variants.find(variant => contains(role, variant));
  if (relatedRole) return { level: "Medium", reason: `The role mentions ${relatedRole}, a related field; check the requirements.` };
  if (contains(details, major)) return { level: "Medium", reason: "Your major appears in the description, but eligibility is not explicit." };
  return { level: "Unclear", reason: "Requirements unclear — check the original employer listing." };
}