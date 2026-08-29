import { NextResponse } from "next/server";
import { withMariModule } from "@/lib/mari/with-module";
import { MariApiError, requireMariConfig } from "@/lib/mari/client";
import { hasMariConfig } from "@/lib/mari/config";
import {
  lookupMariCustomersForProject,
  lookupMariPartnersByCardCode,
  lookupMariPartnersByEmail,
  lookupMariPartnersByEmails,
  normalizeMariEmail,
  searchMariCustomers,
  suggestMariPartnersFromEventTitle,
} from "@/lib/mari/customers";
import {
  listMariCompanies,
  lookupMariCompanyForProject,
} from "@/lib/mari/companies";
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
    const emailsRaw = (url.searchParams.get("emails") || "").trim();
    const cardCodeRaw = (url.searchParams.get("cardCode") || "").trim();
    const eventTitleRaw = (url.searchParams.get("eventTitle") || "").trim();
    const projectRaw = (url.searchParams.get("projectNumber") || "").trim();
    if (url.searchParams.get("companies") === "1") {
      const companies = await listMariCompanies();
      return NextResponse.json({ configured: true, companies });
    }
    if (emailsRaw) {
      const emails = emailsRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 8);
      const suggestions = await lookupMariPartnersByEmails(emails);
      return NextResponse.json({
        configured: true,
        suggestions,
        emails,
      });
    }
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
    if (cardCodeRaw) {
      const suggestions = await lookupMariPartnersByCardCode(cardCodeRaw);
      return NextResponse.json({
        configured: true,
        suggestions,
        cardCode: cardCodeRaw,
      });
    }
    if (eventTitleRaw) {
      const result = await suggestMariPartnersFromEventTitle(
        eventTitleRaw.slice(0, 200)
      );
      return NextResponse.json({
        configured: true,
        ...result,
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
      const [customers, company] = await Promise.all([
        lookupMariCustomersForProject(projectNumber),
        lookupMariCompanyForProject(projectNumber),
      ]);
      return NextResponse.json({
        configured: true,
        customers,
        projectNumber,
        company,
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
