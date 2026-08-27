// Pure YTD/QTD billing math — no Supabase import, kept separate from
// lib/data.ts (server-only) the same way lib/aging.ts is, so this stays
// reusable and independently testable.

export interface DrawForBilling {
  status: string;
  amount_requested: number | null;
  amount_paid: number | null;
  date_submitted: string | null;
  date_paid: string | null;
  created_at: string;
}

export interface QuarterBucket {
  quarter: 1 | 2 | 3 | 4;
  requested: number;
  received: number;
}

export interface BillingReport {
  year: number;
  ytdRequested: number;
  ytdReceived: number;
  quarters: QuarterBucket[];
}

function yearAndQuarterOf(dateISO: string): { year: number; quarter: 1 | 2 | 3 | 4 } {
  const d = new Date(dateISO);
  return { year: d.getFullYear(), quarter: (Math.floor(d.getMonth() / 3) + 1) as 1 | 2 | 3 | 4 };
}

export function currentQuarter(now: Date = new Date()): 1 | 2 | 3 | 4 {
  return (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

// "Requested" is bucketed by when a draw was submitted (billed); "received"
// by when it was actually paid — a draw billed in one quarter can be paid in
// a later one, which is the point of showing both columns side by side.
// Draws marked paid without a recorded date_paid fall back to their
// submission date rather than being silently dropped from the total.
export function buildBillingReport(draws: DrawForBilling[], year: number): BillingReport {
  const quarters: QuarterBucket[] = [1, 2, 3, 4].map((quarter) => ({
    quarter: quarter as 1 | 2 | 3 | 4,
    requested: 0,
    received: 0,
  }));

  for (const d of draws) {
    if (d.status === "draft") continue;

    const requestedDate = d.date_submitted ?? d.created_at;
    const requested = yearAndQuarterOf(requestedDate);
    if (requested.year === year) {
      quarters[requested.quarter - 1].requested += d.amount_requested ?? 0;
    }

    const amountPaid = d.amount_paid ?? 0;
    if (amountPaid > 0) {
      const paidDate = d.date_paid ?? requestedDate;
      const received = yearAndQuarterOf(paidDate);
      if (received.year === year) {
        quarters[received.quarter - 1].received += amountPaid;
      }
    }
  }

  return {
    year,
    ytdRequested: quarters.reduce((acc, q) => acc + q.requested, 0),
    ytdReceived: quarters.reduce((acc, q) => acc + q.received, 0),
    quarters,
  };
}
