import { db, opportunities } from "@workspace/db";
import { eq, and, notInArray, like } from "drizzle-orm";
import { logger } from "./logger";

export type IncomingOpportunity = {
  externalId: string; company: string; title: string; type: string; location: string;
  description: string; requirements: string; skills: string[]; field: string;
  deadline: string | null; source: string; originalUrl: string; applicationMethod: string;
  isTraining: boolean;
};
const trainingRole = (title: string, description = "") =>
  /\b(co.?op|cooperative|intern(?:ship)?|student.?training|university.?training|industrial.?training|practical.?training|student.?placement)\b/i.test(title) ||
  (/\b(trainee|training program)\b/i.test(title) && /\b(university|student|undergraduate|college)\b/i.test(description.slice(0, 2500)));
const cooperativeRole = (title: string) => /\b(co.?op|cooperative)\b/i.test(title);
const decodeHtml = (value: string) => value
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#(?:x([0-9a-f]+)|([0-9]+));/gi, (_, hex: string, dec: string) => String.fromCodePoint(parseInt(hex || dec, hex ? 16 : 10)))
  .replace(/&amp;/g, "&").replace(/&nbsp;/g, " ");
const plainText = (value: string) => decodeHtml(value).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const deadlineStillOpen = (deadline: string | null) => !deadline || (Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) >= Date.now());
export interface OpportunitySourceAdapter {
  name: string;
  status: "connected" | "unavailable";
  description: string;
  scannedScopes?: { prefix: string; ids: string[] }[];
  searchOpportunities(): Promise<IncomingOpportunity[]>;
  getOpportunityDetails(id: string): Promise<IncomingOpportunity | null>;
  checkOpportunityStatus(id: string): Promise<"Open" | "Closed" | "Unknown">;
  getApplicationURL(id: string): Promise<string | null>;
}
const riyadh = (location: string): boolean => {
  const text = location.toLowerCase();
  return /riyadh|الرياض/.test(text) && !/\b(remote only|outside riyadh)\b/.test(text);
};
const remoteSaudi = (location: string) => /\bremote\b|عن بعد/i.test(location) && /saudi|ksa|المملكة|السعودية|riyadh|الرياض/i.test(location);
export const saudiLocation = (location: string) => riyadh(location) || remoteSaudi(location) || /saudi|ksa|السعودية|المملكة|jeddah|dammam|khobar|jubail|yanbu|mecca|makkah|medina|madinah|tabuk|abha|qassim|الدمام|جدة/i.test(location);
export const matchesLocation = (location: string, selection: string) => {
  if (!saudiLocation(location)) return false;
  if (selection === "remote-saudi") return remoteSaudi(location);
  if (selection === "other-saudi") return !riyadh(location) && !remoteSaudi(location);
  if (selection === "all-saudi") return true;
  return riyadh(location);
};
export { riyadh };

class GreenhouseAdapter implements OpportunitySourceAdapter {
  name = "Greenhouse";
  status: "connected" | "unavailable" = "connected";
  description = "Public employer job feeds: Ogilvy MENA, Tamara and Careem, plus configured verified boards.";
  scannedScopes: { prefix: string; ids: string[] }[] = [];
  async searchOpportunities(): Promise<IncomingOpportunity[]> {
    this.scannedScopes = [];
    const boards = [...new Set(["ogilvymena", "tamara", "careem", ...(process.env.GREENHOUSE_BOARD_TOKENS ?? "").split(",").map(x => x.trim()).filter(Boolean)])];
    const results: IncomingOpportunity[] = [];
    for (const board of boards) {
      if (!/^[a-z0-9_-]+$/i.test(board)) continue;
      try {
        const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Greenhouse ${response.status}`);
        const data = await response.json() as { jobs?: Array<{ id: number; title: string; location?: { name?: string }; absolute_url: string; content?: string; departments?: { name: string }[] }> };
        if (!Array.isArray(data.jobs)) throw new Error("Invalid Greenhouse jobs response");
        const ids: string[] = [];
        for (const job of data.jobs ?? []) {
          const location = job.location?.name ?? "";
          if (!saudiLocation(location) || !trainingRole(job.title, plainText(job.content ?? ""))) continue;
          const externalId = `greenhouse:${board}:${job.id}`;
          ids.push(externalId);
          results.push({ externalId, company: ({ ogilvymena: "Ogilvy MENA", tamara: "Tamara", careem: "Careem" } as Record<string, string>)[board] ?? board, title: job.title, type: cooperativeRole(job.title) ? "Co-op" : "Internship", location, description: plainText(job.content ?? "").slice(0, 12000), requirements: "", skills: [], field: job.departments?.[0]?.name ?? "", deadline: null, source: "Greenhouse", originalUrl: job.absolute_url, applicationMethod: "online", isTraining: cooperativeRole(job.title) });
        }
        this.scannedScopes.push({ prefix: `greenhouse:${board}:`, ids });
      } catch (err) { logger.warn({ err, board }, "Greenhouse feed unavailable"); }
    }
    return results;
  }
  async getOpportunityDetails(id: string) { return (await this.searchOpportunities()).find(x => x.externalId === id) ?? null; }
  async checkOpportunityStatus(id: string) { return (await this.getOpportunityDetails(id)) ? "Open" as const : "Unknown" as const; }
  async getApplicationURL(id: string) { return (await this.getOpportunityDetails(id))?.originalUrl ?? null; }
}
class LeverAdapter implements OpportunitySourceAdapter {
  name = "Lever";
  status: "connected" | "unavailable" = "connected";
  description = "Current internships on public employer Lever boards, including Trendyol.";
  scannedScopes: { prefix: string; ids: string[] }[] = [];
  async searchOpportunities(): Promise<IncomingOpportunity[]> {
    this.scannedScopes = [];
    const companies = [...new Set(["trendyol", ...(process.env.LEVER_COMPANIES ?? "").split(",").map(x => x.trim()).filter(Boolean)])];
    const results: IncomingOpportunity[] = [];
    for (const company of companies) {
      if (!/^[a-z0-9_-]+$/i.test(company)) continue;
      try {
        const response = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Lever ${response.status}`);
        const posts = await response.json() as Array<{ id: string; text: string; hostedUrl: string; descriptionPlain?: string; categories?: { location?: string; team?: string; commitment?: string } }>;
        if (!Array.isArray(posts)) throw new Error("Invalid Lever postings response");
        const ids: string[] = [];
        for (const post of posts) {
          const location = post.categories?.location ?? "";
          if (!saudiLocation(location) || !trainingRole(post.text, post.descriptionPlain ?? "")) continue;
          const externalId = `lever:${company}:${post.id}`;
          ids.push(externalId);
          results.push({ externalId, company: company === "trendyol" ? "Trendyol" : company, title: post.text, type: cooperativeRole(post.text) ? "Co-op" : "Internship", location, description: (post.descriptionPlain ?? "").slice(0, 12000), requirements: "", skills: [], field: post.categories?.team ?? "", deadline: null, source: "Lever", originalUrl: post.hostedUrl, applicationMethod: "online", isTraining: cooperativeRole(post.text) });
        }
        this.scannedScopes.push({ prefix: `lever:${company}:`, ids });
      } catch (err) { logger.warn({ err, company }, "Lever feed unavailable"); }
    }
    return results;
  }
  async getOpportunityDetails(id: string) { return (await this.searchOpportunities()).find(x => x.externalId === id) ?? null; }
  async checkOpportunityStatus(id: string) { return (await this.getOpportunityDetails(id)) ? "Open" as const : "Unknown" as const; }
  async getApplicationURL(id: string) { return (await this.getOpportunityDetails(id))?.originalUrl ?? null; }
}
/**
 * Public employer sitemap + JobPosting structured data, not an authenticated
 * applicant endpoint. Only employer hosts whose robots.txt permits these
 * paths belong in this adapter.
 */
class CompanyCareerPagesAdapter implements OpportunitySourceAdapter {
  name = "Company career pages";
  status: "connected" | "unavailable" = "connected";
  description = "Current student roles from permitted public employer career pages (Chalhoub Group). Refreshed regularly.";
  private readonly hosts = ["careers.chalhoubgroup.com"];
  async searchOpportunities(): Promise<IncomingOpportunity[]> {
    const output: IncomingOpportunity[] = [];
    for (const host of this.hosts) {
      const sitemap = await fetch(`https://${host}/sitemap.xml`, { signal: AbortSignal.timeout(15000) });
      if (!sitemap.ok) throw new Error(`Career sitemap ${host}: ${sitemap.status}`);
      const xml = await sitemap.text();
      if (xml.length > 3_000_000) throw new Error("Career sitemap exceeds size limit");
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
        .map(match => decodeHtml(match[1]))
        .filter(url => {
          try {
            const parsed = new URL(url);
            return parsed.protocol === "https:" && parsed.hostname === host && /^\/jobs\/[0-9]+-[a-z0-9-]+$/i.test(parsed.pathname) &&
              /\b(cooperative|co-op|coop|internship|intern|student-training)\b/i.test(parsed.pathname) &&
              !/tamheer/i.test(parsed.pathname);
          } catch { return false; }
        });
      // Bounded batches avoid hammering an employer's site.
      for (let i = 0; i < urls.length; i += 3) {
        const batch = await Promise.all(urls.slice(i, i + 3).map(async url => {
          const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
          if (!response.ok) return null;
          const html = await response.text();
          const script = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
          if (!script) return null;
          let posting: Record<string, unknown>;
          try { posting = JSON.parse(script[1]) as Record<string, unknown>; }
          catch { return null; }
          if (posting["@type"] !== "JobPosting") return null;
          const title = String(posting.title ?? "");
          const locations = Array.isArray(posting.jobLocation) ? posting.jobLocation : [posting.jobLocation];
          const location = locations.map((entry: unknown) => {
            const address = (entry as { address?: { addressLocality?: string; addressCountry?: string } } | null)?.address;
            return `${address?.addressLocality ?? ""}, ${address?.addressCountry ?? ""}`;
          }).find(saudiLocation);
          const deadline = typeof posting.validThrough === "string" ? posting.validThrough : null;
          if (!location || !trainingRole(title, String(posting.description ?? "")) || !deadlineStillOpen(deadline)) return null;
          const description = plainText(String(posting.description ?? "")).slice(0, 12000);
          if (!description) return null;
          const company = (posting.hiringOrganization as { name?: string } | undefined)?.name ?? "Chalhoub Group";
          return { externalId: `career:${host}:${new URL(url).pathname.split("/")[2].split("-")[0]}`, company, title, type: cooperativeRole(title) ? "Co-op" : "Internship", location, description, requirements: "", skills: [], field: "", deadline, source: "Company career pages", originalUrl: url, applicationMethod: "online", isTraining: cooperativeRole(title) } satisfies IncomingOpportunity;
        }));
        for (const item of batch) if (item) output.push(item);
      }
    }
    return output;
  }
  async getOpportunityDetails(id: string) { return (await this.searchOpportunities()).find(x => x.externalId === id) ?? null; }
  async checkOpportunityStatus(id: string) { return (await this.getOpportunityDetails(id)) ? "Open" as const : "Unknown" as const; }
  async getApplicationURL(id: string) { return (await this.getOpportunityDetails(id))?.originalUrl ?? null; }
}
class RiyadhAirAdapter implements OpportunitySourceAdapter {
  name = "Riyadh Air careers";
  status: "connected" | "unavailable" = "connected";
  description = "Official Riyadh Air public iCIMS sitemap and structured job postings.";
  async searchOpportunities(): Promise<IncomingOpportunity[]> {
    const host = "careers-riyadhair.icims.com";
    const sitemap = await fetch(`https://${host}/sitemap.xml`, { signal: AbortSignal.timeout(15000) });
    if (!sitemap.ok) throw new Error(`Riyadh Air sitemap ${sitemap.status}`);
    const xml = await sitemap.text();
    if (xml.length > 3_000_000) throw new Error("Riyadh Air sitemap exceeds size limit");
    const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => decodeHtml(match[1]))
      .filter(url => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === "https:" && parsed.hostname === host &&
            /^\/jobs\/\d+\/[^/]+\/job$/.test(parsed.pathname) && trainingRole(parsed.pathname);
        } catch { return false; }
      });
    const results: IncomingOpportunity[] = [];
    for (const url of urls) {
      const publicPage = `${url}?in_iframe=1`;
      const response = await fetch(publicPage, { signal: AbortSignal.timeout(12000) });
      if (response.status === 404 || response.status === 410) continue;
      if (!response.ok) throw new Error(`Riyadh Air job page ${response.status}`);
      const html = await response.text();
      const match = html.match(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i);
      if (!match) continue;
      let posting: Record<string, unknown>;
      try { posting = JSON.parse(match[1]) as Record<string, unknown>; }
      catch { continue; }
      if (posting["@type"] !== "JobPosting") continue;
      const title = String(posting.title ?? "");
      const description = plainText(String(posting.description ?? "")).slice(0, 12000);
      const locations = Array.isArray(posting.jobLocation) ? posting.jobLocation : [posting.jobLocation];
      const location = locations.map((entry: unknown) => {
        const address = (entry as { address?: { addressLocality?: string; addressCountry?: string } } | null)?.address;
        return `${address?.addressLocality ?? ""}, ${address?.addressCountry ?? ""}`;
      }).find(saudiLocation);
      // iCIMS can emit UNAVAILABLE for the JSON-LD locality while its own
      // public job metadata states the actual job location.
      let icimsLocation = "";
      const icimsData = html.match(/var icimsSD\s*=\s*(\{[^\n]+?\});/);
      if (icimsData) {
        try { icimsLocation = String((JSON.parse(icimsData[1]) as { job?: { location?: string } }).job?.location ?? ""); }
        catch { /* Use only the structured posting location. */ }
      }
      const deadline = typeof posting.validThrough === "string" ? posting.validThrough : null;
      const verifiedLocation = location || (saudiLocation(icimsLocation) ? icimsLocation : "");
      if (!verifiedLocation || !description || !trainingRole(title, description) || !deadlineStillOpen(deadline) ||
        !/mode=apply|apply today/i.test(html)) continue;
      results.push({
        externalId: `icims:riyadhair:${new URL(url).pathname.split("/")[2]}`,
        company: "Riyadh Air", title, location: verifiedLocation, description,
        requirements: "", skills: [], field: "", deadline,
        type: cooperativeRole(title) ? "Co-op" : "Internship", source: this.name,
        originalUrl: publicPage, applicationMethod: "online", isTraining: cooperativeRole(title),
      });
    }
    return results;
  }
  async getOpportunityDetails(id: string) { return (await this.searchOpportunities()).find(x => x.externalId === id) ?? null; }
  async checkOpportunityStatus(id: string) { return (await this.getOpportunityDetails(id)) ? "Open" as const : "Unknown" as const; }
  async getApplicationURL(id: string) { return (await this.getOpportunityDetails(id))?.originalUrl ?? null; }
}
class UnavailableAdapter implements OpportunitySourceAdapter {
  status = "unavailable" as const;
  constructor(public name: string, public description: string) {}
  async searchOpportunities() { return []; }
  async getOpportunityDetails(_id: string) { return null; }
  async checkOpportunityStatus(_id: string) { return "Unknown" as const; }
  async getApplicationURL(_id: string) { return null; }
}
export const sources: OpportunitySourceAdapter[] = [
  new CompanyCareerPagesAdapter(), new RiyadhAirAdapter(), new GreenhouseAdapter(), new LeverAdapter(),
  new UnavailableAdapter("عتبة", "Ataba has no configured permitted feed or API; listings are not imported."),
  new UnavailableAdapter("Workday", "Requires an approved public feed per company."),
  new UnavailableAdapter("Government training", "Requires an approved public feed or official API."),
];
let inFlightRefresh: Promise<void> | null = null;
let lastRefreshAt = 0;
export function refreshSources(force = false): Promise<void> {
  if (inFlightRefresh) return inFlightRefresh;
  if (!force && Date.now() - lastRefreshAt < 30 * 60 * 1000) return Promise.resolve();
  inFlightRefresh = performRefresh().finally(() => {
    lastRefreshAt = Date.now();
    inFlightRefresh = null;
  });
  return inFlightRefresh;
}
async function performRefresh() {
  await Promise.all(sources.filter(s =>
    s.name === "Company career pages" ||
    s.name === "Riyadh Air careers" ||
    s.name === "Greenhouse" ||
    s.name === "Lever").map(async source => {
    let incoming: IncomingOpportunity[];
    try {
      incoming = await source.searchOpportunities();
      source.status = "connected";
    } catch (err) {
      source.status = "unavailable";
      logger.warn({ err, source: source.name }, "Opportunity source refresh failed");
      return;
    }
    const seen: string[] = [];
    for (const item of incoming) {
      if (!saudiLocation(item.location) || !/^https:\/\//.test(item.originalUrl)) continue;
      seen.push(item.externalId);
      const existing = await db.select().from(opportunities).where(eq(opportunities.externalId, item.externalId)).limit(1);
      if (existing.length) {
        await db.update(opportunities).set({ ...item, status: "Open", verifiedAt: new Date() }).where(eq(opportunities.id, existing[0].id));
      } else {
        await db.insert(opportunities).values({ ...item, status: "Open" });
      }
    }
    // A successfully refreshed official sitemap is a complete snapshot.
    // Remove withdrawn posts from active discovery without deleting saved history.
    if (source.name === "Company career pages" || source.name === "Riyadh Air careers") {
      await db.update(opportunities).set({ status: "Closed" }).where(
        seen.length ? and(eq(opportunities.source, source.name), notInArray(opportunities.externalId, seen))! : eq(opportunities.source, source.name),
      );
    }
    for (const scope of source.scannedScopes ?? []) {
      await db.update(opportunities).set({ status: "Closed" }).where(
        scope.ids.length
          ? and(eq(opportunities.source, source.name), like(opportunities.externalId, `${scope.prefix}%`), notInArray(opportunities.externalId, scope.ids))!
          : and(eq(opportunities.source, source.name), like(opportunities.externalId, `${scope.prefix}%`))!,
      );
    }
  }));
}