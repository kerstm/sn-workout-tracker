import ExtensionsAPI from 'sn-extension-api';
import './style.css';

// --- Markdown parsing/serialization ---

function parseLog(text) {
  if (!text) return [];
  const rows = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|/);
    if (match) {
      rows.push({ date: match[1], exercise: match[2].trim(), reps: parseInt(match[3]) });
    }
  }
  return rows;
}

function pad(str, len) {
  const s = String(str);
  return s + ' '.repeat(Math.max(0, len - s.length));
}

function serializeMarkdown(rows) {
  if (rows.length === 0) {
    return '# Workouts\n\n## Log\n\n| Date       | Exercise | Reps |\n| ---------- | -------- | ---- |\n';
  }

  const exW = Math.max(8, ...rows.map(r => r.exercise.length));
  const repW = Math.max(4, ...rows.map(r => String(r.reps).length));

  let md = '# Workouts\n\n## Log\n\n';
  md += `| ${pad('Date', 10)} | ${pad('Exercise', exW)} | ${pad('Reps', repW)} |\n`;
  md += `| ${'-'.repeat(10)} | ${'-'.repeat(exW)} | ${'-'.repeat(repW)} |\n`;
  for (const r of rows) {
    md += `| ${pad(r.date, 10)} | ${pad(r.exercise, exW)} | ${pad(String(r.reps), repW)} |\n`;
  }
  return md;
}

// --- State ---

let log = [];
let editorKit = null;

// --- Helpers ---

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getExercises() {
  const ex = new Set(log.map(r => r.exercise));
  return [...ex].sort();
}

function computeStats() {
  const totalReps = log.reduce((s, r) => s + r.reps, 0);
  const uniqueDays = new Set(log.map(r => r.date)).size;
  return { totalReps, uniqueDays, totalSets: log.length };
}

// --- Rendering ---

function renderExerciseOptions() {
  const select = document.getElementById('exercise-select');
  const exercises = getExercises();
  select.innerHTML = exercises.map(e => `<option value="${e}">${e}</option>`).join('');
}

function renderStats() {
  const { totalReps, uniqueDays, totalSets } = computeStats();
  document.getElementById('stats').innerHTML =
    `<span>${totalSets} sets</span><span>${totalReps.toLocaleString()} reps</span><span>${uniqueDays} days</span>`;
}

function renderLog() {
  const tbody = document.querySelector('#log-table tbody');
  let lastDate = null;

  tbody.innerHTML = log.map((r, i) => {
    const isNewDate = r.date !== lastDate;
    lastDate = r.date;
    return `
      <tr class="${isNewDate && i > 0 ? 'date-group' : ''}">
        <td>${isNewDate ? r.date : ''}</td>
        <td>${r.exercise}</td>
        <td class="reps-cell">${r.reps}</td>
        <td><button class="btn btn-small btn-danger" data-action="delete" data-index="${i}">x</button></td>
      </tr>
    `;
  }).join('');
}

function render() {
  renderLog();
  renderStats();
  renderExerciseOptions();
}

// --- Save ---

function save() {
  const text = serializeMarkdown(log);
  if (editorKit) {
    editorKit.text = text;
  }
}

// --- Events ---

function setupEvents() {
  const addBtn = document.getElementById('add-workout-btn');
  const form = document.getElementById('add-workout-form');

  addBtn.addEventListener('click', () => {
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    document.getElementById('workout-date').value = todayStr();
    renderExerciseOptions();
  });

  document.getElementById('cancel-workout').addEventListener('click', () => {
    form.style.display = 'none';
  });

  document.getElementById('save-workout').addEventListener('click', () => {
    const date = document.getElementById('workout-date').value;
    const newEx = document.getElementById('new-exercise').value.trim();
    const exercise = newEx || document.getElementById('exercise-select').value;
    const reps = parseInt(document.getElementById('workout-reps').value);

    if (!date || !exercise || !reps) return;

    log.unshift({ date, exercise, reps });
    document.getElementById('new-exercise').value = '';
    document.getElementById('workout-reps').value = '';
    form.style.display = 'none';
    render();
    save();
  });

  document.getElementById('log-table').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const idx = parseInt(btn.dataset.index);

    if (btn.dataset.action === 'delete') {
      log.splice(idx, 1);
      render();
      save();
    }
  });
}

// --- Init ---

function initExtension() {
  editorKit = ExtensionsAPI;
  editorKit.initialize();

  editorKit.subscribe((text) => {
    log = parseLog(text || '');
    render();
  });
}

function initDemo() {
  const demoText = `# Workouts

## Log

| Date       | Exercise | Reps |
| ---------- | -------- | ---- |
| 2025-01-03 | Pushups  | 30   |
| 2025-01-02 | Squats   | 50   |
| 2025-01-01 | Pushups  | 25   |
`;
  log = parseLog(demoText);
  render();
}

setupEvents();

if (window.parent !== window) {
  initExtension();
} else {
  initDemo();
}
