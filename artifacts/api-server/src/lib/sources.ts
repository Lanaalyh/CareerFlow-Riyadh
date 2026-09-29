import { db, opportunities } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export type IncomingOpportunity = {
  externalId: string; company: string; title: string; type: string; location: string;
  description: string; requirements: string; skills: string[]; field: string;
  deadline: string | null; source: string; originalUrl: string; applicationMethod: string;
  isTraining: boolean;
};
export interface OpportunitySourceAdapter {
  name: string;
  status: "connected" | "unavailable";
  description: string;
  searchOpportunities(): Promise<IncomingOpportunity[]>;
  getOpportunityDetails(id: string): Promise<IncomingOpportunity | null>;
  checkOpportunityStatus(id: string): Promise<"Open" | "Closed" | "Unknown">;
  getApplicationURL(id: string): Promise<string | null>;
}
const riyadh = (location: string): boolean => {
  const text = location.toLowerCase();
  return /riyadh|الرياض/.test(text) ||
    (/\bremote\b|عن بعد/.test(text) && /saudi|ksa|المملكة|السعودية|riyadh|الرياض/.test(text));
};
export { riyadh };

class GreenhouseAdapter implements OpportunitySourceAdapter {
  name = "Greenhouse";
  status: "connected" | "unavailable" = process.env.GREENHOUSE_BOARD_TOKENS ? "connected" : "unavailable";
  description = "Public Greenhouse job board feeds; configure verified company board tokens.";
  async searchOpportunities(): Promise<IncomingOpportunity[]> {
    const boards = (process.env.GREENHOUSE_BOARD_TOKENS ?? "").split(",").map(x => x.trim()).filter(Boolean);
    const results: IncomingOpportunity[] = [];
    for (const board of boards) {
      if (!/^[a-z0-9_-]+$/i.test(board)) continue;
      try {
        const response = await fetch(`https://boards-api.greenhouse.io/v1/boards/${board}/jobs?content=true`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Greenhouse ${response.status}`);
        const data = await response.json() as { jobs?: Array<{ id: number; title: string; location?: { name?: string }; absolute_url: string; content?: string; departments?: { name: string }[] }> };
        for (const job of data.jobs ?? []) {
          const location = job.location?.name ?? "";
          if (!riyadh(location)) continue;
          results.push({ externalId: `greenhouse:${board}:${job.id}`, company: board, title: job.title, type: /intern|co.?op|training/i.test(job.title) ? "Internship" : "Entry-level", location, description: (job.content ?? "").replace(/<[^>]+>/g, " ").slice(0, 12000), requirements: "", skills: [], field: job.departments?.[0]?.name ?? "", deadline: null, source: "Greenhouse", originalUrl: job.absolute_url, applicationMethod: "online", isTraining: /training|bootcamp|academy/i.test(job.title) });
        }
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
  status: "connected" | "unavailable" = process.env.LEVER_COMPANIES ? "connected" : "unavailable";
  description = "Public Lever postings for configured verified employers.";
  async searchOpportunities(): Promise<IncomingOpportunity[]> {
    const companies = (process.env.LEVER_COMPANIES ?? "").split(",").map(x => x.trim()).filter(Boolean);
    const results: IncomingOpportunity[] = [];
    for (const company of companies) {
      if (!/^[a-z0-9_-]+$/i.test(company)) continue;
      try {
        const response = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(`Lever ${response.status}`);
        const posts = await response.json() as Array<{ id: string; text: string; hostedUrl: string; descriptionPlain?: string; categories?: { location?: string; team?: string; commitment?: string } }>;
        for (const post of posts) {
          const location = post.categories?.location ?? "";
          if (!riyadh(location)) continue;
          results.push({ externalId: `lever:${company}:${post.id}`, company, title: post.text, type: post.categories?.commitment ?? "Entry-level", location, description: (post.descriptionPlain ?? "").slice(0, 12000), requirements: "", skills: [], field: post.categories?.team ?? "", deadline: null, source: "Lever", originalUrl: post.hostedUrl, applicationMethod: "online", isTraining: /training|bootcamp|academy/i.test(post.text) });
        }
      } catch (err) { logger.warn({ err, company }, "Lever feed unavailable"); }
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
  new GreenhouseAdapter(), new LeverAdapter(),
  new UnavailableAdapter("عتبة", "Ataba has no configured permitted feed or API; listings are not imported."),
  new UnavailableAdapter("Workday", "Requires an approved public feed per company."),
  new UnavailableAdapter("Government training", "Requires an approved public feed or official API."),
  new UnavailableAdapter("Company career pages", "Requires verified, permitted company feeds."),
];
export async function refreshSources() {
  for (const source of sources.filter(s => s.status === "connected")) {
    for (const item of await source.searchOpportunities()) {
      if (!riyadh(item.location) || !/^https:\/\//.test(item.originalUrl)) continue;
      const existing = await db.select().from(opportunities).where(eq(opportunities.externalId, item.externalId)).limit(1);
      if (existing.length) {
        await db.update(opportunities).set({ ...item, status: "Open", verifiedAt: new Date() }).where(eq(opportunities.id, existing[0].id));
      } else {
        await db.insert(opportunities).values({ ...item, status: "Open" });
      }
    }
  }
}