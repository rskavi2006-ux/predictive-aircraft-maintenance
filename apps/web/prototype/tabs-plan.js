// Plan, Work orders and Compliance tabs.
(function () {
  const fmt = (d) => (d ? new Date(d).toLocaleString() : '');
  const pad = (n) => String(n).padStart(2, '0');
  const localInput = (d) =>
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  const role = () => state.user.role;
  const val = (el, sel) => el.querySelector(sel).value;

  async function drawPlan(el) {
    const [pending, aircraft, preview, wins] = await Promise.all([
      api('GET', '/tasks?status=PENDING&limit=100'),
      api('GET', '/aircraft?limit=100'),
      api('POST', '/scheduling/preview', {}),
      api('GET', '/scheduling/windows?limit=50'),
    ]);
    const reg = {};
    aircraft.data.forEach((a) => { reg[a._id] = a.registration; });
    const counts = {};
    pending.data.forEach((t) => { counts[t.aircraftId] = (counts[t.aircraftId] || 0) + 1; });
    const options = aircraft.data
      .slice()
      .sort((a, b) => (counts[b._id] || 0) - (counts[a._id] || 0) || a.registration.localeCompare(b.registration))
      .map((a) => '<option value="' + esc(a._id) + '">' + esc(a.registration) + (counts[a._id] ? ' (' + counts[a._id] + ' pending)' : '') + '</option>')
      .join('');

    const pendingCard = '<div class="card"><h3>Pending tasks</h3>' +
      (pending.data.length
        ? '<table><tr><th>Aircraft</th><th>Task</th><th>Licence</th><th>Hours</th><th>Due</th><th>Priority</th></tr>' +
          pending.data.map((t) => '<tr><td>' + esc(reg[t.aircraftId] || '') + '</td><td>' + esc(t.title) + '</td><td>' + esc(t.requiredLicense) + '</td><td>' +
            esc(t.estimatedDurationHours) + '</td><td>' + esc(fmt(t.estimatedDueDate)) + '</td><td><span class="tag p-' + esc(t.priority) + '">' + esc(t.priority) + '</span></td></tr>').join('') + '</table>'
        : '<p class="muted">No pending tasks. An Engineer approves an alert, or add a programme task below.</p>') + '</div>';

    const canTask = role() === 'PLANNER' || role() === 'ENGINEER';
    const taskCard = canTask
      ? '<div class="card"><h3>Add programme task</h3>' +
        '<label>Aircraft</label><select id="t-ac">' + options + '</select>' +
        '<label>Title</label><input id="t-title" value="Scheduled filter check">' +
        '<label>ATA chapter</label><input id="t-ata" type="number" value="29">' +
        '<label>Licence needed</label><select id="t-lic"><option>B1</option><option>B2</option></select>' +
        '<label>Duration (hours)</label><input id="t-dur" type="number" min="1" value="3">' +
        '<label>Due in (days)</label><input id="t-due" type="number" min="1" value="10">' +
        '<div class="actions"><button type="button" class="ok" id="t-add">Add task</button></div></div>'
      : '';
    const windowCard = role() === 'PLANNER'
      ? '<div class="card"><h3>Create maintenance window</h3>' +
        '<label>Aircraft</label><select id="w-ac">' + options + '</select>' +
        '<label>Type</label><select id="w-type"><option>BASE</option><option>LINE</option><option>AOG</option></select>' +
        '<label>Station</label><input id="w-st" value="MAA">' +
        '<label>Start</label><input id="w-start" type="datetime-local" value="' + localInput(new Date(Date.now() + 6 * 3600000)) + '">' +
        '<label>Window length (hours)</label><input id="w-len" type="number" min="1" value="14">' +
        '<label>Capacity (hours of work)</label><input id="w-cap" type="number" min="1" value="12">' +
        '<div class="actions"><button type="button" class="ok" id="w-create">Create window</button></div></div>'
      : '<div class="card"><p class="muted">Only a Planner can create and confirm windows (you are ' + esc(role()) + ').</p></div>';

    const itemHtml = (item) =>
      '<div class="row" style="cursor:default"><b>' + esc(item.registration) + '</b> ' +
      esc(item.window ? item.window.type + ' at ' + item.window.station + ', starts ' + fmt(item.window.start) : '') +
      '<span class="tag">' + item.hoursUsed + 'h of ' + item.capacityHours + 'h</span>' +
      '<span class="tag">Downtime saved: ' + item.downtimeSavedHours + 'h</span><ul>' +
      item.tasks.map((t) => '<li>' + esc(t.title) + ' (' + t.durationHours + 'h, due ' + esc(fmt(t.dueDate)) + ')</li>').join('') + '</ul>' +
      (item.notes || []).map((n) => '<p class="muted">' + esc(n) + '</p>').join('') +
      (role() === 'PLANNER' ? '<button type="button" class="ok" data-confirm="' + esc(item.windowId) + '">Confirm window</button>' : '') + '</div>';
    const previewCard = '<div class="card"><h3>Plan preview</h3>' +
      '<p class="muted">Nothing is scheduled until a Planner confirms. Setup time per window is assumed to be ' + preview.overheadHours + 'h.</p>' +
      (preview.items.length ? preview.items.map(itemHtml).join('') : '<p class="muted">Nothing can be planned yet. Create a window that starts before a task is due.</p>') +
      preview.unscheduled.map((u) => '<div class="row" style="cursor:default"><b>' + esc(u.title) + '</b><span class="tag">' + esc(u.reason) + '</span><p class="muted">' + esc(u.message) + '</p></div>').join('') +
      '<p><b>Total downtime saved: ' + preview.totals.downtimeSavedHours + 'h</b> for ' + preview.totals.tasksScheduled + ' task(s) in ' + preview.totals.windowsUsed + ' window(s)</p></div>';

    const winCard = '<div class="card"><h3>Maintenance windows</h3>' +
      (wins.data.length
        ? '<table><tr><th>Aircraft</th><th>Type</th><th>Station</th><th>Starts</th><th>Booked</th><th>Status</th><th></th></tr>' +
          wins.data.map((w) => '<tr><td>' + esc(w.registration) + '</td><td>' + esc(w.type) + '</td><td>' + esc(w.station) + '</td><td>' + esc(fmt(w.start)) + '</td><td>' +
            w.bookedHours + 'h of ' + w.capacityHours + 'h</td><td>' + esc(w.status) + '</td><td>' +
            (role() === 'PLANNER' && w.status === 'PLANNED' && !w.bookedHours ? '<button type="button" class="no" data-cancel="' + esc(w._id) + '">Cancel</button>' : '') + '</td></tr>').join('') + '</table>'
        : '<p class="muted">No windows yet.</p>') + '</div>';

    el.innerHTML = pendingCard + '<div class="cols">' + taskCard + windowCard + '</div>' + previewCard + winCard;

    const done = async (msg) => { await drawPlan(el); notify(msg, false); };
    const fail = (e) => notify(e.message, true);

    const addBtn = el.querySelector('#t-add');
    if (addBtn) addBtn.onclick = async () => {
      try {
        const due = new Date(Date.now() + Number(val(el, '#t-due')) * 86400000);
        await api('POST', '/tasks', {
          aircraftId: val(el, '#t-ac'), sourceType: 'PROGRAMME', title: val(el, '#t-title').trim(), ataChapter: Number(val(el, '#t-ata')),
          requiredLicense: val(el, '#t-lic'), estimatedDurationHours: Number(val(el, '#t-dur')), dueLimit: { date: due.toISOString() }, priority: 'MEDIUM',
        });
        await done('Task added');
      } catch (e) { fail(e); }
    };

    const createBtn = el.querySelector('#w-create');
    if (createBtn) createBtn.onclick = async () => {
      try {
        const start = new Date(val(el, '#w-start'));
        if (isNaN(start.getTime())) throw new Error('Choose a start date and time');
        const end = new Date(start.getTime() + Number(val(el, '#w-len')) * 3600000);
        await api('POST', '/scheduling/windows', {
          aircraftId: val(el, '#w-ac'), type: val(el, '#w-type'), station: val(el, '#w-st').trim(),
          start: start.toISOString(), end: end.toISOString(), capacityHours: Number(val(el, '#w-cap')),
        });
        await done('Window created');
      } catch (e) { fail(e); }
    };

    el.querySelectorAll('[data-confirm]').forEach((b) => {
      b.onclick = async () => {
        try {
          const r = await api('POST', '/scheduling/confirm', { windowId: b.dataset.confirm });
          await done('Confirmed. Work order ' + r.workOrder.number + ' created, downtime saved ' + r.plan.downtimeSavedHours + 'h');
        } catch (e) { fail(e); }
      };
    });
    el.querySelectorAll('[data-cancel]').forEach((b) => {
      b.onclick = async () => {
        try {
          await api('POST', '/scheduling/windows/' + b.dataset.cancel + '/cancel');
          await done('Window cancelled');
        } catch (e) { fail(e); }
      };
    });
  }

  registerTab({ id: 'plan', label: 'Plan', render: drawPlan });

  registerTab({
    id: 'workorders',
    label: 'Work orders',
    async render(el) {
      async function load(selectId) {
        const r = await api('GET', '/work-orders?limit=50');
        el.innerHTML = '<div class="cols"><div class="card"><h3>Work orders</h3>' +
          (r.data.length
            ? r.data.map((w) => '<div class="row" data-wo="' + esc(w._id) + '"><b>' + esc(w.number) + '</b> ' + esc(w.registration) +
                '<span class="tag">' + esc(w.status) + '</span><span class="tag">' + w.taskIds.length + ' task(s)</span></div>').join('')
            : '<p class="muted">No work orders yet. A Planner creates one by confirming a window in the Plan tab.</p>') +
          '</div><div class="card" id="wo-detail"><p class="muted">Select a work order.</p></div></div>';
        el.querySelectorAll('[data-wo]').forEach((row) => {
          row.onclick = () => {
            el.querySelectorAll('.row').forEach((x) => x.classList.remove('sel'));
            row.classList.add('sel');
            detail(r.data.find((w) => w._id === row.dataset.wo));
          };
        });
        if (selectId) {
          const hit = el.querySelector('[data-wo="' + selectId + '"]');
          if (hit) hit.click();
        }
      }

      async function detail(wo) {
        const box = el.querySelector('#wo-detail');
        const all = await api('GET', '/tasks?aircraftId=' + wo.aircraftId + '&limit=100');
        const tasks = all.data.filter((t) => wo.taskIds.indexOf(t._id) >= 0);
        const need = Array.from(new Set(tasks.map((t) => t.requiredLicense))).join(' and ');
        const me = state.user;
        const isEng = me.role === 'ENGINEER';
        let controls;
        if (!isEng) {
          controls = '<p class="muted">Only an Engineer can start and sign off work (you are ' + esc(me.role) + ').</p>';
        } else if (wo.status === 'OPEN') {
          controls = '<div class="actions"><button type="button" class="ok" data-a="start">Start work order</button></div>';
        } else if (wo.status === 'IN_PROGRESS') {
          controls = '<input id="finding" placeholder="Finding (for example: minor corrosion treated)">' +
            '<div class="actions"><button type="button" data-a="finding">Add finding</button></div>' +
            '<input id="remarks" placeholder="Release remarks (optional)">' +
            '<div class="actions"><button type="button" class="ok" data-a="sign-off">Sign off (CRS)</button></div>' +
            '<p class="muted">Sign-off needs a ' + esc(need) + ' licence. You are ' + esc(me.licenseCategory || 'not licensed') + '.</p>';
        } else {
          controls = '<p class="t-good"><b>Signed off</b> ' + esc(fmt(wo.signedOffAt)) + '</p>';
        }
        box.innerHTML = '<h3>' + esc(wo.number) + ' &middot; ' + esc(wo.registration) + '<span class="tag">' + esc(wo.status) + '</span></h3>' +
          '<table><tr><th>Task</th><th>Licence</th><th>Status</th></tr>' +
          tasks.map((t) => '<tr><td>' + esc(t.title) + '</td><td>' + esc(t.requiredLicense) + '</td><td>' + esc(t.status) + '</td></tr>').join('') + '</table>' +
          '<h4>Findings</h4>' +
          ((wo.findings || []).length ? '<ul>' + wo.findings.map((f) => '<li>' + esc(f.text) + ' <span class="muted">' + esc(fmt(f.at)) + '</span></li>').join('') + '</ul>' : '<p class="muted">None recorded.</p>') +
          controls;
        const act = async (path, body, okMsg) => {
          try {
            await api('POST', '/work-orders/' + wo._id + '/' + path, body);
            await load(wo._id);
            notify(okMsg, false);
          } catch (e) { notify(e.message, true); }
        };
        box.querySelectorAll('[data-a]').forEach((b) => {
          b.onclick = () => {
            const a = b.dataset.a;
            if (a === 'start') return act('start', {}, 'Work order started');
            if (a === 'finding') return act('findings', { text: box.querySelector('#finding').value.trim() }, 'Finding recorded');
            const remarks = box.querySelector('#remarks').value.trim();
            return act('sign-off', remarks ? { remarks } : {}, 'Signed off. Tasks are DONE and compliance records are COMPLIED.');
          };
        });
      }

      await load();
    },
  });

  registerTab({
    id: 'compliance',
    label: 'Compliance',
    async render(el) {
      const [sum, list] = await Promise.all([api('GET', '/compliance/summary'), api('GET', '/compliance?limit=100')]);
      const tile = (label, n, cls) => '<div class="tile ' + cls + '"><span class="muted">' + label + '</span><span class="big">' + n + '</span></div>';
      const cls = { COMPLIED: 't-good', OVERDUE: 't-bad', OPEN: '' };
      el.innerHTML = '<div class="tiles">' + tile('Complied', sum.complied, 'good') + tile('Open', sum.open, '') +
        tile('Due within ' + sum.dueSoonDays + ' days', sum.dueSoon, 'warn') + tile('Overdue', sum.overdue, 'bad') + '</div>' +
        '<div class="card"><h3>Compliance records</h3>' +
        (list.data.length
          ? '<table><tr><th>Reference</th><th>Item</th><th>Kind</th><th>Due</th><th>Status</th></tr>' +
            list.data.map((c) => '<tr><td>' + esc(c.reference) + '</td><td>' + esc(c.title || '') + '</td><td>' + esc(c.kind) + '</td><td>' + esc(fmt(c.dueDate)) +
              '</td><td class="' + (cls[c.status] || '') + '">' + esc(c.status) + '</td></tr>').join('') + '</table>'
          : '<p class="muted">No records yet. Records are created for every active task by the daily check, and when work is signed off.</p>') +
        ((role() === 'ADMIN' || role() === 'PLANNER') ? '<div class="actions"><button type="button" id="runcheck">Run compliance check now</button></div>' : '') + '</div>';
      const b = el.querySelector('#runcheck');
      if (b) b.onclick = async () => {
        try {
          const r = await api('POST', '/compliance/run-check', {});
          await tabRender();
          notify('Check done: created ' + r.created + ', marked overdue ' + r.markedOverdue + ', due soon ' + r.dueSoon.length, false);
        } catch (e) { notify(e.message, true); }
      };
      async function tabRender() { await TABS.find((t) => t.id === 'compliance').render(el); }
    },
  });
})();