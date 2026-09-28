"use client";

import { AppShell, Banner, Button, Card, DetailList, IfPermitted, Pill, TextArea, useSession } from "@paved/ui";
import { use, useCallback, useEffect, useState } from "react";

interface AccountLock {
  id: string;
  reference: string;
  customer_reference: string;
  full_name: string;
  email: string;
  phone: string;
  city: string;
  country_code: string;
  region: string;
  customer_status: string;
  customer_since: string;
  lock_reason: string;
  channel: string;
  failed_attempts: number;
  last_failed_at: string;
  locked_at: string;
  status: string;
  unlocked_at: string | null;
  unlocked_by: string | null;
  unlock_note: string | null;
  _masked?: string[];
}

const when = (value: string | null) => (value ? String(value).slice(0, 16).replace("T", " ") : "—");

export default function LockDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { api, principal } = useSession();
  const [lock, setLock] = useState<AccountLock>();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();

  const load = useCallback(() => {
    api
      .get<{ lock: AccountLock }>(`/api/locks/${id}`)
      .then((d) => { setLock(d.lock); setError(undefined); })
      .catch((err: Error) => setError(err.message === "forbidden" ? "Your role cannot open this account lock." : err.message));
  }, [api, id]);

  useEffect(() => { if (principal) load(); }, [principal, load]);

  const unlock = async () => {
    try {
      await api.post(`/api/locks/${id}/unlock`, { note });
      setNote("");
      setDone("Account unlocked. Justification and actor are in the audit log.");
      load();
    } catch (err) {
      const message = (err as Error).message;
      setError(message === "already_unlocked" ? "This account has already been unlocked." : message);
    }
  };

  const masked = (field: string) => (lock?._masked ?? []).includes(field);
  const locked = lock?.status === "locked";

  return (
    <AppShell tool="Account unlock" links={[{ href: "/", label: "Locked accounts" }]}>
      <h1>{lock ? `${lock.reference} · ${lock.customer_reference}` : "Account lock"}</h1>
      {error ? <Banner tone="bad">{error}</Banner> : null}
      {done ? <Banner tone="good">{done}</Banner> : null}

      {lock ? (
        <div className="grid-2">
          <Card title="Customer profile">
            <DetailList
              items={[
                { label: "Customer", value: lock.customer_reference },
                { label: "Name", value: lock.full_name, masked: masked("full_name") },
                { label: "Email", value: lock.email, masked: masked("email") },
                { label: "Phone", value: lock.phone, masked: masked("phone") },
                { label: "Location", value: `${lock.city}, ${lock.country_code}` },
                { label: "Region", value: <Pill tone="info">{lock.region}</Pill> },
                { label: "Account status", value: lock.customer_status },
                { label: "Customer since", value: String(lock.customer_since).slice(0, 10) },
              ]}
            />
          </Card>

          <Card title="Lock">
            <DetailList
              items={[
                { label: "Status", value: <Pill tone={locked ? "warn" : "good"}>{lock.status}</Pill> },
                { label: "Failed factor", value: lock.lock_reason.replaceAll("_", " ") },
                { label: "Channel", value: lock.channel },
                { label: "Failed attempts", value: lock.failed_attempts },
                { label: "Last failed attempt", value: when(lock.last_failed_at) },
                { label: "Locked at", value: when(lock.locked_at) },
                { label: "Unlocked", value: lock.unlocked_by ? `${when(lock.unlocked_at)} by ${lock.unlocked_by}` : "—" },
              ]}
            />
            {lock.unlock_note ? <p className="muted" style={{ marginTop: 12 }}>Justification on file: {lock.unlock_note}</p> : null}
          </Card>

          <IfPermitted permission="account_lock:unlock">
            <Card title="Unlock">
              {locked ? (
                <>
                  <p className="muted">A justification of at least 10 characters is required and is stored with the unlock.</p>
                  <TextArea
                    label="Justification"
                    value={note}
                    onChange={setNote}
                    rows={4}
                    placeholder="How was the customer's identity verified, and why is the lock safe to lift?"
                  />
                  <div className="actions">
                    <Button variant="primary" disabled={note.trim().length < 10} onClick={() => void unlock()}>Unlock account</Button>
                  </div>
                </>
              ) : (
                <Banner tone="info">This account is no longer locked.</Banner>
              )}
            </Card>
          </IfPermitted>
        </div>
      ) : null}
    </AppShell>
  );
}
