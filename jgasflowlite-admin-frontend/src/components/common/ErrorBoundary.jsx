// src/components/common/ErrorBoundary.jsx
// Catches a render crash so the admin panel shows a way out instead of a
// blank white page.
//
// Without this, ANY thrown error unmounts the whole React tree and leaves an
// empty document — the only clue is in the browser console, which nobody has
// open. A crash right as a session expires looks exactly like a login bug,
// which is how the missing `can` import in PlansPage got reported as one.
//
// When the session is already gone it goes straight to the login page; with
// a valid session it shows the card, because auto-redirecting a real bug
// would hide it and could loop.
//
// `key`ed by pathname at the call site, so navigating elsewhere clears the
// error and the app recovers without a reload.
import React from "react";
import { AlertTriangle, RefreshCw, LogIn } from "lucide-react";
import { clearAuth, isAuthenticated } from "../../utils/saasAuth";
import { BASE_URL } from "../../config/app";

const toLogin = () => {
  clearAuth();
  window.location.href = `${BASE_URL}/login`;
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Nothing collects these yet; the console is still the only record.
    console.error("Admin panel crashed:", error, info?.componentStack);
    // Session already gone — nothing on this screen is worth showing, so go
    // straight to login. With a valid session it is a real bug, and
    // auto-redirecting would hide it (and could loop), so the card stands.
    if (!isAuthenticated()) toLogin();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 text-center">
          <span className="mx-auto mb-3 flex w-10 h-10 items-center justify-center rounded-full bg-red-50 dark:bg-red-900/20">
            <AlertTriangle className="w-5 h-5 text-red-600" />
          </span>
          <h1 className="text-base font-bold text-gray-800 dark:text-gray-100">
            This screen didn't load
          </h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Something went wrong while rendering it. Reloading usually fixes it;
            if it keeps happening, sign in again.
          </p>
          <p className="mt-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 px-3 py-2 text-left text-[11px] font-mono text-gray-500 dark:text-gray-400 break-words">
            {String(error?.message || error)}
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm font-semibold px-4 py-2 transition"
            >
              <RefreshCw className="w-4 h-4" /> Reload
            </button>
            <button
              onClick={toLogin}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 text-sm font-semibold px-4 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
            >
              <LogIn className="w-4 h-4" /> Sign in again
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
