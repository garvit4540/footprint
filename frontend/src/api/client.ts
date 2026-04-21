export type Investment = {
  id: string;
  name: string;
  type: string;
  purchase_date?: string | null;
  purchase_value: number;
  current_value: number;
  currency: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
};

export type HistoryPt = { date: string; value: number };
export type InvestmentSeries = {
  id: string;
  name: string;
  type: string;
  currency: string;
  points: HistoryPt[];
};

export type Summary = {
  total_invested: number;
  total_current: number;
  total_gain: number;
  gain_pct: number;
  by_type: { type: string; invested: number; current: number; count: number }[];
  history: HistoryPt[];
  series: InvestmentSeries[];
};

export type Weight = {
  id: number;
  value_kg: number;
  recorded_on: string;
  notes?: string | null;
  created_at: string;
};

export type HistoryPoint = { value: number; recorded_at: string };

export type User = {
  id: string;
  email: string;
  role: "admin" | "member";
  display_name?: string | null;
  height_cm?: number | null;
  created_at: string;
};

export type Blog = {
  id: string;
  title: string;
  body: string;
  author_id?: string | null;
  author?: string | null;
  tags: string[];
  roles: string[];
  created_at: string;
  updated_at: string;
};

export type Tag = { id: string; name: string };
export type TagUsage = { id: string; name: string; blogs: number; users: number };

export type LoanPayment = {
  id: number;
  loan_id: string;
  amount: number;
  paid_on: string;
  notes?: string | null;
  created_at: string;
};

export type Loan = {
  id: string;
  counterparty: string;
  direction: "borrowed" | "lent";
  principal: number;
  currency: string;
  opened_on?: string | null;
  notes?: string | null;
  paid: number;
  outstanding: number;
  payments: LoanPayment[];
  created_at: string;
  updated_at: string;
};

export type Site = {
  title: string;
  tagline: string;
  about: string;
  updated_at: string;
};

export type ApiError = { status: number; message: string };

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: "include",
    ...opts,
    headers: {
      "Content-Type": "application/json",
      "X-Requested-With": "fetch",
      ...(opts.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      msg = (await res.text()) || msg;
    }
    const err: ApiError = { status: res.status, message: msg };
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  list: () => req<Investment[]>("/api/investments"),
  get: (id: string) => req<Investment>(`/api/investments/${id}`),
  create: (body: Partial<Investment>) =>
    req<Investment>("/api/investments", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Investment>) =>
    req<Investment>(`/api/investments/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) => req<void>(`/api/investments/${id}`, { method: "DELETE" }),
  history: (id: string) => req<HistoryPoint[]>(`/api/investments/${id}/history`),
  summary: () => req<Summary>("/api/summary"),
};

export const authApi = {
  me: () => req<User | null>("/api/auth/me"),
  login: (email: string, password: string) =>
    req<User>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  signup: (email: string, password: string, display_name?: string) =>
    req<User>("/api/auth/signup", { method: "POST", body: JSON.stringify({ email, password, display_name }) }),
  logout: () => req<void>("/api/auth/logout", { method: "POST" }),
  updateMe: (body: Partial<Pick<User, "display_name" | "height_cm">>) =>
    req<User>("/api/auth/me", { method: "PATCH", body: JSON.stringify(body) }),
};

export async function uploadImage(file: File): Promise<{ url: string }> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("/api/uploads", {
    method: "POST",
    credentials: "include",
    headers: { "X-Requested-With": "fetch" },
    body: fd,
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try { const b = await res.json(); if (b?.error) msg = b.error; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const blogsApi = {
  list: () => req<Blog[]>("/api/blogs"),
  get: (id: string) => req<Blog>(`/api/blogs/${id}`),
  create: (body: Partial<Blog>) =>
    req<Blog>("/api/blogs", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Blog>) =>
    req<Blog>(`/api/blogs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) => req<void>(`/api/blogs/${id}`, { method: "DELETE" }),
  tags: () => req<Tag[]>("/api/tags"),
};

export const tagsApi = {
  usage: () => req<TagUsage[]>("/api/tags/usage"),
  remove: (id: string) => req<void>(`/api/tags/${id}`, { method: "DELETE" }),
};

export const weightsApi = {
  list: () => req<Weight[]>("/api/weights"),
  add: (body: { value_kg: number; recorded_on?: string | null; notes?: string | null }) =>
    req<Weight>("/api/weights", { method: "POST", body: JSON.stringify(body) }),
  remove: (id: number) => req<void>(`/api/weights/${id}`, { method: "DELETE" }),
};

export const loansApi = {
  list: () => req<Loan[]>("/api/loans"),
  get: (id: string) => req<Loan>(`/api/loans/${id}`),
  create: (body: Partial<Loan>) =>
    req<Loan>("/api/loans", { method: "POST", body: JSON.stringify(body) }),
  update: (id: string, body: Partial<Loan>) =>
    req<Loan>(`/api/loans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  remove: (id: string) => req<void>(`/api/loans/${id}`, { method: "DELETE" }),
  addPayment: (id: string, body: { amount: number; paid_on?: string | null; notes?: string | null }) =>
    req<LoanPayment>(`/api/loans/${id}/payments`, { method: "POST", body: JSON.stringify(body) }),
  removePayment: (id: string, pid: number) =>
    req<void>(`/api/loans/${id}/payments/${pid}`, { method: "DELETE" }),
};

export const siteApi = {
  get: () => req<Site>("/api/site"),
  update: (body: Partial<Pick<Site, "title" | "tagline" | "about">>) =>
    req<Site>("/api/site", { method: "PATCH", body: JSON.stringify(body) }),
};

export const usersApi = {
  list: () => req<User[]>("/api/users"),
  create: (body: { email: string; password: string; role: string; display_name?: string }) =>
    req<User>("/api/users", { method: "POST", body: JSON.stringify(body) }),
  remove: (id: string) => req<void>(`/api/users/${id}`, { method: "DELETE" }),
  getTags: (id: string) => req<string[]>(`/api/users/${id}/tags`),
  setTags: (id: string, tags: string[]) =>
    req<string[]>(`/api/users/${id}/tags`, { method: "PUT", body: JSON.stringify({ tags }) }),
};

export const TYPES = [
  "MUTUAL_FUND",
  "STOCK",
  "INSURANCE",
  "FD",
  "CRYPTO",
  "REAL_ESTATE",
  "BOND",
  "OTHER",
];

export const ROLES = ["public", "member", "admin"] as const;

export const fmt = (n: number, ccy = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: ccy, maximumFractionDigits: 0 }).format(n);
