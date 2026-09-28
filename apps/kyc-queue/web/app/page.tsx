"use client";

import { AppShell, Banner, Button, Card, DataTable, FilterBar, Pill, Select, useSession } from "@paved/ui";
import { useEffect, useState } from "react";

interface KycCase {
  id: string;
  reference: string;
  customer_reference: string;
  full_name: string;
  region: string;
  status: string;
  risk_score: number;
  submitted_at: string;
}

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "info" | "neutral"> = {
  pending: "warn",
  in_review: "info",
  approved: "good",
  rejected: "bad",
  escalated: "bad",
};

export default function QueuePage() {
  const { api, principal } = useSession();
  const [status, setStatus] = useState("pending");
  const [minRisk, setMinRisk] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ rows: KycCase[]; total: number }>();
  const [stats, setStats] = useState<{ status: string; count: number }[]>([]);
  const [error, setError] = useState<string>();
  const limit = 25;

  useEffect(() => {
    if (!principal) return;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) params.set("status", status);
    if (minRisk) params.set("minRisk", minRisk);
    api.get<{ rows: KycCase[]; total: number }>(`/api/cases?${params.toString()}`).then(setData).catch((e: Error) => setError(e.message));
    api.get<{ stats: { status: string; count: number }[] }>("/api/stats").then((d) => setStats(d.stats)).catch(() => undefined);
  }, [api, principal, status, minRisk, offset]);

  return (
    <AppShell tool="KYC review queue" links={[{ href: "/", label: "Queue" }]}>
      <h1>Review queue</h1>
      <p className="muted">
        Highest risk first. You only see cases for customers in your regions — enforced server-side, not in this table.
      </p>
      {error ? <Banner tone="bad">{error}</Banner> : null}

      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.status}>
            <b>{s.count}</b>
            <span>{s.status.replace("_", " ")}</span>
          </div>
        ))}
      </div>

      <Card>
        <FilterBar>
          <Select
            label="Status"
            value={status}
            onChange={(v) => { setStatus(v); setOffset(0); }}
            options={[
              { value: "", label: "Any" },
              { value: "pending", label: "Pending" },
              { value: "in_review", label: "In review" },
              { value: "escalated", label: "Escalated" },
              { value: "approved", label: "Approved" },
              { value: "rejected", label: "Rejected" },
            ]}
          />
          <Select
            label="Minimum risk score"
            value={minRisk}
            onChange={(v) => { setMinRisk(v); setOffset(0); }}
            options={[
              { value: "", label: "Any" },
              { value: "50", label: "50+" },
              { value: "75", label: "75+" },
              { value: "90", label: "90+" },
            ]}
          />
        </FilterBar>

        <DataTable
          rows={data?.rows ?? []}
          rowKey={(row) => row.id}
          onRowClick={(row) => { window.location.href = `/cases/${row.id}`; }}
          empty="No cases match these filters in your regions."
          columns={[
            { key: "ref", header: "Case", render: (r) => r.reference },
            { key: "customer", header: "Customer", render: (r) => `${r.customer_reference} · ${r.full_name}` },
            { key: "region", header: "Region", render: (r) => <Pill tone="info">{r.region}</Pill> },
            { key: "risk", header: "Risk", numeric: true, render: (r) => r.risk_score },
            { key: "status", header: "Status", render: (r) => <Pill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill> },
            { key: "submitted", header: "Submitted", render: (r) => String(r.submitted_at).slice(0, 10) },
          ]}
        />

        <div className="pager">
          <span className="muted">{data ? `${data.total} case${data.total === 1 ? "" : "s"}` : "…"}</span>
          <Button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Previous</Button>
          <Button onClick={() => setOffset(offset + limit)} disabled={!data || offset + limit >= data.total}>Next</Button>
        </div>
      </Card>
    </AppShell>
  );
}
