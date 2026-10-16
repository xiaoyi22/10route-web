import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const source = process.env.TENROUTER_MATRIX_JSON || resolve(import.meta.dirname, '../../docs/test-execution-2026-10-11.json');

// The matrix is a reconstructed catalog: it describes scenarios, not runnable assertions.
// Every case is paired with an executable probe; cases without one stay reported as pending.
export async function loadCatalog() {
  const raw = JSON.parse(await readFile(source, 'utf8'));
  const cases = raw.catalog.cases.map(item => ({
    id: item.id,
    group: item.group,
    route: item.route,
    category: item.category,
    title: item.title,
    risk: item.risk,
    endpoint: item.endpoint_under_test,
    preconditions: item.preconditions,
    steps: item.steps,
    expected: item.expected,
    origin: item.origin,
    priorStatus: item.status,
  }));
  const ui = (raw.ui_matrix?.entries || []).map(item => ({
    id: item.id,
    group: item.surface,
    route: item.route,
    category: 'ui-matrix',
    title: item.id + ' ' + item.viewport + ' ' + item.theme + ' ' + item.auth_state,
    risk: 'read-only',
    width: item.width_px,
    theme: item.theme,
    authState: item.auth_state,
    checks: item.checks,
  }));
  return { cases, ui, meta: { total: cases.length, uiTotal: ui.length, source } };
}
