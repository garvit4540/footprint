import { Link, NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { ReactNode } from "react";
import Dashboard from "./pages/Dashboard";
import Investments from "./pages/Investments";
import InvestmentDetail from "./pages/InvestmentDetail";
import Blogs from "./pages/Blogs";
import BlogDetail from "./pages/BlogDetail";
import BlogEditor from "./pages/BlogEditor";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Users from "./pages/Users";
import Tags from "./pages/Tags";
import Loans from "./pages/Loans";
import WeightPage from "./pages/Weight";
import Settings from "./pages/Settings";
import { useAuth } from "./AuthContext";

function Protected({ children, admin }: { children: ReactNode; admin?: boolean }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) return <div className="p-10 text-ink-400">Loading…</div>;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (admin && user.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}

function TopBar() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "admin";
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `px-2.5 py-1.5 rounded-md text-sm transition-colors ${
      isActive ? "text-white bg-ink-800" : "text-ink-300 hover:text-white hover:bg-ink-800/60"
    }`;
  return (
    <header className="sticky top-0 z-30 border-b border-ink-800/80 bg-ink-950/80 backdrop-blur">
      <div className="mx-auto max-w-5xl flex items-center gap-1 px-5 h-14">
        <Link to="/" className="flex items-center gap-2 mr-4">
          <span className="w-2 h-2 rounded-full bg-gradient-to-tr from-brand-400 to-accent-pink shadow-glow" />
          <span className="font-semibold tracking-tight text-white">Home</span>
        </Link>
        {isAdmin && <NavLink to="/dashboard" className={linkCls}>Dashboard</NavLink>}
        {isAdmin && <NavLink to="/investments" className={linkCls}>Investments</NavLink>}
        {isAdmin && <NavLink to="/loans" className={linkCls}>Loans</NavLink>}
        {isAdmin && <NavLink to="/weight" className={linkCls}>Weight</NavLink>}
        {isAdmin && <NavLink to="/users" className={linkCls}>Users</NavLink>}
        {isAdmin && <NavLink to="/tags" className={linkCls}>Tags</NavLink>}
        {isAdmin && <NavLink to="/settings" className={linkCls}>Settings</NavLink>}
        <div className="flex-1" />
        {user ? (
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 text-sm text-ink-300">
              <span>{user.display_name || user.email}</span>
              <span className={`role role-${user.role}`}>{user.role}</span>
            </div>
            <button className="btn-ghost" onClick={logout}>Sign out</button>
          </div>
        ) : (
          <NavLink to="/login" className="btn">Sign in</NavLink>
        )}
      </div>
    </header>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-3xl px-5 pb-24 pt-8 animate-fade-in">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />

          <Route path="/" element={<Blogs />} />
          <Route path="/blogs/new" element={<Protected admin><BlogEditor /></Protected>} />
          <Route path="/blogs/:id" element={<BlogDetail />} />
          <Route path="/blogs/:id/edit" element={<Protected admin><BlogEditor /></Protected>} />

          <Route path="/dashboard" element={<Protected admin><Dashboard /></Protected>} />
          <Route path="/investments" element={<Protected admin><Investments /></Protected>} />
          <Route path="/investments/:id" element={<Protected admin><InvestmentDetail /></Protected>} />
          <Route path="/loans" element={<Protected admin><Loans /></Protected>} />
          <Route path="/weight" element={<Protected admin><WeightPage /></Protected>} />
          <Route path="/users" element={<Protected admin><Users /></Protected>} />
          <Route path="/tags" element={<Protected admin><Tags /></Protected>} />
          <Route path="/settings" element={<Protected admin><Settings /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
