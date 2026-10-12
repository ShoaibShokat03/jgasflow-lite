// src/components/saas/pages/LoginPage.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { saasAuthApi } from "../../../api/saasApi";
import { storeTokens, landingPath } from "../../../utils/saasAuth";
import BRANDING from "../../../constants/branding";
import { inputCls, BtnPrimary } from "../common";

const LoginPage = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await saasAuthApi.login(email.trim(), password);
      storeTokens(data.access_token, data.refresh_token, data.admin);
      // Read AFTER the profile is stored — a scoped admin may not have /dashboard.
      navigate(landingPath(), { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message || "Login failed. Check your credentials.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-primary-50 via-white to-primary-100 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      <div className="min-h-full flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Brand */}
        <div className="text-center mb-6">
          <img
            src={BRANDING.logo.main}
            alt={BRANDING.name}
            className="mx-auto w-14 h-14 rounded-xl object-contain mb-3"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {BRANDING.name}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {BRANDING.tagline} — sign in
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 space-y-4"
        >
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 px-3 py-2 text-sm text-red-600 dark:text-red-300">
              {error}
            </div>
          )}

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Email
            </span>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                required
                autoFocus
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@jdent.com"
                className={`${inputCls} pl-9`}
              />
            </div>
          </label>

          <label className="block">
            <span className="block text-xs font-semibold text-gray-600 dark:text-gray-300 mb-1">
              Password
            </span>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`${inputCls} pl-9 pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </label>

          <BtnPrimary type="submit" disabled={loading} className="w-full justify-center">
            {loading ? "Signing in…" : "Sign in"}
          </BtnPrimary>

          <p className="text-center text-[11px] text-gray-400">
            Platform administrators only. Clinic staff sign in from their own
            clinic portal.
          </p>
        </form>
      </div>
      </div>
    </div>
  );
};

export default LoginPage;
