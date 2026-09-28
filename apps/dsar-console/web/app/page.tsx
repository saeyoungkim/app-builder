"use client";

import { AppShell, Banner, Button, Card, DataTable, FilterBar, Pill, Select, useSession } from "@paved/ui";
import { useEffect, useState } from "react";

interface DsarRequest {
  id: string;
  reference: string;
  customer_reference: string;
  full_name: string;
  region: string;
  request_type: string;
  status: string;
  received_at: string;
  due_at: string;
}

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "info" | "neutral"> = {
  open: "warn",
  in_progress: "info",
  fulfilled: "good",
  refused: "bad",
};

const isOverdue = (row: DsarRequest) =>
  (row.status === "open" || row.status === "in_progress") && new Date(row.due_at) < new Date();

export default function RequestsPage() {
  const { api, principal } = useSession();
  const [status, setStatus] = useState("open");
  const [requestType, setRequestType] = useState("");
  const [overdueOnly, setOverdueOnly] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ rows: DsarRequest[]; total: number }>();
  const [stats, setStats] = useState<{ status: string; count: number; overdue: number }[]>([]);
  const [error, setError] = useState<string>();
  const limit = 25;

  useEffect(() => {
    if (!principal) return;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) params.set("status", status);
    if (requestType) params.set("requestType", requestType);
    if (overdueOnly) params.set("overdueOnly", "true");
    api
      .get<{ rows: DsarRequest[]; total: number }>(`/api/requests?${params.toString()}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
    api
      .get<{ stats: { status: string; count: number; overdue: number }[] }>("/api/stats")
      .then((d) => setStats(d.stats))
      .catch(() => undefined);
  }, [api, principal, status, requestType, overdueOnly, offset]);

  return (
    <AppShell tool="Data subject requests" links={[{ href: "/", label: "Requests" }]}>
      <h1>Request queue</h1>
      <p className="muted">
        Soonest deadline first. Regions, PII masking and who may close a request come from the
        platform — this tool only declares which permission each route needs.
      </p>
      {error ? <Banner tone="bad">{error}</Banner> : null}

      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.status}>
            <b>{s.count}</b>
            <span>
              {s.status.replace("_", " ")}
              {s.overdue > 0 ? ` · ${s.overdue} overdue` : ""}
            </span>
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
              { value: "open", label: "Open" },
              { value: "in_progress", label: "In progress" },
              { value: "fulfilled", label: "Fulfilled" },
              { value: "refused", label: "Refused" },
            ]}
          />
          <Select
            label="Type"
            value={requestType}
            onChange={(v) => { setRequestType(v); setOffset(0); }}
            options={[
              { value: "", label: "Any" },
              { value: "access", label: "Access" },
              { value: "erasure", label: "Erasure" },
              { value: "correction", label: "Correction" },
              { value: "portability", label: "Portability" },
            ]}
          />
          <Select
            label="Deadline"
            value={overdueOnly}
            onChange={(v) => { setOverdueOnly(v); setOffset(0); }}
            options={[
              { value: "", label: "All" },
              { value: "true", label: "Overdue only" },
            ]}
          />
        </FilterBar>

        <DataTable
          rows={data?.rows ?? []}
          rowKey={(row) => row.id}
          onRowClick={(row) => { window.location.href = `/requests/${row.id}`; }}
          empty="No requests match these filters in your regions."
          columns={[
            { key: "ref", header: "Request", render: (r) => r.reference },
            { key: "type", header: "Type", render: (r) => <Pill tone="neutral">{r.request_type}</Pill> },
            { key: "customer", header: "Customer", render: (r) => `${r.customer_reference} · ${r.full_name}` },
            { key: "region", header: "Region", render: (r) => <Pill tone="info">{r.region}</Pill> },
            { key: "status", header: "Status", render: (r) => <Pill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill> },
            {
              key: "due",
              header: "Due",
              render: (r) =>
                isOverdue(r) ? <Pill tone="bad">{String(r.due_at).slice(0, 10)}</Pill> : String(r.due_at).slice(0, 10),
            },
          ]}
        />

        <div className="pager">
          <span className="muted">{data ? `${data.total} request${data.total === 1 ? "" : "s"}` : "…"}</span>
          <Button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Previous</Button>
          <Button onClick={() => setOffset(offset + limit)} disabled={!data || offset + limit >= data.total}>Next</Button>
        </div>
      </Card>
    </AppShell>
  );
}
