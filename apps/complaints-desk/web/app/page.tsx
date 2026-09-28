"use client";

import {
  AppShell,
  Banner,
  Button,
  Card,
  DataTable,
  FilterBar,
  IfPermitted,
  Pill,
  Select,
  TextArea,
  TextInput,
  useSession,
} from "@paved/ui";
import { useEffect, useState } from "react";

interface Complaint {
  id: string;
  reference: string;
  customer_reference: string;
  full_name: string;
  region: string;
  category: string;
  channel: string;
  status: string;
  opened_at: string;
  due_at: string;
}

const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "info" | "neutral"> = {
  open: "warn",
  investigating: "info",
  upheld: "good",
  rejected: "bad",
  withdrawn: "neutral",
};

const isBreached = (row: Complaint) =>
  (row.status === "open" || row.status === "investigating") && new Date(row.due_at) < new Date();

export default function ComplaintsPage() {
  const { api, principal } = useSession();
  const [status, setStatus] = useState("open");
  const [category, setCategory] = useState("");
  const [breachedOnly, setBreachedOnly] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ rows: Complaint[]; total: number }>();
  const [stats, setStats] = useState<{ status: string; count: number; breached: number }[]>([]);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [reload, setReload] = useState(0);
  const [form, setForm] = useState({ customerReference: "", category: "billing", channel: "phone", summary: "" });
  const limit = 25;

  useEffect(() => {
    if (!principal) return;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) params.set("status", status);
    if (category) params.set("category", category);
    if (breachedOnly) params.set("breachedOnly", "true");
    api
      .get<{ rows: Complaint[]; total: number }>(`/api/complaints?${params.toString()}`)
      .then(setData)
      .catch((e: Error) => setError(e.message));
    api
      .get<{ stats: { status: string; count: number; breached: number }[] }>("/api/stats")
      .then((d) => setStats(d.stats))
      .catch(() => undefined);
  }, [api, principal, status, category, breachedOnly, offset, reload]);

  const log = async () => {
    try {
      const created = await api.post<{ complaint: Complaint }>("/api/complaints", form);
      setForm({ ...form, customerReference: "", summary: "" });
      setError(undefined);
      setDone(`Logged ${created.complaint.reference}. Eight-week clock started and the entry is in the audit log.`);
      setReload(reload + 1);
    } catch (err) {
      const message = (err as Error).message;
      setError(message === "customer_not_found" ? "No such customer in your regions." : message);
    }
  };

  return (
    <AppShell tool="Complaints desk" links={[{ href: "/", label: "Complaints" }]}>
      <h1>Complaint queue</h1>
      <p className="muted">
        Soonest final-response deadline first. Regions, PII masking and who may close a
        complaint come from the platform — this tool only declares which permission each
        route needs.
      </p>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {done ? <Banner tone="good">{done}</Banner> : null}

      <div className="stats">
        {stats.map((s) => (
          <div className="stat" key={s.status}>
            <b>{s.count}</b>
            <span>
              {s.status}
              {s.breached > 0 ? ` · ${s.breached} breached` : ""}
            </span>
          </div>
        ))}
      </div>

      <IfPermitted permission="complaint:log">
        <Card title="Log a complaint">
          <FilterBar>
            <TextInput
              label="Customer"
              value={form.customerReference}
              onChange={(v) => setForm({ ...form, customerReference: v })}
              placeholder="CUS-10000"
            />
            <Select
              label="Category"
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
              options={[
                { value: "billing", label: "Billing" },
                { value: "service", label: "Service" },
                { value: "access", label: "Access" },
                { value: "fees", label: "Fees" },
                { value: "other", label: "Other" },
              ]}
            />
            <Select
              label="Channel"
              value={form.channel}
              onChange={(v) => setForm({ ...form, channel: v })}
              options={[
                { value: "phone", label: "Phone" },
                { value: "email", label: "Email" },
                { value: "branch", label: "Branch" },
                { value: "web", label: "Web" },
              ]}
            />
          </FilterBar>
          <TextArea
            label="What the customer said"
            value={form.summary}
            onChange={(v) => setForm({ ...form, summary: v })}
            rows={3}
            placeholder="In the customer's own terms, at least 10 characters."
          />
          <div className="actions">
            <Button
              variant="primary"
              disabled={form.summary.trim().length < 10 || form.customerReference.trim().length < 3}
              onClick={() => void log()}
            >
              Log complaint
            </Button>
          </div>
        </Card>
      </IfPermitted>

      <Card>
        <FilterBar>
          <Select
            label="Status"
            value={status}
            onChange={(v) => { setStatus(v); setOffset(0); }}
            options={[
              { value: "", label: "Any" },
              { value: "open", label: "Open" },
              { value: "investigating", label: "Investigating" },
              { value: "upheld", label: "Upheld" },
              { value: "rejected", label: "Rejected" },
              { value: "withdrawn", label: "Withdrawn" },
            ]}
          />
          <Select
            label="Category"
            value={category}
            onChange={(v) => { setCategory(v); setOffset(0); }}
            options={[
              { value: "", label: "Any" },
              { value: "billing", label: "Billing" },
              { value: "service", label: "Service" },
              { value: "access", label: "Access" },
              { value: "fees", label: "Fees" },
              { value: "other", label: "Other" },
            ]}
          />
          <Select
            label="Deadline"
            value={breachedOnly}
            onChange={(v) => { setBreachedOnly(v); setOffset(0); }}
            options={[
              { value: "", label: "All" },
              { value: "true", label: "Breached only" },
            ]}
          />
        </FilterBar>

        <DataTable
          rows={data?.rows ?? []}
          rowKey={(row) => row.id}
          onRowClick={(row) => { window.location.href = `/complaints/${row.id}`; }}
          empty="No complaints match these filters in your regions."
          columns={[
            { key: "ref", header: "Complaint", render: (r) => r.reference },
            { key: "category", header: "Category", render: (r) => <Pill tone="neutral">{r.category}</Pill> },
            { key: "customer", header: "Customer", render: (r) => `${r.customer_reference} · ${r.full_name}` },
            { key: "region", header: "Region", render: (r) => <Pill tone="info">{r.region}</Pill> },
            { key: "status", header: "Status", render: (r) => <Pill tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Pill> },
            {
              key: "due",
              header: "Final response due",
              render: (r) =>
                isBreached(r) ? <Pill tone="bad">{String(r.due_at).slice(0, 10)}</Pill> : String(r.due_at).slice(0, 10),
            },
          ]}
        />

        <div className="pager">
          <span className="muted">{data ? `${data.total} complaint${data.total === 1 ? "" : "s"}` : "…"}</span>
          <Button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Previous</Button>
          <Button onClick={() => setOffset(offset + limit)} disabled={!data || offset + limit >= data.total}>Next</Button>
        </div>
      </Card>
    </AppShell>
  );
}
