// Predict tabs: fleet health and alerts (with the engineer decision).
(function () {
  const band = (s) => (s >= 70 ? 'good' : s >= 40 ? 'warn' : 'bad');
  const pct = (x) => Math.round((x || 0) * 100) + '%';

  function chart(points, metric, limit) {
    const vals = points.map((p) => p[metric]).filter((v) => typeof v === 'number');
    if (vals.length < 2) return '<p class="muted">Not enough readings to draw a trend.</p>';
    const all = limit === undefined ? vals : vals.concat([limit]);
    const lo = Math.min.apply(null, all);
    const hi = Math.max.apply(null, all);
    const span = hi - lo || 1;
    const W = 520, H = 140, pad = 6;
    const x = (i) => pad + (i * (W - 2 * pad)) / (vals.length - 1);
    const y = (v) => H - pad - ((v - lo) / span) * (H - 2 * pad);
    const line = vals.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const lim = limit === undefined ? '' :
      '<line x1="' + pad + '" x2="' + (W - pad) + '" y1="' + y(limit) + '" y2="' + y(limit) + '" stroke="#ef4444" stroke-dasharray="5 4"/>' +
      '<text x="' + (W - pad) + '" y="' + (y(limit) - 4) + '" fill="#ef4444" font-size="11" text-anchor="end">limit ' + limit + '</text>';
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="' + esc(metric) + ' trend">' +
      '<path d="' + line + '" fill="none" stroke="#38bdf8" stroke-width="2"/>' + lim + '</svg>' +
      '<div class="muted">' + esc(metric) + ': ' + vals[0].toFixed(1) + ' to ' + vals[vals.length - 1].toFixed(1) + ' over ' + vals.length + ' readings</div>';
  }

  async function showAircraft(el, id) {
    el.textContent = 'Loading...';
    try {
      const r = await api('GET', '/health-scores/aircraft/' + id);
      el.innerHTML = '<div class="card"><table><tr><th>Component</th><th>Health</th><th>Failure probability</th><th>Remaining life</th><th>Why</th></tr>' +
        r.data.map((s) =>
          '<tr><td>' + esc(s.name) + '</td><td class="t-' + band(s.healthScore) + '"><b>' + s.healthScore + '</b></td><td>' + pct(s.failureProbability) +
          '</td><td>' + (s.rulDays === null || s.rulDays === undefined ? 'n/a' : esc(s.rulDays) + ' days') + '</td><td>' +
          ((s.contributingFactors || []).map((f) => esc(f.note)).join('; ') || 'Nominal') + '</td></tr>').join('') +
        '</table></div>';
    } catch (e) {
      el.innerHTML = '<p class="err">' + esc(e.message) + '</p>';
    }
  }

  registerTab({
    id: 'fleet',
    label: 'Fleet health',
    async render(el) {
      const r = await api('GET', '/health-scores/fleet');
      if (!r.data.length) {
        el.innerHTML = '<p>No telemetry yet. In a terminal run <code>npm run simulate -w @aeroguard/simulator</code>.</p>';
        return;
      }
      el.innerHTML = '<div class="tiles">' + r.data.map((a) =>
        '<button type="button" class="tile ' + band(a.minHealth) + '" data-id="' + esc(a.aircraftId) + '"><b>' + esc(a.registration) +
        '</b><span class="big">' + a.minHealth + '</span><span class="muted">' + a.atRisk + ' of ' + a.componentsScored + ' components at risk</span></button>').join('') +
        '</div><div id="aircraft-detail"><p class="muted">Select an aircraft to see its components.</p></div>';
      el.querySelectorAll('[data-id]').forEach((b) => {
        b.onclick = () => showAircraft(el.querySelector('#aircraft-detail'), b.dataset.id);
      });
    },
  });

  registerTab({
    id: 'alerts',
    label: 'Alerts',
    async render(el) {
      const row = (a) =>
        '<div class="row" data-alert="' + esc(a._id) + '"><b>' + esc(a.registration) + '</b> ' + esc(a.componentName) +
        '<span class="tag p-' + esc(a.priority) + '">' + esc(a.priority) + '</span><span class="tag">' + esc(a.status) + '</span></div>';

      async function load(selectId) {
        const r = await api('GET', '/alerts?limit=50');
        el.innerHTML = '<div class="cols"><div class="card"><h3>Alert queue</h3>' +
          (r.data.length ? r.data.map(row).join('') : '<p class="muted">No alerts yet.</p>') +
          '</div><div class="card" id="alert-detail"><p class="muted">Select an alert.</p></div></div>';
        el.querySelectorAll('[data-alert]').forEach((rowEl) => {
          rowEl.onclick = () => {
            el.querySelectorAll('.row').forEach((x) => x.classList.remove('sel'));
            rowEl.classList.add('sel');
            detail(r.data.find((a) => a._id === rowEl.dataset.alert));
          };
        });
        if (selectId) {
          const hit = el.querySelector('[data-alert="' + selectId + '"]');
          if (hit) hit.click();
        }
      }

      async function detail(a) {
        const box = el.querySelector('#alert-detail');
        const top = (a.contributingFactors || [])[0];
        let trend = '';
        try {
          const t = await api('GET', '/telemetry?componentId=' + a.componentId + '&maxPoints=80');
          trend = chart(t.points, top ? top.metric : 'vibration', top ? top.critical : undefined);
        } catch (e) {
          trend = '';
        }
        const undecided = a.status === 'OPEN' || a.status === 'DEFERRED';
        const canDecide = state.user.role === 'ENGINEER' && undecided;
        box.innerHTML = '<h3>Why this alert fired</h3><p><b>' + esc(a.registration) + ' ' + esc(a.componentName) + '</b>: health ' + a.healthScore +
          ', failure probability ' + pct(a.failureProbability) + ', remaining life ' + (a.rulDays === null || a.rulDays === undefined ? 'n/a' : esc(a.rulDays) + ' days') +
          ', confidence ' + pct(a.confidence) + '</p><ul>' +
          (a.contributingFactors || []).map((f) => '<li>' + esc(f.note) + '</li>').join('') + '</ul>' + trend +
          (canDecide
            ? '<input id="note" placeholder="Engineer note (required)"><div class="actions">' +
              '<button type="button" class="ok" data-d="approve">Approve</button>' +
              '<button type="button" class="def" data-d="defer">Defer</button>' +
              '<button type="button" class="no" data-d="reject">Reject</button></div>'
            : '<p class="muted">' + (undecided
                ? 'Only an Engineer can decide alerts (you are ' + esc(state.user.role) + ').'
                : 'Decided: ' + esc(a.status) + (a.decisionNote ? '. Note: ' + esc(a.decisionNote) : '')) + '</p>');
        box.querySelectorAll('[data-d]').forEach((b) => {
          b.onclick = async () => {
            try {
              const r = await api('POST', '/alerts/' + a._id + '/' + b.dataset.d, { note: box.querySelector('#note').value.trim() });
              await load(a._id);
              notify(r.task
                ? 'Approved. Task created: ' + r.task.title + ' (needs ' + r.task.requiredLicense + ' licence)'
                : 'Alert ' + r.alert.status.toLowerCase(), false);
            } catch (e) {
              notify(e.message, true);
            }
          };
        });
      }

      await load();
    },
  });
})();