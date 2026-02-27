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
  const year = new Date().getFullYear();
  const yearLog = log.filter(r => r.date.startsWith(String(year)));
  const totalReps = yearLog.reduce((s, r) => s + r.reps, 0);
  const uniqueDays = new Set(yearLog.map(r => r.date)).size;

  // Current streak: consecutive days with workouts going back from today
  const workoutDates = new Set(log.map(r => r.date));
  let streak = 0;
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  while (true) {
    const ds = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    if (workoutDates.has(ds)) {
      streak++;
      d.setDate(d.getDate() - 1);
    } else {
      break;
    }
  }

  return { totalReps, uniqueDays, totalSets: yearLog.length, streak, year };
}

// --- Rendering ---

function renderExerciseOptions() {
  const select = document.getElementById('exercise-select');
  const exercises = getExercises();
  select.innerHTML = exercises.map(e => `<option value="${e}">${e}</option>`).join('');
}

function renderStats() {
  const { totalReps, uniqueDays, totalSets, streak, year } = computeStats();
  document.getElementById('stats').innerHTML =
    `<span>📊 ${year} Stats</span>` +
    `<span>🔥 Streak: ${streak} day(s)</span>` +
    `<span>📅 Workout Days: ${uniqueDays}</span>` +
    `<span>💪 Total Exercises: ${totalSets}</span>` +
    `<span>🔢 Total Reps: ${totalReps.toLocaleString()}</span>`;
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

function renderHeatmap() {
  const container = document.getElementById('heatmap');
  const year = new Date().getFullYear();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Build date -> total reps map
  const repsMap = {};
  for (const r of log) {
    repsMap[r.date] = (repsMap[r.date] || 0) + r.reps;
  }

  const maxReps = Math.max(0, ...Object.values(repsMap));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from the Monday on or before Jan 1
  const jan1 = new Date(year, 0, 1);
  const jan1Day = (jan1.getDay() + 6) % 7; // 0=Mon
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

  // Day labels
  html += '<div class="heatmap-labels">';
  html += '<div class="heatmap-month-spacer"></div>';
  html += '<div></div><div>Mon</div><div></div><div>Wed</div><div></div><div>Fri</div><div></div>';
  html += '</div>';

  let lastMonth = -1;

  for (let w = 0; w < weeks; w++) {
    // Determine month label for this week
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

      const reps = repsMap[dateStr] || 0;
      const outsideYear = cellDate.getFullYear() !== year;
      const level = maxReps === 0 || outsideYear ? 0 :
        reps === 0 ? 0 :
        reps <= maxReps * 0.25 ? 1 :
        reps <= maxReps * 0.5 ? 2 :
        reps <= maxReps * 0.75 ? 3 : 4;

      const hidden = cellDate > today || outsideYear;
      html += `<div class="heatmap-cell${hidden ? ' future' : ''}" data-level="${level}" title="${dateStr}: ${reps} reps"></div>`;
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
