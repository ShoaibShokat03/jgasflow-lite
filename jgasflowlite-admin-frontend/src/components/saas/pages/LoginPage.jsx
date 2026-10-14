// src/components/saas/pages/LoginPage.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, User, ShieldCheck } from "lucide-react";
import { saasAuthApi } from "../../../api/saasApi";
import { errMsg } from "../../../api/saasClient";
import { storeSession, clearAuth, landingPath } from "../../../utils/saasAuth";
import BRANDING from "../../../constants/branding";
import { inputCls, BtnPrimary } from "../common";

const LoginPage = () => {
  const navigate = useNavigate();
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await saasAuthApi.login(login.trim(), password);
      if (!data?.user?.is_super) {
        // A shop login: end that session at once, it has no business here.
        storeSession(data.token, null);
        await saasAuthApi.logout().catch(() => {});
        clearAuth();
        setError("This is a shop login. Use it in the JGasFlow app, not in the console.");
        return;
      }
      storeSession(data.token, { id: data.user.id, name: data.user.name, email: data.user.email, role: data.user.role, modules: data.user.admin_perms ?? null });
      // The console profile says exactly which screens this admin may open.
      const me = await saasAuthApi.me();
      storeSession(null, { id: me.id, name: me.name, email: data.user.email, role: me.role, modules: me.modules });
      navigate(landingPath(), { replace: true });
    } catch (err) {
      clearAuth();
      setError(errMsg(err, "Could not sign in. Check your login and password."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-navy-900 via-navy-800 to-navy-700">
      <div className="min-h-full flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <img src={BRANDING.logo.main} alt={BRANDING.name} className="mx-auto w-16 h-16 object-contain mb-3" />
            <h1 className="text-2xl font-bold text-white">
              {BRANDING.name} <span className="text-primary-400">{BRANDING.tagline}</span>
            </h1>
            <p className="text-sm text-navy-200 mt-1">Platform administration</p>
          </div>

          <form onSubmit={submit} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-800 dark:text-gray-100">
              <ShieldCheck className="w-4 h-4 text-primary-600" /> Sign in
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Email or phone</span>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  autoComplete="username"
                  required
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  className={`${inputCls} pl-9`}
                  placeholder="admin@example.com"
                />
              </div>
            </label>

            <label className="block">
              <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">Password</span>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pl-9 pr-10`}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
                  title={show ? "Hide password" : "Show password"}
                >
                  {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </label>

            <BtnPrimary type="submit" disabled={loading} className="w-full py-2.5">
              {loading ? "Signing in..." : "Sign in"}
            </BtnPrimary>
          </form>

          <p className="text-center text-[11px] text-navy-200 mt-5">{BRANDING.support}</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
