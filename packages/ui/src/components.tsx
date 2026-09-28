"use client";

import type { ChangeEvent, ReactNode } from "react";
import { useSession } from "./session.tsx";

/**
 * The shared component library. A new tool composes these; it does not
 * write its own shell, table, filter bar, form or empty state.
 */

export function AppShell({
  tool,
  links,
  children,
}: {
  tool: string;
  links?: { href: string; label: string }[];
  children: ReactNode;
}) {
  const { principal, loading, loginUrl, error, logout } = useSession();

  if (loading) return <main className="shell"><p className="muted">Loading…</p></main>;

  if (loginUrl) {
    return (
      <main className="shell centered">
        <div className="card narrow">
          <h1>{tool}</h1>
          <p className="muted">You need to sign in with your organisation account.</p>
          <a className="button primary" href={loginUrl}>Sign in with SSO</a>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="shell centered">
        <div className="card narrow error">
          <h1>Something went wrong</h1>
          <p className="muted">{error}</p>
        </div>
      </main>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="topbar-left">
          <strong>{tool}</strong>
          <nav>
            {links?.map((link) => (
              <a key={link.href} href={link.href}>{link.label}</a>
            ))}
          </nav>
        </div>
        <div className="topbar-right">
          <span className="muted">{principal?.name}</span>
          {principal?.roles.map((role) => <Pill key={role} tone="neutral">{role}</Pill>)}
          {principal?.regions.map((region) => <Pill key={region} tone="info">{region}</Pill>)}
          {principal?.groups.includes("region-global") ? <Pill tone="info">all regions</Pill> : null}
          <button className="button" onClick={() => void logout()}>Sign out</button>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "info" | "good" | "warn" | "bad" }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

export function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title ?? actions) ? (
        <div className="card-head">
          {title ? <h2>{title}</h2> : <span />}
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  numeric?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty = "Nothing to show.",
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="muted empty">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((c) => <th key={c.key} className={c.numeric ? "numeric" : undefined}>{c.header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? "clickable" : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(row); } : undefined}
            >
              {columns.map((c) => <td key={c.key} className={c.numeric ? "numeric" : undefined}>{c.render(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="filterbar">{children}</div>;
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)} />
    </label>
  );
}

export function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  rows = 3,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="field grow">
      <span>{label}</span>
      <textarea rows={rows} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

export function DetailList({ items }: { items: { label: string; value: ReactNode; masked?: boolean }[] }) {
  return (
    <dl className="detail-list">
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}{item.masked ? <span className="masked-tag" title="Masked: your role cannot read this field">masked</span> : null}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Banner({ tone, children }: { tone: "info" | "warn" | "bad" | "good"; children: ReactNode }) {
  return <div className={`banner ${tone}`}>{children}</div>;
}

export function Button({
  children,
  onClick,
  variant = "default",
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "default" | "primary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button className={`button ${variant}`} onClick={onClick} disabled={disabled} type={type}>
      {children}
    </button>
  );
}

/** Renders children only if the session holds the permission. The API enforces it regardless. */
export function IfPermitted({ permission, children }: { permission: string; children: ReactNode }) {
  const { can } = useSession();
  return can(permission) ? <>{children}</> : null;
}
