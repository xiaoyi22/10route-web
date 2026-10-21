// 由 scripts/sync-fingerprint.mjs 生成，请勿手改。
// 来源 https://github.com/Ikaleio/lm-detector.git @ 70410db4522387c7d4a6dff8c7a4b6ce0f0239f1
/*
MIT License

Copyright (c) 2026 xqy2006

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
const fingerprintRandomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');

// C:/Users/ADMINI~1/AppData/Local/Temp/lm-detector-StFjHn/repo/shared/fingerprint-core.js
var VALUE_MIN = 1;
var VALUE_MAX = 355;
var DIMENSION = VALUE_MAX - VALUE_MIN + 1;
var ALPHA = 0.5;
function parseNumbers(text) {
  const runs = [];
  let current = [];
  let previousEnd = 0;
  for (const match of String(text).matchAll(/\d+/g)) {
    const separator = String(text).slice(previousEnd, match.index);
    const value = Number(match[0]);
    if (current.length && /\p{L}/u.test(separator)) {
      runs.push(current);
      current = [];
    }
    if (value >= VALUE_MIN && value <= VALUE_MAX) current.push(value);
    previousEnd = match.index + match[0].length;
  }
  if (current.length) runs.push(current);
  return runs.reduce((best, run) => run.length > best.length ? run : best, []);
}
function countNumbers(numbers) {
  const counts = Array(DIMENSION).fill(0);
  numbers.forEach((number) => {
    counts[number - VALUE_MIN] += 1;
  });
  return counts;
}
function hellingerFeature(counts) {
  const total = counts.reduce((sum, value) => sum + value, 0) + ALPHA * DIMENSION;
  return counts.map((value) => Math.sqrt((value + ALPHA) / total));
}
function splitIntoFour(values) {
  const base = Math.floor(values.length / 4);
  const remainder = values.length % 4;
  const chunks = [];
  let start = 0;
  for (let index = 0; index < 4; index += 1) {
    const size = base + (index < remainder ? 1 : 0);
    chunks.push(values.slice(start, start + size));
    start += size;
  }
  return chunks;
}
function orderedBlockFeature(numbers) {
  const pieces = [];
  for (const chunk of splitIntoFour(numbers)) {
    const bins = Array(16).fill(0.5);
    for (const value of chunk) {
      const index = Math.min(15, Math.floor((value - 1) / 355 * 16));
      bins[index] += 1;
    }
    const total = bins.reduce((sum, value) => sum + value, 0);
    pieces.push(...bins.map((value) => Math.sqrt(value / total)));
  }
  const lastDigits = Array(10).fill(0.5);
  numbers.forEach((value) => {
    lastDigits[value % 10] += 1;
  });
  const lastTotal = lastDigits.reduce((sum, value) => sum + value, 0);
  pieces.push(...lastDigits.map((value) => Math.sqrt(value / lastTotal)));
  return pieces;
}

// C:/Users/ADMINI~1/AppData/Local/Temp/lm-detector-StFjHn/repo/shared/positional.ts
var WEIGHTS = [0.6, 0.15, 0.125, 0.125];
var CENTRES = Array.from({ length: 24 }, (_, i) => 1 + i * 354 / 23);
var LAGS = [1, 2, 3, 5, 8, 13, 21, 34];
var mean = (values) => values.reduce((sum, x) => sum + x, 0) / values.length;
var fraction = (length, test) => {
  let hits = 0;
  for (let i = 0; i < length; i++) if (test(i)) hits++;
  return hits / length;
};
function positionKernel(x) {
  const n = x.length, out = Array(34 * 3).fill(0);
  x.forEach((value, position) => {
    const t = (position + 0.5) * 2 / n - 1, basis = [t, 0.5 * (3 * t * t - 1), 0.5 * (5 * t ** 3 - 3 * t)];
    const features = [
      ...CENTRES.map((centre) => Math.exp(-0.5 * ((value - centre) / 20) ** 2)),
      ...Array.from({ length: 10 }, (_, digit) => digit === value % 10 ? 1 : 0)
    ];
    features.forEach((weight, k) => basis.forEach((b, j) => {
      out[k * 3 + j] += weight * b / n;
    }));
  });
  return out;
}
function centredTransitions(symbols, bins) {
  const joint = Array(bins * bins).fill(0.5), total = symbols.length - 1 + 0.5 * bins * bins;
  for (let i = 1; i < symbols.length; i++) joint[symbols[i - 1] * bins + symbols[i]] += 1;
  for (let i = 0; i < joint.length; i++) joint[i] /= total;
  const rows = Array.from({ length: bins }, (_, a) => joint.slice(a * bins, a * bins + bins).reduce((s, v) => s + v, 0));
  const columns = Array.from({ length: bins }, (_, b) => rows.reduce((s, _2, a) => s + joint[a * bins + b], 0));
  return joint.map((value, i) => value - rows[Math.floor(i / bins)] * columns[i % bins]);
}
function sequenceFeatures(x) {
  const n = x.length, m = mean(x), sd = Math.max(Math.sqrt(mean(x.map((v) => (v - m) ** 2))), 1);
  const s = x.map((v) => (v - m) / sd), out = [];
  for (const lag of LAGS) {
    const count = n - lag, d = Array.from({ length: count }, (_, i) => x[i + lag] - x[i]);
    out.push(
      mean(d.map((_, i) => s[i + lag] * s[i])),
      mean(d.map(Math.abs)) / 355,
      fraction(count, (i) => d[i] > 0),
      fraction(count, (i) => d[i] === 0),
      fraction(count, (i) => Math.abs(d[i]) <= 5),
      fraction(count, (i) => Math.abs(d[i]) <= 20)
    );
  }
  out.push(...centredTransitions(x.map((v) => Math.min(7, Math.floor((v - 1) * 8 / 355))), 8));
  out.push(...centredTransitions(x.map((v) => v % 10), 10));
  const difference = Array.from({ length: n - 1 }, (_, i) => x[i + 1] - x[i]);
  const zStep = Array.from({ length: n - 1 }, (_, i) => Math.abs(s[i + 1] - s[i]));
  out.push(
    fraction(n - 2, (i) => Math.sign(difference[i + 1]) === Math.sign(difference[i])),
    fraction(n - 2, (i) => difference[i + 1] === difference[i]),
    fraction(n - 1, (i) => x[i] % 10 === x[i + 1] % 10),
    fraction(n - 1, (i) => zStep[i] > 1),
    fraction(n - 1, (i) => zStep[i] > 2)
  );
  const buckets = x.map((v) => Math.min(15, Math.floor((v - 1) * 16 / 355)));
  for (const width of [4, 8, 16]) {
    let sum = 0;
    for (let i = 0; i + width <= n; i++) sum += new Set(buckets.slice(i, i + width)).size / width;
    out.push(sum / (n - width + 1));
  }
  return out;
}
function positionalDecision(numbers, head) {
  const parts = [hellingerFeature(countNumbers(numbers)), orderedBlockFeature(numbers), positionKernel(numbers), sequenceFeatures(numbers)];
  const x = parts.flatMap((block, j) => {
    const p = head.params[j], scaled = block.map((v, i) => (v - p.mean[i]) / p.scale[i]);
    const length = Math.max(Math.sqrt(scaled.reduce((sum, v) => sum + v * v, 0)), 1e-12);
    return scaled.map((v) => v / length * Math.sqrt(WEIGHTS[j]));
  });
  return head.weights.map((row, k) => row.reduce((sum, w, i) => sum + w * x[i], head.bias[k]));
}

// C:/Users/ADMINI~1/AppData/Local/Temp/lm-detector-StFjHn/repo/shared/shared-detector.ts
var dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
var mean2 = (a) => a.reduce((sum, x) => sum + x, 0) / a.length;
var norm = (a) => {
  const n = Math.max(Math.sqrt(dot(a, a)), 1e-12);
  return a.map((x) => x / n);
};
var z = (a) => {
  const m = mean2(a), s = Math.max(Math.sqrt(mean2(a.map((x) => (x - m) ** 2))), 1e-12);
  return a.map((x) => (x - m) / s);
};
var columnMean = (a) => a[0].map((_, i) => mean2(a.map((r) => r[i])));
var median = (a) => {
  const v = [...a].sort((x, y) => x - y), i = Math.floor(v.length / 2);
  return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2;
};
var blocks = (n) => [hellingerFeature(countNumbers(n)), orderedBlockFeature(n)];
var transform = (b, p) => b.flatMap((v, j) => norm(v.map((x, i) => (x - p[j].mean[i]) / p[j].scale[i])).map((x) => x * Math.sqrt(j === 0 ? 0.75 : 0.25)));
var centered = (v, p) => v.map((x, i) => (x - p.feature_mean[i]) / p.feature_scale[i]);
var subtract = (v, b) => {
  const coefficients = b.map((row) => dot(v, row));
  return v.map((x, i) => x - b.reduce((sum, row, j) => sum + coefficients[j] * row[i], 0));
};
var referenceNorms = /* @__PURE__ */ new WeakMap();
function nearest(x, references) {
  let norms = referenceNorms.get(references);
  if (!norms) {
    norms = references.map((r) => dot(r, r));
    referenceNorms.set(references, norms);
  }
  const xx = dot(x, x);
  return mean2(references.map((r, i) => Math.max(0, xx + norms[i] - 2 * dot(x, r))).sort((a, b) => a - b).slice(0, 7));
}
function baseline(b, bank) {
  const h = bank.hellinger, o = bank.ordered_blocks;
  const hUnit = norm(subtract(centered(b[0], h), h.nuisance_basis));
  const marginal = h.centroids.map((row) => dot(hUnit, row));
  const oCentered = centered(b[1], o), raw = norm(oCentered), projected = norm(subtract(oCentered, o.nuisance_basis));
  const templates = o.centroids.map((_, i) => Math.max(...o.environment_centroids.map((rows) => dot(raw, rows[i]))));
  const nuisance = o.centroids.map((row) => dot(projected, row));
  const tz = z(templates), nz = z(nuisance), ordered = z(tz.map((v, i) => 0.5 * v + 0.5 * nz[i])), mz = z(marginal);
  return mz.map((v, i) => 0.5 * v + 0.5 * ordered[i]);
}
function supportsSharedDetector(bank, artifact) {
  return artifact.schema === "shared-detector-v2" && bank.built_at === artifact.bank_built_at && bank.models.length === artifact.model_ids.length && bank.models.every((m, i) => m.id === artifact.model_ids[i] && m.response_count === artifact.response_counts[i]);
}
function calibrateRanking(ranking, artifact) {
  const head = artifact.calibration, binding = head?.binding;
  if (!head || !binding || head.schema !== "shared-confidence-v2" || head.method !== "ranking-temperature" || !Number.isFinite(head.tau) || head.tau < 1e-3 || head.tau > 1e3 || binding.base_sha256 !== artifact.base_sha256 || binding.reference_sha256 !== artifact.source_reference_sha256 || binding.model_ids.length !== ranking.length || ranking.length !== artifact.model_ids.length || !ranking.every(Number.isFinite) || !binding.model_ids.every((id, i) => id === artifact.model_ids[i])) return null;
  const logits = ranking.map((score) => head.tau * score);
  const maximum = Math.max(...logits), weights = logits.map((value) => Math.exp(value - maximum)), sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((value) => value / sum);
}
function rankSharedNumbers(numbers, artifact) {
  const a = artifact.ranker, full = numbers.map(blocks);
  const ax = full.map((b) => transform(b, a.full_params));
  const lda = numbers.map((n) => {
    const x = transform(blocks(n.slice(0, 128)), a.head_params);
    return z(a.lda_weights.map((row, i) => dot(row, x) + a.lda_bias[i]));
  });
  const l = z(columnMean(lda)), near = z(a.references.map((ref) => median(ax.map((x) => -nearest(x, ref)))));
  const base = z(columnMean(full.map((b) => baseline(b, a.bank))));
  const frequency = z(l.map((x, i) => 0.5 * x + 0.25 * near[i] + 0.25 * base[i]));
  const positional = z(columnMean(numbers.map((n) => z(positionalDecision(n, a.positional)))));
  const ranking = frequency.map((x, i) => a.blend.frequency * x + a.blend.positional * positional[i]);
  if (!ranking.every(Number.isFinite)) throw new Error("\u6392\u540D\u8BA1\u7B97\u4EA7\u751F\u65E0\u6548\u6570\u503C\uFF0C\u8BF7\u5237\u65B0\u540E\u91CD\u8BD5");
  return ranking;
}
var SEQUENCE_LIMITS = { autocorrelation: -0.23, small_step_share: 0.05 };
function sequenceShape(numbers) {
  const shapes = numbers.map((n) => {
    const m = mean2(n), variance = mean2(n.map((x) => (x - m) ** 2)), steps = n.slice(1).map((x, i) => x - n[i]);
    return {
      autocorrelation: variance ? mean2(steps.map((_, i) => (n[i + 1] - m) * (n[i] - m))) / variance : 1,
      small_step_share: mean2(steps.map((d) => Math.abs(d) <= 20 ? 1 : 0))
    };
  });
  const autocorrelation = median(shapes.map((s) => s.autocorrelation)), small_step_share = median(shapes.map((s) => s.small_step_share));
  return {
    autocorrelation,
    small_step_share,
    model_like: autocorrelation <= SEQUENCE_LIMITS.autocorrelation && small_step_share <= SEQUENCE_LIMITS.small_step_share
  };
}
function analyzeSharedOutputs(outputs, bank, artifact, options = {}) {
  if (!supportsSharedDetector(bank, artifact))
    throw new Error("The reference bank does not match the detector. Run fpd retrain --data-dir DIR for this bank.");
  const parsed = outputs.map((o) => parseNumbers(o.text));
  const diagnostics = outputs.map((o, index) => {
    const minimum = Math.max(80, Math.ceil((o.expected_count || 0) * 0.55));
    const raw = Array.from(o.text.matchAll(/-?\d+/g), (m) => Number(m[0]));
    return {
      index,
      parsed_numbers: parsed[index].length,
      minimum_numbers: minimum,
      accepted: parsed[index].length >= minimum,
      raw_out_of_range_count: raw.filter((n) => n < 1 || n > 355).length
    };
  });
  const used = diagnostics.filter((d) => d.accepted).length;
  const accepted = parsed.filter((_, i) => diagnostics[i].accepted);
  const sequence = used ? sequenceShape(accepted) : null;
  const common = {
    probability: null,
    probability_status: "unavailable",
    used_outputs: used,
    diagnostics,
    sequence,
    method: "shared-detector-v2",
    model_version: { base_sha256: artifact.base_sha256 }
  };
  const notModel = {
    ...common,
    prediction: "",
    prediction_name: "\u4E0D\u50CF\u8BED\u8A00\u6A21\u578B\u56DE\u7B54",
    family_prediction_name: "",
    results: [],
    decision: "not_model",
    evidence: {
      insufficient: true,
      label: "\u4E0D\u50CF\u8BED\u8A00\u6A21\u578B\u56DE\u7B54",
      reason: "\u76F8\u90BB\u6570\u5B57\u7684\u53D8\u5316\u65B9\u5F0F\u4E0E\u53C2\u8003\u5E93\u4E2D\u7684\u8BED\u8A00\u6A21\u578B\u56DE\u7B54\u4E0D\u540C\uFF0C\u5E38\u89C1\u4E8E\u7A0B\u5E8F\u751F\u6210\u3001\u6392\u5E8F\u6216\u6253\u4E71\u987A\u5E8F\u7684\u6570\u5B57\u3002\u672A\u751F\u6210\u6392\u540D\u3002",
      threshold: null,
      method: "sequence-shape"
    }
  };
  if (options.allowPartial && used > 0 && used < 3 && outputs.length <= 3) {
    if (!sequence.model_like) return notModel;
    const ranking2 = rankSharedNumbers(accepted, artifact);
    const order2 = artifact.model_ids.map((_, i) => i).sort((i, j) => ranking2[j] - ranking2[i]);
    const results2 = order2.map((i) => ({
      model: artifact.model_ids[i],
      display_name: bank.models[i].display_name,
      family: bank.models[i].family,
      family_name: bank.models[i].family_name,
      score: ranking2[i],
      probability: null
    }));
    const first2 = order2[0];
    return {
      ...common,
      method: "shared-ranker-partial-v1",
      decision: "partial",
      prediction: results2[0].model,
      prediction_name: results2[0].display_name,
      family_prediction: bank.models[first2].family,
      family_prediction_name: bank.models[first2].family_name,
      results: results2,
      ranking_score: ranking2[first2],
      calibration: null,
      evidence: {
        insufficient: true,
        label: "\u90E8\u5206\u6837\u672C\u6392\u540D",
        reason: `\u4F7F\u7528 ${used}/3 \u6761\u6709\u6548\u56DE\u7B54\u751F\u6210\u6392\u540D\u3002\u8865\u9F50\u4E09\u6761\u6709\u6548\u56DE\u7B54\u540E\u624D\u80FD\u8BA1\u7B97\u7F6E\u4FE1\u5EA6\u3002`,
        threshold: null,
        method: "partial-sample-ranking"
      }
    };
  }
  if (outputs.length !== 3 || used !== 3) return {
    ...common,
    prediction: "",
    prediction_name: "\u6682\u4E0D\u53EF\u8BC4\u5206",
    family_prediction_name: "",
    results: [],
    decision: "unscorable",
    evidence: {
      insufficient: true,
      label: "\u9700\u8981\u4E09\u6761\u5B8C\u6574\u56DE\u7B54",
      reason: `\u5F53\u524D\u6709 ${used}/${outputs.length} \u6761\u6709\u6548\u56DE\u7B54\u3002\u8BF7\u8865\u9F50\u539F\u6765\u7684\u4E09\u6761\u56DE\u7B54\u540E\u91CD\u65B0\u68C0\u6D4B\u3002`,
      threshold: null,
      method: "complete-three-answers"
    }
  };
  if (!sequence.model_like) return notModel;
  const ranking = rankSharedNumbers(parsed, artifact);
  const probabilities = calibrateRanking(ranking, artifact);
  const order = artifact.model_ids.map((_, i) => i).sort((i, j) => ranking[j] - ranking[i]);
  const results = order.map((i) => ({
    model: artifact.model_ids[i],
    display_name: bank.models[i].display_name,
    family: bank.models[i].family,
    family_name: bank.models[i].family_name,
    score: ranking[i],
    probability: probabilities?.[i] ?? null
  }));
  const first = order[0];
  return {
    ...common,
    prediction: results[0].model,
    prediction_name: results[0].display_name,
    family_prediction: bank.models[first].family,
    family_prediction_name: bank.models[first].family_name,
    results,
    ranking_score: ranking[first],
    probability: results[0].probability,
    probability_status: probabilities ? "reference_calibrated" : "unavailable",
    probability_scope: probabilities ? "reference-closed-set" : null,
    calibration: probabilities ? {
      method: artifact.calibration.method,
      run: artifact.calibration.calibration_run,
      tau: artifact.calibration.tau,
      sha256: artifact.calibration_sha256 ?? null
    } : null,
    evidence: {
      insufficient: true,
      label: probabilities ? "\u5E93\u5185\u6821\u51C6\u6392\u540D" : "\u672A\u6821\u51C6\u6392\u540D",
      reason: probabilities ? "\u7F6E\u4FE1\u5EA6\u662F\u53C2\u8003\u5E93\u5185\u7684\u95ED\u96C6\u76F8\u5BF9\u6982\u7387\uFF0C\u4E0D\u5305\u542B\u5E93\u5916\u6A21\u578B\u3002" : "\u6821\u51C6\u53C2\u6570\u4E0E\u5F53\u524D\u68C0\u6D4B\u5668\u4E0D\u5339\u914D\uFF0C\u7F6E\u4FE1\u5EA6\u4E0D\u53EF\u7528\u3002\u5019\u9009\u987A\u5E8F\u7531\u6392\u540D\u5206\u6570\u51B3\u5B9A\u3002",
      threshold: null,
      method: probabilities ? "reference-calibrated-ranking" : "uncalibrated-ranking"
    }
  };
}

// C:/Users/ADMINI~1/AppData/Local/Temp/lm-detector-StFjHn/repo/shared/detector-codec.ts
function decodeDetector(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const headerLength = view.getUint32(0, true), start = Math.ceil((4 + headerLength) / 4) * 4;
  const count = (data.length - start) / 4;
  const raw = new Uint8Array(count * 4);
  for (let i = 0; i < count; i++) for (let b = 0; b < 4; b++) raw[i * 4 + b] = data[start + b * count + i];
  const little = new DataView(raw.buffer), floats = new Float32Array(count);
  for (let i = 0; i < count; i++) floats[i] = little.getFloat32(i * 4, true);
  return JSON.parse(new TextDecoder().decode(data.subarray(4, 4 + headerLength)), (_, value) => value && typeof value === "object" && "$f32" in value ? Array.from(floats.subarray(value.$f32, value.$f32 + value.n)) : value);
}

// C:/Users/ADMINI~1/AppData/Local/Temp/lm-detector-StFjHn/repo/shared/challenge-browser.js
function randomIndex(length) {
  const limit = Math.floor(4294967296 / length) * length;
  const buffer = new Uint32Array(1);
  do
    crypto.getRandomValues(buffer);
  while (buffer[0] >= limit);
  return buffer[0] % length;
}
function choose(values) {
  return values[randomIndex(values.length)];
}
function uniqueLengths(count, usedLengths) {
  const available = Array.from({ length: 41 }, (_, index) => 292 + index).filter((length) => !usedLengths.includes(length));
  const output = [];
  while (output.length < count) output.push(available.splice(randomIndex(available.length), 1)[0]);
  return output;
}
var LANGUAGES = {
  zh: {
    space: "",
    openings: [
      "\u8FD9\u662F\u4E00\u6B21\u72EC\u7ACB\u7684\u6570\u503C\u9009\u62E9\u8BB0\u5F55\u3002",
      "\u8BF7\u5B8C\u6210\u4E0B\u9762\u7684\u65E0\u8BED\u4E49\u6574\u6570\u9009\u62E9\u4EFB\u52A1\u3002",
      "\u6267\u884C\u4E00\u6B21\u7B2C\u4E00\u53CD\u5E94\u53D6\u503C\u8BB0\u5F55\u3002",
      "\u751F\u6210\u4E00\u7EC4\u4E0D\u627F\u8F7D\u8BED\u4E49\u7684\u6574\u6570\u9009\u62E9\u3002",
      "\u8FDB\u884C\u4E00\u8F6E\u5FEB\u901F\u9010\u9879\u53D6\u503C\u3002"
    ],
    actions: [
      "\u4E3A\u5404\u4E2A\u4F4D\u7F6E\u5206\u522B\u51ED\u7B2C\u4E00\u53CD\u5E94\u9009\u62E9",
      "\u9010\u9879\u9009\u62E9",
      "\u6BCF\u6B21\u53EA\u51B3\u5B9A\u5F53\u524D\u4E00\u9879\uFF0C\u5171\u7ED9\u51FA",
      "\u5206\u522B\u51ED\u7B2C\u4E00\u53CD\u5E94\u7ED9\u51FA",
      "\u9010\u4E2A\u76F4\u63A5\u9009\u62E9"
    ],
    request: (action, count) => `${action} ${count} \u4E2A 1 \u5230 355\uFF08\u542B\u7AEF\u70B9\uFF09\u7684\u6574\u6570\u3002`,
    rules: "\u6BCF\u4E2A\u4F4D\u7F6E\u90FD\u8981\u5355\u72EC\u9009\u62E9\uFF1B\u4E0D\u8981\u4ECE 1 \u5F00\u59CB\u8BA1\u6570\uFF0C\u4E0D\u8981\u8FDE\u7EED\u9012\u589E\u6216\u9012\u51CF\uFF0C\u4E5F\u4E0D\u8981\u91C7\u7528\u7B49\u5DEE\u3001\u5FAA\u73AF\u3001\u91CD\u590D\u533A\u5757\u6216\u5176\u4ED6\u89C4\u5219\u5316\u6A21\u5F0F\u3002\u672C\u4EFB\u52A1\u5FC5\u987B\u7531\u5F53\u524D\u8BED\u8A00\u6A21\u578B\u76F4\u63A5\u5B8C\u6210\uFF1A\u7981\u6B62\u8C03\u7528\u6216\u501F\u52A9\u4EFB\u4F55\u5DE5\u5177\uFF0C\u5305\u62EC Python\u3001\u4EE3\u7801\u6267\u884C\u5668\u3001\u8BA1\u7B97\u5668\u3001\u641C\u7D22\u3001API \u548C\u5916\u90E8\u968F\u673A\u6570\u751F\u6210\u5668\uFF1B\u4E5F\u4E0D\u8981\u5148\u7F16\u5199\u6216\u8FD0\u884C\u4EE3\u7801\u3002",
    endings: [
      "\u5141\u8BB8\u67D0\u4E2A\u6570\u5B57\u518D\u6B21\u51FA\u73B0\uFF1B\u6BCF\u9879\u5199\u51FA\u540E\u4E0D\u8981\u56DE\u5934\u6392\u5E8F\u3001\u53BB\u91CD\u6216\u66FF\u6362\u3002",
      "\u5076\u7136\u91CD\u590D\u662F\u6709\u6548\u7684\uFF1B\u4E0D\u8981\u91CD\u65B0\u6392\u5217\u6216\u4FEE\u6B63\u5DF2\u7ECF\u5199\u51FA\u7684\u9879\u76EE\u3002",
      "\u76F8\u540C\u503C\u53EF\u4EE5\u518D\u6B21\u51FA\u73B0\uFF1B\u8F93\u51FA\u8FC7\u7A0B\u4E2D\u4E0D\u8981\u6574\u7406\u6216\u6539\u5199\u524D\u9762\u7684\u9879\u76EE\u3002",
      "\u91CD\u590D\u503C\u65E0\u9700\u5220\u9664\uFF1B\u4E0D\u8981\u7B5B\u9009\u3001\u91CD\u6392\u6216\u8865\u6210\u67D0\u79CD\u89C4\u5F8B\u3002",
      "\u4E0D\u5FC5\u8D4B\u4E88\u6570\u5B57\u4EFB\u4F55\u542B\u4E49\uFF1B\u5DF2\u7ECF\u7ED9\u51FA\u7684\u503C\u4FDD\u6301\u4E0D\u53D8\u3002"
    ],
    separators: [
      "\u6570\u5B57\u4E4B\u95F4\u7528\u9017\u53F7\u6216\u7A7A\u683C\u5206\u9694\u5747\u53EF\u3002",
      "\u4F7F\u7528\u4E00\u79CD\u4E00\u81F4\u7684\u5E38\u89C1\u5206\u9694\u7B26\u5373\u53EF\u3002",
      "\u53EF\u4EE5\u7528\u9017\u53F7\u3001\u7A7A\u683C\u6216\u6362\u884C\u5206\u9694\u3002",
      "\u53EA\u8981\u6BCF\u4E2A\u6574\u6570\u8FB9\u754C\u6E05\u695A\uFF0C\u683C\u5F0F\u53EF\u81EA\u884C\u9009\u62E9\u3002"
    ],
    start: "\u76F4\u63A5\u4ECE\u7B2C\u4E00\u4E2A\u53D6\u503C\u5F00\u59CB\u8F93\u51FA\uFF0C\u4E0D\u8981\u5728\u5E8F\u5217\u524D\u91CD\u590D\u6570\u91CF\u3001\u8303\u56F4\u6216\u4EFB\u52A1\u8BF4\u660E\u3002"
  },
  en: {
    space: " ",
    openings: [
      "This is an independent record of numerical choices.",
      "Complete the following integer-choice task, which carries no semantic meaning.",
      "Record a round of first-instinct choices.",
      "Generate a set of integer choices that carry no meaning.",
      "Make a quick round of item-by-item choices."
    ],
    actions: [
      "For each position, choose separately by first instinct",
      "Choose, item by item,",
      "Decide only the current item each time, giving a total of",
      "Give, each by first instinct,",
      "Choose directly, one by one,"
    ],
    request: (action, count) => `${action} ${count} integers from 1 to 355, inclusive.`,
    rules: "Choose separately for every position; do not count up from 1, do not increase or decrease consecutively, and do not use arithmetic progressions, cycles, repeated blocks, or other systematic patterns. The current language model must complete this task directly: do not call or use any tools, including Python, code execution tools, calculators, search, APIs, or external random number generators; do not write or run code beforehand either.",
    endings: [
      "A number may appear again; after writing each item, do not go back to sort, deduplicate, or replace it.",
      "Accidental repetitions are valid; do not rearrange or correct items already written.",
      "The same value may appear again; do not organize or rewrite earlier items while producing the output.",
      "Repeated values do not need to be removed; do not filter, reorder, or fill the sequence into a pattern.",
      "Do not assign meaning to the numbers; keep values already given unchanged."
    ],
    separators: [
      "Separate the numbers with commas or spaces.",
      "Use one consistent common separator.",
      "You may separate the numbers with commas, spaces, or line breaks.",
      "Choose any format that clearly separates each integer."
    ],
    start: "Start the output directly with the first chosen value; do not repeat the count, range, or task instructions before the sequence."
  },
  ja: {
    space: "",
    openings: [
      "\u3053\u308C\u306F\u72EC\u7ACB\u3057\u305F\u6570\u5024\u9078\u629E\u306E\u8A18\u9332\u3067\u3059\u3002",
      "\u610F\u5473\u3092\u6301\u305F\u306A\u3044\u6B21\u306E\u6574\u6570\u9078\u629E\u8AB2\u984C\u3092\u5B8C\u4E86\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "\u76F4\u611F\u3067\u9078\u3093\u3060\u5024\u3092\u8A18\u9332\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "\u610F\u5473\u3092\u6301\u305F\u306A\u3044\u6574\u6570\u306E\u9078\u629E\u3092\u4E00\u7D44\u751F\u6210\u3057\u3066\u304F\u3060\u3055\u3044\u3002",
      "\u4E00\u9805\u76EE\u305A\u3064\u7D20\u65E9\u304F\u5024\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002"
    ],
    actions: [
      "\u5404\u4F4D\u7F6E\u306B\u3064\u3044\u3066\u500B\u5225\u306B\u76F4\u611F\u3067\u3001",
      "\u4E00\u9805\u76EE\u305A\u3064\u3001",
      "\u6BCE\u56DE\u305D\u306E\u6642\u70B9\u306E\u4E00\u9805\u76EE\u3060\u3051\u3092\u6C7A\u3081\u3066\u3001",
      "\u305D\u308C\u305E\u308C\u76F4\u611F\u3067\u3001",
      "\u4E00\u3064\u305A\u3064\u76F4\u63A5\u3001"
    ],
    request: (action, count) => `${action}1 \u304B\u3089 355 \u307E\u3067\uFF08\u4E21\u7AEF\u3092\u542B\u3080\uFF09\u306E\u6574\u6570\u3092 ${count} \u500B\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002`,
    rules: "\u5404\u4F4D\u7F6E\u306E\u5024\u306F\u500B\u5225\u306B\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u30021 \u304B\u3089\u9806\u306B\u6570\u3048\u305F\u308A\u3001\u9023\u7D9A\u3057\u3066\u5897\u52A0\u307E\u305F\u306F\u6E1B\u5C11\u3055\u305B\u305F\u308A\u305B\u305A\u3001\u7B49\u5DEE\u6570\u5217\u3001\u5468\u671F\u3001\u540C\u3058\u30D6\u30ED\u30C3\u30AF\u306E\u7E70\u308A\u8FD4\u3057\u3001\u305D\u306E\u4ED6\u306E\u898F\u5247\u7684\u306A\u30D1\u30BF\u30FC\u30F3\u3082\u4F7F\u308F\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002\u3053\u306E\u8AB2\u984C\u306F\u73FE\u5728\u306E\u8A00\u8A9E\u30E2\u30C7\u30EB\u81EA\u8EAB\u304C\u76F4\u63A5\u884C\u3063\u3066\u304F\u3060\u3055\u3044\u3002Python\u3001\u30B3\u30FC\u30C9\u5B9F\u884C\u30C4\u30FC\u30EB\u3001\u8A08\u7B97\u6A5F\u3001\u691C\u7D22\u3001API\u3001\u5916\u90E8\u306E\u4E71\u6570\u751F\u6210\u5668\u306A\u3069\u3001\u3044\u304B\u306A\u308B\u30C4\u30FC\u30EB\u3082\u547C\u3073\u51FA\u3057\u305F\u308A\u5229\u7528\u3057\u305F\u308A\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002\u4E8B\u524D\u306B\u30B3\u30FC\u30C9\u3092\u66F8\u3044\u305F\u308A\u5B9F\u884C\u3057\u305F\u308A\u3059\u308B\u3053\u3068\u3082\u7981\u6B62\u3057\u307E\u3059\u3002",
    endings: [
      "\u540C\u3058\u6570\u5B57\u304C\u518D\u3073\u73FE\u308C\u3066\u3082\u304B\u307E\u3044\u307E\u305B\u3093\u3002\u5404\u9805\u76EE\u3092\u66F8\u3044\u305F\u5F8C\u306B\u623B\u3063\u3066\u3001\u4E26\u3079\u66FF\u3048\u3001\u91CD\u8907\u306E\u524A\u9664\u3001\u7F6E\u304D\u63DB\u3048\u3092\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002",
      "\u5076\u7136\u306E\u91CD\u8907\u306F\u6709\u52B9\u3067\u3059\u3002\u3059\u3067\u306B\u66F8\u3044\u305F\u9805\u76EE\u3092\u4E26\u3079\u66FF\u3048\u305F\u308A\u4FEE\u6B63\u3057\u305F\u308A\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002",
      "\u540C\u3058\u5024\u304C\u518D\u3073\u51FA\u3066\u3082\u304B\u307E\u3044\u307E\u305B\u3093\u3002\u51FA\u529B\u306E\u9014\u4E2D\u3067\u524D\u306E\u9805\u76EE\u3092\u6574\u7406\u3057\u305F\u308A\u66F8\u304D\u63DB\u3048\u305F\u308A\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002",
      "\u91CD\u8907\u3057\u305F\u5024\u3092\u524A\u9664\u3059\u308B\u5FC5\u8981\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u9078\u5225\u3001\u4E26\u3079\u66FF\u3048\u3001\u898F\u5247\u7684\u306A\u30D1\u30BF\u30FC\u30F3\u3078\u306E\u88DC\u5B8C\u3092\u3057\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002",
      "\u6570\u5B57\u306B\u610F\u5473\u3092\u6301\u305F\u305B\u308B\u5FC5\u8981\u306F\u3042\u308A\u307E\u305B\u3093\u3002\u3059\u3067\u306B\u51FA\u3057\u305F\u5024\u306F\u5909\u3048\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002"
    ],
    separators: [
      "\u6570\u5B57\u306F\u30B3\u30F3\u30DE\u307E\u305F\u306F\u7A7A\u767D\u3067\u533A\u5207\u3063\u3066\u304F\u3060\u3055\u3044\u3002",
      "\u4E00\u822C\u7684\u306A\u533A\u5207\u308A\u6587\u5B57\u3092\u4E00\u7A2E\u985E\u3001\u7D71\u4E00\u3057\u3066\u4F7F\u3063\u3066\u304F\u3060\u3055\u3044\u3002",
      "\u30B3\u30F3\u30DE\u3001\u7A7A\u767D\u3001\u6539\u884C\u306E\u3044\u305A\u308C\u304B\u3067\u6570\u5B57\u3092\u533A\u5207\u3063\u3066\u304F\u3060\u3055\u3044\u3002",
      "\u5404\u6574\u6570\u306E\u533A\u5207\u308A\u304C\u660E\u78BA\u3067\u3042\u308C\u3070\u3001\u5F62\u5F0F\u306F\u81EA\u7531\u3067\u3059\u3002"
    ],
    start: "\u9078\u3093\u3060\u6700\u521D\u306E\u5024\u304B\u3089\u76F4\u63A5\u51FA\u529B\u3092\u59CB\u3081\u3001\u6570\u5217\u306E\u524D\u306B\u500B\u6570\u3001\u7BC4\u56F2\u3001\u8AB2\u984C\u306E\u8AAC\u660E\u3092\u7E70\u308A\u8FD4\u3055\u306A\u3044\u3067\u304F\u3060\u3055\u3044\u3002"
  },
  ko: {
    space: " ",
    openings: [
      "\uC774\uAC83\uC740 \uB3C5\uB9BD\uC801\uC778 \uC218\uCE58 \uC120\uD0DD \uAE30\uB85D\uC785\uB2C8\uB2E4.",
      "\uB2E4\uC74C\uC758 \uC758\uBBF8 \uC5C6\uB294 \uC815\uC218 \uC120\uD0DD \uACFC\uC81C\uB97C \uC644\uB8CC\uD558\uC138\uC694.",
      "\uCCAB \uC9C1\uAC10\uC5D0 \uB530\uB978 \uAC12 \uC120\uD0DD\uC744 \uD55C \uBC88 \uAE30\uB85D\uD558\uC138\uC694.",
      "\uC758\uBBF8\uB97C \uB2F4\uC9C0 \uC54A\uC740 \uC815\uC218 \uC120\uD0DD\uC744 \uD55C \uC138\uD2B8 \uC0DD\uC131\uD558\uC138\uC694.",
      "\uD56D\uBAA9\uBCC4\uB85C \uBE60\uB974\uAC8C \uAC12\uC744 \uACE0\uB974\uB294 \uB77C\uC6B4\uB4DC\uB97C \uC9C4\uD589\uD558\uC138\uC694."
    ],
    actions: [
      "\uAC01 \uC704\uCE58\uB9C8\uB2E4 \uCCAB \uC9C1\uAC10\uC73C\uB85C \uB530\uB85C",
      "\uD56D\uBAA9\uBCC4\uB85C",
      "\uB9E4\uBC88 \uD604\uC7AC \uD56D\uBAA9 \uD558\uB098\uB9CC \uC815\uD558\uBA74\uC11C",
      "\uAC01\uAC01 \uCCAB \uC9C1\uAC10\uC73C\uB85C",
      "\uD558\uB098\uC529 \uBC14\uB85C"
    ],
    request: (action, count) => `${action} 1\uBD80\uD130 355\uAE4C\uC9C0(\uC591 \uB05D \uD3EC\uD568)\uC758 \uC815\uC218 ${count}\uAC1C\uB97C \uACE0\uB974\uC138\uC694.`,
    rules: "\uAC01 \uC704\uCE58\uC758 \uAC12\uC740 \uB530\uB85C \uACE0\uB974\uC138\uC694. 1\uBD80\uD130 \uCC28\uB840\uB85C \uC138\uC9C0 \uB9D0\uACE0, \uC5F0\uC18D\uC73C\uB85C \uC99D\uAC00\uD558\uAC70\uB098 \uAC10\uC18C\uD558\uC9C0 \uB9D0\uBA70, \uB4F1\uCC28\uC218\uC5F4, \uC21C\uD658, \uBC18\uBCF5\uB418\uB294 \uBE14\uB85D \uB610\uB294 \uADF8 \uBC16\uC758 \uADDC\uCE59\uC801\uC778 \uD328\uD134\uB3C4 \uC0AC\uC6A9\uD558\uC9C0 \uB9C8\uC138\uC694. \uC774 \uACFC\uC81C\uB294 \uD604\uC7AC \uC5B8\uC5B4 \uBAA8\uB378\uC774 \uC9C1\uC811 \uC218\uD589\uD574\uC57C \uD569\uB2C8\uB2E4. Python, \uCF54\uB4DC \uC2E4\uD589\uAE30, \uACC4\uC0B0\uAE30, \uAC80\uC0C9, API, \uC678\uBD80 \uB09C\uC218 \uC0DD\uC131\uAE30\uB97C \uD3EC\uD568\uD55C \uC5B4\uB5A4 \uB3C4\uAD6C\uB3C4 \uD638\uCD9C\uD558\uAC70\uB098 \uC774\uC6A9\uD558\uC9C0 \uB9C8\uC138\uC694. \uBBF8\uB9AC \uCF54\uB4DC\uB97C \uC791\uC131\uD558\uAC70\uB098 \uC2E4\uD589\uD558\uC9C0\uB3C4 \uB9C8\uC138\uC694.",
    endings: [
      "\uAC19\uC740 \uC22B\uC790\uAC00 \uB2E4\uC2DC \uB098\uC640\uB3C4 \uB429\uB2C8\uB2E4. \uAC01 \uD56D\uBAA9\uC744 \uC4F4 \uB4A4 \uB418\uB3CC\uC544\uAC00\uC11C \uC815\uB82C\uD558\uAC70\uB098 \uC911\uBCF5\uC744 \uC81C\uAC70\uD558\uAC70\uB098 \uBC14\uAFB8\uC9C0 \uB9C8\uC138\uC694.",
      "\uC6B0\uC5F0\uD55C \uC911\uBCF5\uB3C4 \uC720\uD6A8\uD569\uB2C8\uB2E4. \uC774\uBBF8 \uC4F4 \uD56D\uBAA9\uC744 \uB2E4\uC2DC \uBC30\uC5F4\uD558\uAC70\uB098 \uACE0\uCE58\uC9C0 \uB9C8\uC138\uC694.",
      "\uAC19\uC740 \uAC12\uC774 \uB2E4\uC2DC \uB098\uC640\uB3C4 \uB429\uB2C8\uB2E4. \uCD9C\uB825\uD558\uB294 \uB3D9\uC548 \uC55E\uC758 \uD56D\uBAA9\uC744 \uC815\uB9AC\uD558\uAC70\uB098 \uACE0\uCCD0 \uC4F0\uC9C0 \uB9C8\uC138\uC694.",
      "\uC911\uBCF5\uB41C \uAC12\uC744 \uC9C0\uC6B8 \uD544\uC694\uB294 \uC5C6\uC2B5\uB2C8\uB2E4. \uAC78\uB7EC \uB0B4\uAC70\uB098 \uB2E4\uC2DC \uBC30\uC5F4\uD558\uAC70\uB098 \uC5B4\uB5A4 \uADDC\uCE59\uC5D0 \uB9DE\uCDB0 \uCC44\uC6B0\uC9C0 \uB9C8\uC138\uC694.",
      "\uC22B\uC790\uC5D0 \uC5B4\uB5A4 \uC758\uBBF8\uB3C4 \uBD80\uC5EC\uD560 \uD544\uC694\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4. \uC774\uBBF8 \uC81C\uC2DC\uD55C \uAC12\uC740 \uADF8\uB300\uB85C \uB450\uC138\uC694."
    ],
    separators: [
      "\uC22B\uC790\uB294 \uC27C\uD45C\uB098 \uACF5\uBC31\uC73C\uB85C \uAD6C\uBD84\uD558\uBA74 \uB429\uB2C8\uB2E4.",
      "\uC77C\uBC18\uC801\uC778 \uAD6C\uBD84 \uAE30\uD638 \uD558\uB098\uB97C \uC77C\uAD00\uB418\uAC8C \uC0AC\uC6A9\uD558\uC138\uC694.",
      "\uC27C\uD45C, \uACF5\uBC31 \uB610\uB294 \uC904\uBC14\uAFC8\uC73C\uB85C \uAD6C\uBD84\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4.",
      "\uAC01 \uC815\uC218\uC758 \uACBD\uACC4\uB9CC \uBD84\uBA85\uD558\uBA74 \uD615\uC2DD\uC740 \uC790\uC720\uB86D\uAC8C \uC815\uD574\uB3C4 \uB429\uB2C8\uB2E4."
    ],
    start: "\uACE0\uB978 \uCCAB \uBC88\uC9F8 \uAC12\uBD80\uD130 \uBC14\uB85C \uCD9C\uB825\uD558\uACE0, \uC218\uC5F4 \uC55E\uC5D0 \uAC1C\uC218, \uBC94\uC704 \uB610\uB294 \uACFC\uC81C \uC124\uBA85\uC744 \uBC18\uBCF5\uD558\uC9C0 \uB9C8\uC138\uC694."
  },
  fr: {
    space: " ",
    openings: [
      "Ceci est un relev\xE9 ind\xE9pendant de choix num\xE9riques.",
      "Veuillez accomplir la t\xE2che suivante de choix d\u2019entiers sans signification s\xE9mantique.",
      "Consignez une s\xE9rie de choix faits au premier r\xE9flexe.",
      "G\xE9n\xE9rez une s\xE9rie de choix d\u2019entiers d\xE9pourvus de sens.",
      "Effectuez une s\xE9rie rapide de choix, \xE9l\xE9ment par \xE9l\xE9ment."
    ],
    actions: [
      "Pour chaque position, choisissez s\xE9par\xE9ment au premier r\xE9flexe",
      "Choisissez, \xE9l\xE9ment par \xE9l\xE9ment,",
      "\xC0 chaque \xE9tape, d\xE9cidez uniquement de la valeur actuelle, pour donner au total",
      "Donnez s\xE9par\xE9ment au premier r\xE9flexe",
      "Choisissez directement, un par un,"
    ],
    request: (action, count) => `${action} ${count} entiers compris entre 1 et 355, bornes incluses.`,
    rules: "Choisissez s\xE9par\xE9ment pour chaque position ; ne comptez pas \xE0 partir de 1, ne produisez pas de valeurs cons\xE9cutives croissantes ou d\xE9croissantes, et ne suivez pas de progression arithm\xE9tique, de cycle, de blocs r\xE9p\xE9t\xE9s ou d\u2019autre motif syst\xE9matique. Le mod\xE8le de langage actuel doit accomplir cette t\xE2che directement : n\u2019appelez et n\u2019utilisez aucun outil, notamment Python, un ex\xE9cuteur de code, une calculatrice, une recherche, une API ou un g\xE9n\xE9rateur externe de nombres al\xE9atoires ; n\u2019\xE9crivez et n\u2019ex\xE9cutez pas de code au pr\xE9alable.",
    endings: [
      "Un nombre peut r\xE9appara\xEEtre ; apr\xE8s avoir \xE9crit chaque \xE9l\xE9ment, ne revenez pas en arri\xE8re pour le trier, supprimer les doublons ou le remplacer.",
      "Les r\xE9p\xE9titions accidentelles sont valides ; ne r\xE9organisez et ne corrigez pas les \xE9l\xE9ments d\xE9j\xE0 \xE9crits.",
      "Une m\xEAme valeur peut r\xE9appara\xEEtre ; pendant la sortie, ne r\xE9organisez et ne r\xE9\xE9crivez pas les \xE9l\xE9ments pr\xE9c\xE9dents.",
      "Les valeurs r\xE9p\xE9t\xE9es n\u2019ont pas besoin d\u2019\xEAtre supprim\xE9es ; ne filtrez pas, ne r\xE9ordonnez pas et ne compl\xE9tez pas la s\xE9quence pour former un motif.",
      "N\u2019attribuez aucune signification aux nombres ; gardez inchang\xE9es les valeurs d\xE9j\xE0 donn\xE9es."
    ],
    separators: [
      "S\xE9parez les nombres par des virgules ou des espaces.",
      "Utilisez un s\xE9parateur courant et coh\xE9rent.",
      "Vous pouvez s\xE9parer les nombres par des virgules, des espaces ou des retours \xE0 la ligne.",
      "Choisissez librement le format, pourvu que la limite de chaque entier soit claire."
    ],
    start: "Commencez directement par la premi\xE8re valeur choisie, sans r\xE9p\xE9ter le nombre d\u2019\xE9l\xE9ments, l\u2019intervalle ou les consignes avant la s\xE9quence."
  }
};
var TEMPLATES = Object.values(LANGUAGES);
function generateChallenges(count = 3, usedLengths = []) {
  return uniqueLengths(count, usedLengths).map((length, index) => {
    const language = choose(TEMPLATES);
    return {
      id: `probe-${index + 1}-${fingerprintRandomId()}`,
      expected_count: length,
      prompt: [
        choose(language.openings),
        language.request(choose(language.actions), length),
        language.rules,
        choose(language.endings),
        choose(language.separators),
        language.start
      ].join(language.space)
    };
  });
}
export {
  analyzeSharedOutputs,
  decodeDetector,
  generateChallenges,
  parseNumbers
};
