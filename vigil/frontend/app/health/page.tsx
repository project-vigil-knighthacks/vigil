"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api/client";

interface HealthResponse {
  ok: boolean;
}

export default function HealthPage() {
  const [data, setData] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<HealthResponse>("/api/health")
      .then(setData)
      .catch((err: unknown) => {
        if (err instanceof ApiError) {
          setError(`API error ${err.status}: ${err.message}`);
        } else {
          setError(err instanceof Error ? err.message : "Unknown error");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    // simple health check page to verify backend connectivity and CORS setup
    // embeded Tailwind styles by Claude just for a quick UI draft idea lol, - Zayne
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 font-mono dark:bg-black">
      <div className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-8 shadow dark:border-zinc-800 dark:bg-zinc-950">
        <h1 className="mb-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          Vigil: Backend Health Check
        </h1>

        {loading && (
          <p className="text-zinc-500">Checking backend...</p>
        )}

        {error && (
          <div className="rounded bg-red-50 p-4 text-sm text-red-700 dark:bg-red-950 dark:text-red-300">
            <p className="font-medium">Connection failed</p>
            <p className="mt-1">{error}</p>
          </div>
        )}

        {data && (
          <div className="rounded bg-green-50 p-4 text-sm dark:bg-green-950">
            <p className="font-medium text-green-700 dark:text-green-300">
              Backend is reachable!
            </p>
            <pre className="mt-2 text-xs text-green-600 dark:text-green-400">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}

        <p className="mt-4 text-xs text-zinc-400">
          API Base: {process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000"}
        </p>
      </div>
    </div>
  );
}