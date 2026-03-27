'use client';

import { useState } from 'react';
import type { PipelineResult, ScoredPatient } from '@/lib/types';

// ─── helper components ───────────────────────────────────────────────────────

function RiskBadge({ score }: { score: number }) {
  if (score >= 4)
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-700 text-white">
        HIGH {score}
      </span>
    );
  if (score >= 2)
    return (
      <span className="px-2 py-0.5 rounded text-xs font-bold bg-yellow-600 text-white">
        MED {score}
      </span>
    );
  return (
    <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-700 text-white">
      LOW {score}
    </span>
  );
}

function AlertList({
  title,
  ids,
  color,
}: {
  title: string;
  ids: string[];
  color: string;
}) {
  return (
    <div className={`rounded-lg border ${color} p-4`}>
      <h3 className="font-bold mb-2 text-sm uppercase tracking-wide">
        {title} <span className="font-normal">({ids.length})</span>
      </h3>
      {ids.length === 0 ? (
        <p className="text-gray-400 text-xs italic">None</p>
      ) : (
        <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
          {ids.map((id) => (
            <span
              key={id}
              className="px-2 py-0.5 bg-gray-800 rounded text-xs font-mono"
            >
              {id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function PatientTable({ patients }: { patients: ScoredPatient[] }) {
  const [filter, setFilter] = useState<'ALL' | 'HIGH' | 'MED' | 'LOW'>('ALL');

  const filtered = patients.filter((p) => {
    if (filter === 'HIGH') return p.totalScore >= 4;
    if (filter === 'MED') return p.totalScore >= 2 && p.totalScore < 4;
    if (filter === 'LOW') return p.totalScore < 2;
    return true;
  });

  return (
    <div>
      <div className="flex gap-2 mb-3 items-center">
        <span className="text-xs text-gray-400">Filter:</span>
        {(['ALL', 'HIGH', 'MED', 'LOW'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded text-xs font-semibold transition-colors ${
              filter === f
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
            }`}
          >
            {f}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-500">{filtered.length} shown</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-700">
        <table className="w-full text-xs">
          <thead className="bg-gray-800 text-gray-400 uppercase tracking-wide">
            <tr>
              {['Patient ID', 'Name', 'Age', 'BP', 'Temp°F', 'BP Sc', 'Tmp Sc', 'Age Sc', 'Total', 'Issues'].map(
                (h) => (
                  <th key={h} className="px-3 py-2 text-left whitespace-nowrap">
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-800">
            {filtered.map((p) => (
              <tr
                key={p.patientId}
                className={`hover:bg-gray-800/50 transition-colors ${
                  p.totalScore >= 4 ? 'bg-red-950/30' : ''
                }`}
              >
                <td className="px-3 py-2 font-mono text-gray-300">{p.patientId}</td>
                <td className="px-3 py-2 text-gray-300 max-w-36 truncate" title={p.name}>
                  {p.name}
                </td>
                <td className="px-3 py-2 text-gray-300">
                  {p.age ?? <span className="text-red-400">—</span>}
                </td>
                <td className="px-3 py-2 font-mono text-gray-300">
                  {p.systolic !== null && p.diastolic !== null ? (
                    `${p.systolic}/${p.diastolic}`
                  ) : p.systolic !== null ? (
                    `${p.systolic}/—`
                  ) : p.diastolic !== null ? (
                    `—/${p.diastolic}`
                  ) : (
                    <span className="text-red-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-gray-300">
                  {p.temperature !== null ? (
                    <span className={p.temperature >= 99.6 ? 'text-orange-400 font-bold' : ''}>
                      {p.temperature.toFixed(1)}
                    </span>
                  ) : (
                    <span className="text-red-400">—</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center text-blue-300">{p.bpScore}</td>
                <td className="px-3 py-2 text-center text-blue-300">{p.tempScore}</td>
                <td className="px-3 py-2 text-center text-blue-300">{p.ageScore}</td>
                <td className="px-3 py-2 text-center">
                  <RiskBadge score={p.totalScore} />
                </td>
                <td className="px-3 py-2 text-yellow-400 max-w-48 truncate" title={p.dataQualityReasons.join(', ')}>
                  {p.dataQualityReasons.length > 0 ? (
                    <span title={p.dataQualityReasons.join('\n')}>
                      ⚠ {p.dataQualityReasons.join(', ')}
                    </span>
                  ) : (
                    <span className="text-gray-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [pipelineResult, setPipelineResult] = useState<PipelineResult | null>(null);
  const [rawData, setRawData] = useState<Record<string, unknown> | null>(null);
  const [submitResult, setSubmitResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState<'inspect' | 'pipeline' | 'submit' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleInspect() {
    setLoading('inspect');
    setError(null);
    setRawData(null);
    try {
      const res = await fetch('/api/inspect');
      const data = await res.json() as Record<string, unknown>;
      setRawData(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  }

  async function handlePipeline() {
    setLoading('pipeline');
    setError(null);
    setPipelineResult(null);
    try {
      const res = await fetch('/api/patients');
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const data: PipelineResult = await res.json();
      setPipelineResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  }

  async function handleSubmit() {
    setLoading('submit');
    setError(null);
    setSubmitResult(null);
    try {
      const res = await fetch('/api/submit', { method: 'POST' });
      const data = await res.json() as Record<string, unknown>;
      setSubmitResult(data);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Ksense Assessment Pipeline - Jaimin Savaliya</h1>
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleInspect}
          disabled={loading !== null}
          className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-sm font-semibold transition-colors"
        >
          {loading === 'inspect' ? '⏳ Loading…' : '🔍 Inspect Raw Data'}
        </button>

        <button
          onClick={handlePipeline}
          disabled={loading !== null}
          className="px-4 py-2 rounded bg-indigo-700 hover:bg-indigo-600 disabled:opacity-50 text-sm font-semibold transition-colors"
        >
          {loading === 'pipeline' ? '⏳ Running pipeline…' : '▶ Run Pipeline'}
        </button>

        <button
          onClick={handleSubmit}
          disabled={loading !== null}
          className="px-4 py-2 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-sm font-semibold transition-colors"
        >
          {loading === 'submit' ? '⏳ Submitting…' : '🚀 Submit Assessment'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-700 bg-red-950/40 p-4 text-red-300 text-sm">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Inspect output */}
      {rawData && (
        <section>
          <h2 className="text-lg font-bold mb-3 text-gray-200">Raw API Data (Page 1)</h2>
          <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-xs text-green-300 overflow-auto max-h-96">
            {JSON.stringify(rawData, null, 2)}
          </pre>
        </section>
      )}

      {/* Pipeline results */}
      {pipelineResult && (
        <section className="space-y-6">
          {/* Summary */}
          <div>
            <h2 className="text-lg font-bold mb-3 text-gray-200">Pipeline Results</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total Patients', value: pipelineResult.summary.totalFetched, color: 'text-white' },
                { label: 'High Risk', value: pipelineResult.summary.highRiskCount, color: 'text-red-400' },
                { label: 'Fever', value: pipelineResult.summary.feverCount, color: 'text-orange-400' },
                { label: 'Data Quality', value: pipelineResult.summary.dataQualityCount, color: 'text-yellow-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-center">
                  <div className={`text-3xl font-bold ${color}`}>{value}</div>
                  <div className="text-xs text-gray-400 mt-1">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Alert lists */}
          <div>
            <h2 className="text-lg font-bold mb-3 text-gray-200">Alert Lists</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <AlertList
                title="High-Risk Patients (score ≥ 4)"
                ids={pipelineResult.alerts.high_risk_patients}
                color="border-red-700"
              />
              <AlertList
                title="Fever Patients (temp ≥ 99.6°F)"
                ids={pipelineResult.alerts.fever_patients}
                color="border-orange-700"
              />
              <AlertList
                title="Data Quality Issues"
                ids={pipelineResult.alerts.data_quality_issues}
                color="border-yellow-700"
              />
            </div>
          </div>

          {/* Patient table */}
          <div>
            <h2 className="text-lg font-bold mb-3 text-gray-200">
              All Patients ({pipelineResult.patients.length})
            </h2>
            <PatientTable patients={pipelineResult.patients} />
          </div>
        </section>
      )}

      {/* Submit result */}
      {submitResult && (
        <section>
          <h2 className="text-lg font-bold mb-3 text-gray-200">Submission Result</h2>
          <pre className="bg-gray-900 border border-gray-700 rounded-lg p-4 text-xs text-green-300 overflow-auto max-h-96">
            {JSON.stringify(submitResult, null, 2)}
          </pre>
        </section>
      )}
    </div>
  );
}
