"use client";

import {
  AppShell, Banner, Button, Card, DataTable, DetailList, IfPermitted, Pill, Select, TextArea, useSession,
} from "@paved/ui";
import { use, useCallback, useEffect, useState } from "react";

interface Customer {
  id: string;
  reference: string;
  full_name: string;
  email: string;
  phone: string;
  date_of_birth: string;
  national_id: string;
  address_line: string;
  city: string;
  country_code: string;
  region: string;
  status: string;
  risk_tier: string;
  created_at: string;
  _masked?: string[];
}

interface Note {
  id: string;
  author_email: string;
  body: string;
  created_at: string;
}

export default function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { api, principal } = useSession();
  const [customer, setCustomer] = useState<Customer>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState<string>();

  const load = useCallback(() => {
    api
      .get<{ customer: Customer; notes: Note[] }>(`/api/customers/${id}`)
      .then((data) => { setCustomer(data.customer); setNotes(data.notes); setError(undefined); })
      .catch((err: Error) => setError(err.message === "forbidden" ? "Your role cannot open this record." : err.message));
  }, [api, id]);

  useEffect(() => { if (principal) load(); }, [principal, load]);

  const patch = async (body: Record<string, string>) => {
    try {
      const data = await api.patch<{ customer: Customer }>(`/api/customers/${id}`, body);
      setCustomer(data.customer);
      setSaved(`Saved ${Object.keys(body).join(", ")} — change recorded in the audit log.`);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const masked = new Set(customer?._masked ?? []);

  return (
    <AppShell tool="Customer data console" links={[{ href: "/", label: "Customers" }, { href: "/audit", label: "Audit" }]}>
      <h1>{customer ? `${customer.reference} · ${customer.full_name}` : "Customer"}</h1>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {saved ? <Banner tone="good">{saved}</Banner> : null}
      {customer ? (
        <div className="grid-2">
          <div>
            <Card title="Record">
              <DetailList
                items={[
                  { label: "Full name", value: customer.full_name, masked: masked.has("full_name") },
                  { label: "Email", value: customer.email, masked: masked.has("email") },
                  { label: "Phone", value: customer.phone, masked: masked.has("phone") },
                  { label: "Date of birth", value: String(customer.date_of_birth).slice(0, 10), masked: masked.has("date_of_birth") },
                  { label: "National ID", value: customer.national_id, masked: masked.has("national_id") },
                  { label: "Address", value: `${customer.address_line}, ${customer.city}`, masked: masked.has("address_line") },
                  { label: "Region", value: <Pill tone="info">{customer.region}</Pill> },
                  { label: "Status", value: <Pill tone={customer.status === "active" ? "good" : "warn"}>{customer.status}</Pill> },
                  { label: "Risk tier", value: <Pill tone={customer.risk_tier === "standard" ? "good" : "warn"}>{customer.risk_tier}</Pill> },
                  { label: "Created", value: String(customer.created_at).slice(0, 10) },
                ]}
              />
            </Card>

            <Card title="Notes">
              <DataTable
                rows={notes}
                rowKey={(n) => n.id}
                empty="No notes yet."
                columns={[
                  { key: "when", header: "When", render: (n) => String(n.created_at).slice(0, 10) },
                  { key: "who", header: "Author", render: (n) => n.author_email },
                  { key: "body", header: "Note", render: (n) => <span style={{ whiteSpace: "normal" }}>{n.body}</span> },
                ]}
              />
              <IfPermitted permission="customer:note:write">
                <div className="filterbar" style={{ marginTop: 12 }}>
                  <TextArea label="Add a note" value={note} onChange={setNote} placeholder="What happened, and what did you do?" />
                  <Button
                    variant="primary"
                    disabled={note.trim().length === 0}
                    onClick={async () => {
                      await api.post(`/api/customers/${id}/notes`, { body: note });
                      setNote("");
                      load();
                    }}
                  >
                    Add note
                  </Button>
                </div>
              </IfPermitted>
            </Card>
          </div>

          <IfPermitted permission="customer:write">
            <Card title="Manage">
              <p className="muted">Every change here is written to the shared audit log with before and after values.</p>
              <div className="filterbar">
                <Select
                  label="Status"
                  value={customer.status}
                  onChange={(v) => void patch({ status: v })}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "suspended", label: "Suspended" },
                    { value: "closed", label: "Closed" },
                  ]}
                />
                <Select
                  label="Risk tier"
                  value={customer.risk_tier}
                  onChange={(v) => void patch({ risk_tier: v })}
                  options={[
                    { value: "standard", label: "Standard" },
                    { value: "enhanced", label: "Enhanced" },
                    { value: "prohibited", label: "Prohibited" },
                  ]}
                />
              </div>
            </Card>
          </IfPermitted>
        </div>
      ) : null}
    </AppShell>
  );
}
