import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError, requireMariConfig } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import {
  lookupMariCustomersForProject,
  lookupMariPartnersByEmail,
  normalizeMariEmail,
  searchMariCustomers,
} from "@/lib/mari/customers";
import { sanitizeMariProjectNumber } from "@/lib/mari/timekeeping-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return withMariModule(async () => {

  if (!hasMariConfig()) {
    return NextResponse.json(
      {
        error: "MARI nicht konfiguriert.",
        configured: false,
        customers: [],
      },
      { status: 503 }
    );
  }

  try {
    requireMariConfig();
    const url = new URL(request.url);
    const emailRaw = (url.searchParams.get("email") || "").trim();
    const projectRaw = (url.searchParams.get("projectNumber") || "").trim();
    if (emailRaw) {
      const email = normalizeMariEmail(emailRaw);
      if (!email) {
        return NextResponse.json({
          configured: true,
          suggestions: [],
          email: emailRaw,
        });
      }
      const suggestions = await lookupMariPartnersByEmail(email);
      return NextResponse.json({
        configured: true,
        suggestions,
        email,
      });
    }
    if (projectRaw) {
      const projectNumber = sanitizeMariProjectNumber(projectRaw);
      if (!projectNumber) {
        return NextResponse.json({
          configured: true,
          customers: [],
          projectNumber: projectRaw,
        });
      }
      const customers = await lookupMariCustomersForProject(projectNumber);
      return NextResponse.json({
        configured: true,
        customers,
        projectNumber,
      });
    }
    const q = (url.searchParams.get("q") || "").trim();
    if (q.length < 2) {
      return NextResponse.json({
        configured: true,
        customers: [],
        query: q,
      });
    }
    const customers = await searchMariCustomers(q, { limit: 30 });
    return NextResponse.json({
      configured: true,
      customers,
      query: q,
    });
  } catch (err) {
    const message =
      err instanceof MariApiError
        ? err.message
        : err instanceof Error
          ? err.message
          : String(err);
    const status = err instanceof MariApiError ? err.status || 502 : 502;
    return NextResponse.json({ error: message, customers: [] }, { status });
  }
  });
}
