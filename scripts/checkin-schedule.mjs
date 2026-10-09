const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' });

// AnyRouter's daily quota cycle begins at 08:00 Shanghai time; a confirmation only
// counts when it happened on the current cycle day at or after that boundary.
function shanghaiParts(value) {
  const fields = Object.fromEntries(parts.formatToParts(new Date(value)).map(part => [part.type, part.value]));
  return { day: fields.year + '-' + fields.month + '-' + fields.day, hour: Number(fields.hour) };
}

export function selectAutomaticCheckinIds(snapshot, now = new Date()) {
  const current = shanghaiParts(now);
  if (current.hour < 9) return [];
  return (snapshot?.accounts || []).filter(account => {
    if (!account.enabled) return false;
    const last = account.lastResult;
    if (!last || !['success', 'already'].includes(last.status)) return true;
    const confirmed = shanghaiParts(last.timestamp);
    return !(confirmed.day === current.day && confirmed.hour >= 8);
  }).map(account => account.id);
}
