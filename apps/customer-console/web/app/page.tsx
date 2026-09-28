"use client";

import {
  AppShell, Banner, Button, Card, DataTable, FilterBar, Pill, Select, TextInput, useSession,
} from "@paved/ui";
import { useEffect, useState } from "react";

interface Customer {
  id: string;
  reference: string;
  full_name: string;
  email: string;
  region: string;
  country_code: string;
  status: string;
  risk_tier: string;
  _masked?: string[];
}

const RISK_TONE: Record<string, "good" | "warn" | "bad"> = {
  standard: "good",
  enhanced: "warn",
  prohibited: "bad",
};

export default function CustomersPage() {
  const { api, principal } = useSession();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [riskTier, setRiskTier] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ rows: Customer[]; total: number }>();
  const [error, setError] = useState<string>();
  const limit = 25;

  useEffect(() => {
    if (!principal) return;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (riskTier) params.set("riskTier", riskTier);
    api
      .get<{ rows: Customer[]; total: number }>(`/api/customers?${params.toString()}`)
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, [api, principal, search, status, riskTier, offset]);

  const masked = data?.rows[0]?._masked?.length ? data.rows[0]._masked : undefined;

  return (
    <AppShell tool="Customer data console" links={[{ href: "/", label: "Customers" }, { href: "/audit", label: "Audit" }]}>
      <h1>Customers</h1>
      <p className="muted">
        Synthetic data. Your directory groups decide which regions and which fields you can see.
      </p>

      {masked ? (
        <Banner tone="warn">
          Personal fields are masked for your role ({masked.join(", ")}). Masking is applied on the server.
        </Banner>
      ) : null}
      {error ? <Banner tone="bad">{error}</Banner> : null}

      <Card>
        <FilterBar>
          <TextInput label="Search" value={search} onChange={(v) => { setSearch(v); setOffset(0); }} placeholder="Name, email or reference" />
          <Select
            label="Status"
            value={status}
            onChange={(v) => { setStatus(v); setOffset(0); }}
            options={[
              { value: "", label: "Any" },
              { value: "active", label: "Active" },
              { value: "suspended", label: "Suspended" },
              { value: "closed", label: "Closed" },
            ]}
          />
          <Select
            label="Risk tier"
            value={riskTier}
            onChange={(v) => { setRiskTier(v); setOffset(0); }}
            options={[
              { value: "", label: "Any" },
              { value: "standard", label: "Standard" },
              { value: "enhanced", label: "Enhanced" },
              { value: "prohibited", label: "Prohibited" },
            ]}
          />
        </FilterBar>

        <DataTable
          rows={data?.rows ?? []}
          rowKey={(row) => row.id}
          onRowClick={(row) => { window.location.href = `/customers/${row.id}`; }}
          empty="No customers match these filters in your regions."
          columns={[
            { key: "reference", header: "Reference", render: (r) => r.reference },
            { key: "name", header: "Name", render: (r) => r.full_name },
            { key: "email", header: "Email", render: (r) => r.email },
            { key: "region", header: "Region", render: (r) => <Pill tone="info">{r.region}</Pill> },
            { key: "country", header: "Country", render: (r) => r.country_code },
            { key: "status", header: "Status", render: (r) => <Pill tone={r.status === "active" ? "good" : "warn"}>{r.status}</Pill> },
            { key: "risk", header: "Risk tier", render: (r) => <Pill tone={RISK_TONE[r.risk_tier] ?? "neutral"}>{r.risk_tier}</Pill> },
          ]}
        />

        <div className="pager">
          <span className="muted">
            {data ? `${offset + 1}–${Math.min(offset + limit, data.total)} of ${data.total}` : "…"}
          </span>
          <Button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Previous</Button>
          <Button onClick={() => setOffset(offset + limit)} disabled={!data || offset + limit >= data.total}>Next</Button>
        </div>
      </Card>
    </AppShell>
  );
}
