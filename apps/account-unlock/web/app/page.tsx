"use client";

import { AppShell, Banner, Button, Card, DataTable, FilterBar, Pill, Select, useSession } from "@paved/ui";
import { useEffect, useState } from "react";

interface AccountLock {
  id: string;
  reference: string;
  customer_reference: string;
  full_name: string;
  region: string;
  lock_reason: string;
  channel: string;
  failed_attempts: number;
  locked_at: string;
  status: string;
}

const REASON_LABEL: Record<string, string> = {
  password: "Password",
  one_time_code: "One-time code",
  security_question: "Security question",
};

export default function LocksPage() {
  const { api, principal } = useSession();
  const [status, setStatus] = useState("locked");
  const [reason, setReason] = useState("");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ rows: AccountLock[]; total: number }>();
  const [error, setError] = useState<string>();
  const limit = 25;

  useEffect(() => {
    if (!principal) return;
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (status) params.set("status", status);
    if (reason) params.set("reason", reason);
    api
      .get<{ rows: AccountLock[]; total: number }>(`/api/locks?${params.toString()}`)
      .then((d) => { setData(d); setError(undefined); })
      .catch((e: Error) => setError(e.message === "forbidden" ? "Your role cannot view locked accounts." : e.message));
  }, [api, principal, status, reason, offset]);

  return (
    <AppShell tool="Account unlock" links={[{ href: "/", label: "Locked accounts" }]}>
      <h1>Locked accounts</h1>
      <p className="muted">
        Accounts locked after repeated failed sign-in attempts, longest-locked first. Only
        compliance admins can lift a lock, and every view and unlock is in the audit log.
      </p>
      {error ? <Banner tone="bad">{error}</Banner> : null}

      <Card>
        <FilterBar>
          <Select
            label="Status"
            value={status}
            onChange={(v) => { setStatus(v); setOffset(0); }}
            options={[
              { value: "", label: "Any" },
              { value: "locked", label: "Locked" },
              { value: "unlocked", label: "Unlocked" },
            ]}
          />
          <Select
            label="Failed factor"
            value={reason}
            onChange={(v) => { setReason(v); setOffset(0); }}
            options={[
              { value: "", label: "Any" },
              { value: "password", label: "Password" },
              { value: "one_time_code", label: "One-time code" },
              { value: "security_question", label: "Security question" },
            ]}
          />
        </FilterBar>

        <DataTable
          rows={data?.rows ?? []}
          rowKey={(row) => row.id}
          onRowClick={(row) => { window.location.href = `/locks/${row.id}`; }}
          empty="No locked accounts match these filters in your regions."
          columns={[
            { key: "ref", header: "Lock", render: (r) => r.reference },
            { key: "customer", header: "Customer", render: (r) => `${r.customer_reference} · ${r.full_name}` },
            { key: "region", header: "Region", render: (r) => <Pill tone="info">{r.region}</Pill> },
            { key: "reason", header: "Failed factor", render: (r) => <Pill tone="neutral">{REASON_LABEL[r.lock_reason] ?? r.lock_reason}</Pill> },
            { key: "attempts", header: "Attempts", render: (r) => r.failed_attempts },
            { key: "channel", header: "Channel", render: (r) => r.channel },
            { key: "locked", header: "Locked at", render: (r) => String(r.locked_at).slice(0, 16).replace("T", " ") },
            { key: "status", header: "Status", render: (r) => <Pill tone={r.status === "locked" ? "warn" : "good"}>{r.status}</Pill> },
          ]}
        />

        <div className="pager">
          <span className="muted">{data ? `${data.total} lock${data.total === 1 ? "" : "s"}` : "…"}</span>
          <Button onClick={() => setOffset(Math.max(0, offset - limit))} disabled={offset === 0}>Previous</Button>
          <Button onClick={() => setOffset(offset + limit)} disabled={!data || offset + limit >= data.total}>Next</Button>
        </div>
      </Card>
    </AppShell>
  );
}
