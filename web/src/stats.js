// Motor estadístico del Detective (mismo método que el notebook de Colab)
const Stats = (() => {
  const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
  function lgamma(x) {
    const g = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015; for (const c of g) ser += c / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m; let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN; c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN; d = 1 / d;
      const del = d * c; h *= del; if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(x, a, b) {
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  const tsf2 = (t, df) => ibeta(df / (df + t * t), df / 2, 0.5);           // P(|T|>t)
  function tinv975(df) { let lo = 0, hi = 50; for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; tsf2(mid, df) > 0.05 ? lo = mid : hi = mid; } return (lo + hi) / 2; }
  function erf(x) { const s = Math.sign(x); x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y; }
  const normSf2 = z => 1 - erf(Math.abs(z) / Math.SQRT2);                 // P(|Z|>z)
  const median = a => { const s = [...a].sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };

  function analizar(vals, inicio) {
    const [y0, m0] = inicio.split("-").map(Number);
    const pts = [];
    vals.forEach((v, i) => { if (v == null || !isFinite(v)) return; const k = m0 - 1 + i, m = k % 12, y = y0 + Math.floor(k / 12); pts.push({ y, m, t: y + (m + 0.5) / 12, v }); });
    const sum = Array(12).fill(0), cnt = Array(12).fill(0); pts.forEach(p => { sum[p.m] += p.v; cnt[p.m]++; });
    const clim = sum.map((s, i) => s / cnt[i]); pts.forEach(p => p.a = p.v - clim[p.m]);
    const n = pts.length, ts = pts.map(p => p.t), as = pts.map(p => p.a), tm = mean(ts), am = mean(as);
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (ts[i] - tm) * (as[i] - am); sxx += (ts[i] - tm) ** 2; }
    const b = sxy / sxx, a0 = am - b * tm, res = as.map((a, i) => a - (a0 + b * ts[i]));
    const r0 = res.slice(0, -1), r1s = res.slice(1), m0r = mean(r0), m1r = mean(r1s);
    let c01 = 0, c00 = 0, c11 = 0; for (let i = 0; i < r0.length; i++) { c01 += (r0[i] - m0r) * (r1s[i] - m1r); c00 += (r0[i] - m0r) ** 2; c11 += (r1s[i] - m1r) ** 2; }
    const r1 = c01 / Math.sqrt(c00 * c11), neff = Math.max(3, n * (1 - r1) / (1 + r1));
    const se = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / (neff - 2) / sxx);
    const pT = tsf2(Math.abs(b / se), neff - 2), tc = tinv975(neff - 2);
    // Mann-Kendall estacional + pendiente de Sen
    let S = 0, V = 0; const slopes = [];
    for (let m = 0; m < 12; m++) {
      const xs = pts.filter(p => p.m === m); const k = xs.length;
      for (let i = 0; i < k - 1; i++) for (let j = i + 1; j < k; j++) { S += Math.sign(xs[j].v - xs[i].v); slopes.push((xs[j].v - xs[i].v) / (xs[j].y - xs[i].y)); }
      V += k * (k - 1) * (2 * k + 5) / 18;
    }
    const z = S > 0 ? (S - 1) / Math.sqrt(V) : S < 0 ? (S + 1) / Math.sqrt(V) : 0, pMK = normSf2(z), sen = median(slopes);
    // promedios anuales para dibujar
    const porAnio = {}; pts.forEach(p => (porAnio[p.y] ||= []).push(p.v));
    const meanAll = mean(pts.map(p => p.v));
    const anual = Object.entries(porAnio).map(([y, a]) => ({ y: +y, v: mean(a), completo: a.length === 12 }));
    const sigma = Math.sqrt(mean(res.map(r => r * r)));
    const anios = n / 12;
    const nNec = Math.pow((3.3 * sigma / Math.abs(b)) * Math.sqrt((1 + r1) / (1 - r1)), 2 / 3);
    const nivel = t => meanAll + b * (t - tm);
    return { se, tc, pts, anual, b, ic: [b - tc * se, b + tc * se], pT, pMK, z, sen, r1, neff, n, anios, meanAll, tm, nivel,
      porDecada: b * 10, icDecada: [(b - tc * se) * 10, (b + tc * se) * 10], cambioTotal: b * anios, aniosNecesarios: nNec,
      inicio: pts[0], fin: pts[n - 1] };
  }
  function veredicto(r) {
    const p = Math.max(r.pT, r.pMK);
    if (r.pT < 0.01 && r.pMK < 0.01) return { clave: "muy", texto: "Muy significativa", p };
    if (r.pT < 0.05 && r.pMK < 0.05) return { clave: "si", texto: "Significativa", p };
    if (Math.min(r.pT, r.pMK) < 0.1) return { clave: "indicio", texto: "Indicio, aún no concluyente", p };
    return { clave: "no", texto: "No significativa", p };
  }
  return { analizar, veredicto };
})();
if (typeof module !== "undefined") module.exports = Stats;
