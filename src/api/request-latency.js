function validDuration(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function requestLatencyPresentation(entry) {
  const first = entry.imported ? undefined : entry.latency?.ttft;
  const total = entry.imported ? undefined : entry.latency?.total;
  const seconds = validDuration(total) ? Math.round(total / 1000) : null;
  return {
    first: validDuration(first) ? `${(first / 1000).toFixed(2)}s` : '—',
    total: seconds === null ? '—' : Number((total / 1000).toFixed(2)) < 60 ? `${(total / 1000).toFixed(2)}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`,
    firstTone: !validDuration(first) ? 'unknown' : first < 10000 ? 'fast' : first < 20000 ? 'warning' : 'slow',
    totalTone: !validDuration(total) ? 'unknown' : total < 60000 ? 'fast' : 'warning',
  };
}
