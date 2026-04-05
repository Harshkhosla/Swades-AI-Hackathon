"use client";

import { useEffect, useState } from "react";

const TITLE_TEXT = `
 ██████╗ ███████╗████████╗████████╗███████╗██████╗
 ██╔══██╗██╔════╝╚══██╔══╝╚══██╔══╝██╔════╝██╔══██╗
 ██████╔╝█████╗     ██║      ██║   █████╗  ██████╔╝
 ██╔══██╗██╔══╝     ██║      ██║   ██╔══╝  ██╔══██╗
 ██████╔╝███████╗   ██║      ██║   ███████╗██║  ██║
 ╚═════╝ ╚══════╝   ╚═╝      ╚═╝   ╚══════╝╚═╝  ╚═╝

 ████████╗    ███████╗████████╗ █████╗  ██████╗██╗  ██╗
 ╚══██╔══╝    ██╔════╝╚══██╔══╝██╔══██╗██╔════╝██║ ██╔╝
    ██║       ███████╗   ██║   ███████║██║     █████╔╝
    ██║       ╚════██║   ██║   ██╔══██║██║     ██╔═██╗
    ██║       ███████║   ██║   ██║  ██║╚██████╗██║  ██╗
    ╚═╝       ╚══════╝   ╚═╝   ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝
 `;

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";

interface HealthData {
  status: string;
  timestamp: string;
  services: {
    database: string;
    cache: string;
    storage: string;
    transcription: string;
  };
  config: {
    rateLimit: {
      requests: number;
      window: number;
    };
  };
}

interface StatsData {
  recordings: {
    total: number;
    active: number;
    completed: number;
  };
  chunks: {
    total: number;
    uploaded: number;
    acknowledged: number;
    transcribed: number;
    pendingTranscription: number;
  };
  recentRecordings: Array<{
    id: string;
    status: string;
    totalChunks: number;
    createdAt: string;
  }>;
}

function StatusBadge({ status, label }: { status: string; label: string }) {
  const colors: Record<string, string> = {
    connected: "bg-green-500/20 text-green-400 border-green-500/30",
    enabled: "bg-green-500/20 text-green-400 border-green-500/30",
    ok: "bg-green-500/20 text-green-400 border-green-500/30",
    s3: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    local: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    disconnected: "bg-red-500/20 text-red-400 border-red-500/30",
    unavailable: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    disabled: "bg-gray-500/20 text-gray-400 border-gray-500/30",
    degraded: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  };

  return (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`px-2 py-0.5 text-xs rounded border ${colors[status] || colors.unavailable}`}>
        {status}
      </span>
    </div>
  );
}

function StatCard({ label, value, subtext }: { label: string; value: number | string; subtext?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-muted-foreground">{label}</div>
      {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
    </div>
  );
}

export default function Home() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        const [healthRes, statsRes] = await Promise.all([
          fetch(`${API_URL}/health`),
          fetch(`${API_URL}/stats`),
        ]);

        if (healthRes.ok) {
          setHealth(await healthRes.json());
        }

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          if (statsData.success) {
            setStats(statsData.stats);
          }
        }
      } catch (err) {
        setError("Failed to connect to API");
        console.error("API error:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
    // Refresh every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-2">
      <pre className="overflow-x-auto font-mono text-xs sm:text-sm mb-6">{TITLE_TEXT}</pre>
      
      <div className="grid gap-6">
        {/* API Status */}
        <section className="rounded-lg border p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-lg">System Status</h2>
            {health && (
              <span className={`px-2 py-1 text-xs rounded ${
                health.status === "ok" 
                  ? "bg-green-500/20 text-green-400" 
                  : "bg-yellow-500/20 text-yellow-400"
              }`}>
                {health.status === "ok" ? "● All Systems Operational" : "● Degraded"}
              </span>
            )}
          </div>

          {loading && !health && (
            <div className="text-center py-4 text-muted-foreground">Loading...</div>
          )}

          {error && (
            <div className="text-center py-4 text-red-400">
              ● Disconnected - {error}
            </div>
          )}

          {health && (
            <div className="grid sm:grid-cols-2 gap-x-8 divide-y sm:divide-y-0">
              <div>
                <StatusBadge status={health.services.database} label="Database" />
                <StatusBadge status={health.services.cache} label="Cache (Redis)" />
              </div>
              <div>
                <StatusBadge status={health.services.storage} label="Storage" />
                <StatusBadge status={health.services.transcription} label="Transcription (Whisper)" />
              </div>
            </div>
          )}

          {health && (
            <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
              Last updated: {new Date(health.timestamp).toLocaleTimeString()}
              {" • "}
              Rate limit: {health.config.rateLimit.requests} req/{health.config.rateLimit.window}s
            </div>
          )}
        </section>

        {/* Statistics */}
        {stats && (
          <>
            <section className="rounded-lg border p-4">
              <h2 className="font-semibold text-lg mb-4">Recording Statistics</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Total Recordings" value={stats.recordings.total} />
                <StatCard label="Active" value={stats.recordings.active} />
                <StatCard label="Completed" value={stats.recordings.completed} />
                <StatCard label="Total Chunks" value={stats.chunks.total} />
              </div>
            </section>

            <section className="rounded-lg border p-4">
              <h2 className="font-semibold text-lg mb-4">Transcription Status</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <StatCard 
                  label="Transcribed" 
                  value={stats.chunks.transcribed}
                  subtext={`${stats.chunks.total > 0 ? Math.round((stats.chunks.transcribed / stats.chunks.total) * 100) : 0}% complete`}
                />
                <StatCard label="Pending" value={stats.chunks.pendingTranscription} />
                <StatCard label="Acknowledged" value={stats.chunks.acknowledged} />
              </div>
            </section>

            {stats.recentRecordings.length > 0 && (
              <section className="rounded-lg border p-4">
                <h2 className="font-semibold text-lg mb-4">Recent Recordings</h2>
                <div className="space-y-2">
                  {stats.recentRecordings.map((rec) => (
                    <div 
                      key={rec.id} 
                      className="flex items-center justify-between py-2 px-3 rounded bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-2 h-2 rounded-full ${
                          rec.status === "completed" ? "bg-green-500" : 
                          rec.status === "active" ? "bg-blue-500 animate-pulse" : "bg-gray-500"
                        }`} />
                        <code className="text-xs text-muted-foreground">{rec.id.slice(0, 8)}...</code>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-muted-foreground">{rec.totalChunks} chunks</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(rec.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
