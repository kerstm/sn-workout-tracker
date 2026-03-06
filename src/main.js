import ExtensionsAPI from 'sn-extension-api';
import './style.css';

// --- Markdown parsing/serialization ---

function parseLog(text) {
  if (!text) return [];
  const rows = [];
  for (const line of text.split('\n')) {
    // 4-column format: Date | Exercise | Value | Unit
    const match4 = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|\s*(\w+)\s*\|/);
    if (match4) {
      rows.push({ date: match4[1], exercise: match4[2].trim(), value: parseInt(match4[3]), unit: match4[4].trim() });
      continue;
    }
    // 3-column format (legacy): Date | Exercise | Reps
    const match3 = line.match(/^\|\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*\|\s*(\d+)\s*\|/);
    if (match3) {
      rows.push({ date: match3[1], exercise: match3[2].trim(), value: parseInt(match3[3]), unit: 'reps' });
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
    return '# Workouts\n\n## Log\n\n| Date       | Exercise | Value | Unit |\n| ---------- | -------- | ----- | ---- |\n';
  }

  const exW = Math.max(8, ...rows.map(r => r.exercise.length));
  const valW = Math.max(5, ...rows.map(r => String(r.value).length));
  const unitW = Math.max(4, ...rows.map(r => r.unit.length));

  let md = '# Workouts\n\n## Log\n\n';
  md += `| ${pad('Date', 10)} | ${pad('Exercise', exW)} | ${pad('Value', valW)} | ${pad('Unit', unitW)} |\n`;
  md += `| ${'-'.repeat(10)} | ${'-'.repeat(exW)} | ${'-'.repeat(valW)} | ${'-'.repeat(unitW)} |\n`;
  for (const r of rows) {
    md += `| ${pad(r.date, 10)} | ${pad(r.exercise, exW)} | ${pad(String(r.value), valW)} | ${pad(r.unit, unitW)} |\n`;
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

function formatValue(value, unit) {
  if (unit === 'sec') return value + 's';
  if (unit === 'min') return value + 'm';
  return String(value);
}

function computeStats() {
  const year = new Date().getFullYear();
  const yearLog = log.filter(r => r.date.startsWith(String(year)));
  const totalReps = yearLog.filter(r => r.unit === 'reps').reduce((s, r) => s + r.value, 0);
  const totalSec = yearLog.filter(r => r.unit === 'sec').reduce((s, r) => s + r.value, 0)
    + yearLog.filter(r => r.unit === 'min').reduce((s, r) => s + r.value * 60, 0);
  const uniqueDays = new Set(yearLog.map(r => r.date)).size;

  // Current streak
  const workoutDates = new Set(log.map(r => r.date));
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const todayStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  if (!workoutDates.has(todayStr)) {
    d.setDate(d.getDate() - 1);
  }
  while (true) {
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (workoutDates.has(ds)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return { totalReps, totalSec, uniqueDays, totalSets: yearLog.length, streak, year };
}

// --- Rendering ---

function renderExerciseOptions() {
  const select = document.getElementById('exercise-select');
  const exercises = getExercises();
  select.innerHTML = exercises.map(e => `<option value="${e}">${e}</option>`).join('');
}

function renderStats() {
  const { totalReps, totalSec, uniqueDays, totalSets, streak, year } = computeStats();
  let html =
    `<span>📊 ${year} Stats</span>` +
    `<span>🔥 Streak: ${streak} day(s)</span>` +
    `<span>📅 Workout Days: ${uniqueDays}</span>` +
    `<span>💪 Total Sets: ${totalSets}</span>`;
  if (totalReps > 0) {
    html += `<span>🔢 Total Reps: ${totalReps.toLocaleString()}</span>`;
  }
  if (totalSec > 0) {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    html += `<span>⏱ Total Time: ${mins}m${secs > 0 ? ` ${secs}s` : ''}</span>`;
  }
  document.getElementById('stats').innerHTML = html;
}

function renderLog() {
  const tbody = document.querySelector('#log-table tbody');
  let lastDate = null;
  let lastExercise = null;
  let setNum = 0;

  tbody.innerHTML = log.map((r, i) => {
    const isNewDate = r.date !== lastDate;
    const isNewGroup = isNewDate || r.exercise !== lastExercise;
    if (isNewGroup) setNum = 1; else setNum++;
    lastDate = r.date;
    lastExercise = r.exercise;

    // Look ahead to see if this exercise has multiple sets
    let groupSize = 1;
    for (let j = i + 1; j < log.length; j++) {
      if (log[j].date === r.date && log[j].exercise === r.exercise) groupSize++;
      else break;
    }
    const showSet = groupSize > 1 || setNum > 1;

    return `
      <tr class="${isNewDate && i > 0 ? 'date-group' : ''}${isNewGroup && !isNewDate ? ' exercise-group' : ''}">
        <td>${isNewDate ? r.date : ''}</td>
        <td>${isNewGroup ? r.exercise : ''}</td>
        <td class="value-cell">${showSet ? `<span class="set-label">S${setNum}</span> ` : ''}${formatValue(r.value, r.unit)}</td>
        <td><button class="btn btn-small btn-danger" data-action="delete" data-index="${i}">x</button></td>
      </tr>
    `;
  }).join('');
}

function renderHeatmap() {
  const container = document.getElementById('heatmap');
  const year = new Date().getFullYear();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Build date -> total sets map
  const setsMap = {};
  for (const r of log) {
    setsMap[r.date] = (setsMap[r.date] || 0) + 1;
  }

  const maxSets = Math.max(0, ...Object.values(setsMap));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from the Monday on or before Jan 1
  const jan1 = new Date(year, 0, 1);
  const jan1Day = (jan1.getDay() + 6) % 7;
  const startDate = new Date(jan1);
  startDate.setDate(startDate.getDate() - jan1Day);

  // End on the Sunday on or after Dec 31
  const dec31 = new Date(year, 11, 31);
  const dec31Day = (dec31.getDay() + 6) % 7;
  const endDate = new Date(dec31);
  endDate.setDate(endDate.getDate() + (6 - dec31Day));

  const totalDays = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24)) + 1;
  const weeks = Math.ceil(totalDays / 7);

  let html = '<div class="heatmap-grid">';

  html += '<div class="heatmap-labels">';
  html += '<div class="heatmap-month-spacer"></div>';
  html += '<div></div><div>Mon</div><div></div><div>Wed</div><div></div><div>Fri</div><div></div>';
  html += '</div>';

  let lastMonth = -1;

  for (let w = 0; w < weeks; w++) {
    let monthLabel = '';
    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(startDate);
      cellDate.setDate(cellDate.getDate() + w * 7 + d);
      const m = cellDate.getMonth();
      if (cellDate.getDate() <= 7 && m !== lastMonth && cellDate.getFullYear() === year) {
        monthLabel = months[m];
        lastMonth = m;
        break;
      }
    }

    html += '<div class="heatmap-week">';
    html += `<div class="heatmap-month-label">${monthLabel}</div>`;

    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(startDate);
      cellDate.setDate(cellDate.getDate() + w * 7 + d);
      const dateStr = cellDate.getFullYear() + '-' +
        String(cellDate.getMonth() + 1).padStart(2, '0') + '-' +
        String(cellDate.getDate()).padStart(2, '0');

      const sets = setsMap[dateStr] || 0;
      const outsideYear = cellDate.getFullYear() !== year;
      const level = maxSets === 0 || outsideYear ? 0 :
        sets === 0 ? 0 :
        sets <= maxSets * 0.25 ? 1 :
        sets <= maxSets * 0.5 ? 2 :
        sets <= maxSets * 0.75 ? 3 : 4;

      const hidden = cellDate > today || outsideYear;
      html += `<div class="heatmap-cell${hidden ? ' future' : ''}" data-level="${level}" title="${dateStr}: ${sets} set(s)"></div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

function render() {
  renderLog();
  renderStats();
  renderExerciseOptions();
  renderHeatmap();
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

  function saveEntry() {
    const date = document.getElementById('workout-date').value;
    const newEx = document.getElementById('new-exercise').value.trim();
    const exercise = newEx || document.getElementById('exercise-select').value;
    const value = parseInt(document.getElementById('workout-value').value);
    const unit = document.getElementById('workout-unit').value;

    if (!date || !exercise || !value) return;

    log.unshift({ date, exercise, value, unit });
    document.getElementById('new-exercise').value = '';
    document.getElementById('workout-value').value = '';
    render();
    save();
  }

  document.getElementById('save-workout').addEventListener('click', () => {
    saveEntry();
    document.getElementById('add-workout-form').style.display = 'none';
  });

  document.getElementById('save-and-add').addEventListener('click', () => {
    saveEntry();
    // Keep form open, clear only value for next set
    document.getElementById('workout-value').value = '';
    document.getElementById('workout-value').focus();
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

| Date       | Exercise | Value | Unit |
| ---------- | -------- | ----- | ---- |
| 2025-01-03 | Pushups  | 30    | reps |
| 2025-01-03 | Pushups  | 25    | reps |
| 2025-01-03 | Plank    | 60    | sec  |
| 2025-01-02 | Squats   | 50    | reps |
| 2025-01-02 | Running  | 30    | min  |
| 2025-01-01 | Pushups  | 25    | reps |
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
