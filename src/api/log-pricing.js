import { providerId, requestTokens } from './data.js';

export function logCost(entry, pricing) {
  if (typeof entry.cost === 'number' && Number.isFinite(entry.cost) && entry.cost >= 0) return { value: entry.cost, source: 'recorded' };
  const rates = pricing?.[entry.provider]?.[entry.model] || pricing?.[providerId(entry.provider)]?.[entry.model];
  const tokens = requestTokens(entry.tokens);
  if (!rates || tokens.input === null || tokens.output === null || ![rates.input, rates.output].every(value => typeof value === 'number' && Number.isFinite(value) && value >= 0)) return null;
  const cached = tokens.cached ?? 0;
  const created = tokens.created ?? 0;
  // The details API adds cached_tokens to raw Claude records; canonical usage drops cache_read_input_tokens.
  const unfolded = entry.tokens?.cache_read_input_tokens !== undefined || (entry.tokens?.cached_tokens === undefined && entry.tokens?.cache_creation_input_tokens !== undefined);
  const input = unfolded ? tokens.input + cached + created : Math.max(tokens.input, cached + created);
  const rate = rates.long_context && input > rates.long_context.threshold ? { ...rates, ...rates.long_context } : rates;
  const value = ((input - cached - created) * rate.input + cached * (rate.cached ?? rate.input) + created * (rate.cache_creation ?? rate.input) + tokens.output * rate.output + (rate.reasoning_included ? 0 : (tokens.reasoning ?? 0) * (rate.reasoning ?? rate.output))) / 1000000;
  return Number.isFinite(value) && value >= 0 ? { value, source: 'estimated' } : null;
}

export function formatLogCost(cost) {
  return cost ? `$${cost.value.toFixed(6)}` : '—';
}
