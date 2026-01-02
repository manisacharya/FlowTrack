function appState() {
  return {
    view: 'habits', // 'habits' | 'routines'
    categories: [],
    habits: [],
    logsMap: {},
    weekDates: [],
    weekStartYmd: '',
    metrics: { activeHabits: 0, longestStreak: 0 },
    stats: { points: 0, level: 1, xp: 0 },
    badges: [],

    // Forms
    habitForm: { id: null, title: '', frequency: 'daily', color: '#000000', icon: '📝', notification_time: '', notification_enabled: false },
    habitModal: { open: false, isEdit: false },

    routineForm: { id: null, kind: 'morning', text: '' },
    routineModal: { open: false, isEdit: false },

    // UI State
    toasts: [],
    confirmModal: { open: false, message: '', onConfirm: () => { } },
    showCoach: false,
    coachMessage: '',

    // Flow Mode (Focus Timer)
    flowModeOpen: false,
    timerActive: false,
    timerPaused: false,
    timerSeconds: 25 * 60,
    intervalId: null,
    timerPreset: 25,

    // Habit Notes
    noteModal: { open: false, habitId: null, date: '', note: '', habitTitle: '' },

    // Routines
    morningRoutine: [],
    nightRoutine: [],
    routineImage: './assets/routine.jpg',
    routineProgress: { completed: [] },

    // Analytics
    trendChart: null,
    routineChart: null,

    // Calendar
    calendar: { year: new Date().getFullYear(), month: new Date().getMonth(), days: [], activity: [] },

    // Routine History
    routineDate: new Date().toISOString().slice(0, 10),

    async init() {
      await Promise.all([
        this.loadCategories(),
        this.loadHabits(),
        this.loadMetrics(),
        this.loadRoutines(),
        this.loadRoutineProgress(),
        this.loadCoach(),
        this.loadCalendarActivity()
      ]);
      this.resetWeek();
      this.initNotifications();
      this.loadAnalytics();
      this.computeCalendar();
    },

    switchView(v) {
      this.view = v;
      this.$nextTick(() => {
        this.loadAnalytics(); // Re-render charts
      });
    },

    showToast(message, type = 'success') {
      const id = Date.now();
      this.toasts.push({ id, message, type, visible: true });
      if (type === 'success') {
        const audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU');
      }
      setTimeout(() => {
        const t = this.toasts.find(x => x.id === id);
        if (t) t.visible = false;
        setTimeout(() => {
          this.toasts = this.toasts.filter(x => x.id !== id);
        }, 300);
      }, 3000);
    },

    confirmAction(message, callback) {
      this.confirmModal.message = message;
      this.confirmModal.onConfirm = callback;
      this.confirmModal.open = true;
    },

    async loadCategories() {
      const res = await fetch('./api/categories');
      this.categories = await res.json();
    },

    async loadHabits() {
      const res = await fetch('./api/habits');
      this.habits = await res.json();
    },

    async loadMetrics() {
      const res = await fetch('./api/metrics');
      const data = await res.json();
      this.metrics = data;
      this.stats = data.stats || { points: 0, level: 1, xp: 0 };
      this.badges = data.badges || [];
    },

    async loadCoach() {
      const res = await fetch('./api/coach');
      const data = await res.json();
      this.coachMessage = data.message;
    },

    async refreshCoach() {
      this.coachMessage = "Thinking...";
      await this.loadCoach();
    },

    async loadAnalytics() {
      // Fetch data
      const res = await fetch('./api/analytics');
      const data = await res.json();

      // Trend Chart (Habits)
      if (this.view === 'habits') {
        const ctx = document.getElementById('trendChart');
        if (ctx) {
          if (this.trendChart) this.trendChart.destroy();

          const labels = data.map(d => new Date(d.log_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
          const values = data.map(d => d.count);

          // Prediction
          let predicted = [];
          if (values.length > 5) {
            const n = values.length;
            const sumX = n * (n - 1) / 2;
            const sumY = values.reduce((a, b) => a + b, 0);
            const sumXY = values.reduce((a, b, i) => a + b * i, 0);
            const sumXX = (n - 1) * n * (2 * n - 1) / 6;
            const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
            const intercept = (sumY - slope * sumX) / n;
            for (let i = 0; i < 3; i++) predicted.push(Math.max(0, Math.round(slope * (n + i) + intercept)));
          }

          this.trendChart = new Chart(ctx, {
            type: 'line',
            data: {
              labels: [...labels, 'Next 1', 'Next 2', 'Next 3'],
              datasets: [{
                label: 'Habits Completed',
                data: values,
                borderColor: '#18181b',
                backgroundColor: 'rgba(24, 24, 27, 0.1)',
                tension: 0.3,
                fill: true
              }, {
                label: 'Prediction',
                data: [...Array(values.length).fill(null), ...predicted],
                borderColor: '#f59e0b',
                borderDash: [5, 5],
                tension: 0.3,
                pointRadius: 0
              }]
            },
            options: {
              responsive: true,
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    title: (items) => {
                      const idx = items[0].dataIndex;
                      if (idx < labels.length) {
                        const d = new Date(data[idx].date); // Ensure date is valid
                        return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
                      }
                      return items[0].label;
                    },
                    label: (item) => `${item.raw} completed`
                  }
                }
              },
              scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } }
            }
          });
        }
      }

      // Routine Chart
      if (this.view === 'routines') {
        const ctxR = document.getElementById('routineChart');
        if (ctxR) {
          if (this.routineChart) this.routineChart.destroy();
          const labels = data.map(d => new Date(d.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
          const values = data.map(d => Math.min(100, d.count * 10));

          this.routineChart = new Chart(ctxR, {
            type: 'bar',
            data: {
              labels: labels,
              datasets: [{
                label: 'Routine Consistency',
                data: values,
                backgroundColor: '#f97316',
                borderRadius: 4
              }]
            },
            options: {
              responsive: true,
              plugins: { legend: { display: false } },
              scales: { y: { beginAtZero: true, max: 100 } }
            }
          });
        }
      }
    },

    // Calendar Logic
    async loadCalendarActivity() {
      const res = await fetch('./api/calendar_activity');
      this.calendar.activity = await res.json();
    },

    computeCalendar() {
      const y = this.calendar.year;
      const m = this.calendar.month;
      const first = new Date(y, m, 1);
      const startDay = (first.getDay() + 6) % 7; // Monday=0
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const grid = [];
      for (let i = 0; i < startDay; i++) grid.push(null);
      for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(y, m, d).toISOString().slice(0, 10));
      while (grid.length % 7 !== 0) grid.push(null);
      this.calendar.days = grid;
    },

    calendarTitle() {
      const d = new Date(this.calendar.year, this.calendar.month, 1);
      return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    },

    prevMonth() {
      this.calendar.month--;
      if (this.calendar.month < 0) { this.calendar.month = 11; this.calendar.year--; }
      this.computeCalendar();
    },

    nextMonth() {
      this.calendar.month++;
      if (this.calendar.month > 11) { this.calendar.month = 0; this.calendar.year++; }
      this.computeCalendar();
    },

    hasActivity(ymd) {
      return this.calendar.activity.includes(ymd);
    },

    openHabitModal(habit = null) {
      if (habit) {
        this.habitForm = { ...habit, notification_enabled: !!habit.notification_time };
        this.habitModal.isEdit = true;
      } else {
        this.habitForm = { id: null, title: '', frequency: 'daily', color: '#000000', icon: '📝', notification_time: '', notification_enabled: false };
        this.habitModal.isEdit = false;
      }
      this.habitModal.open = true;
    },

    async saveHabit() {
      const payload = {
        title: this.habitForm.title?.trim(),
        frequency: this.habitForm.frequency,
        color: this.habitForm.color,
        icon: this.habitForm.icon,
        notification_time: this.habitForm.notification_time,
        notification_enabled: !!this.habitForm.notification_time
      };
      if (!payload.title) return;

      if (this.habitModal.isEdit) {
        await fetch('./api/habits?id=' + this.habitForm.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        this.showToast('Habit updated!');
      } else {
        await fetch('./api/habits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        this.showToast('Habit created!');
      }

      this.habitModal.open = false;
      // Force reload to ensure UI updates
      this.habits = [];
      await Promise.all([this.loadHabits(), this.loadMetrics()]);
    },

    async removeHabit(id) {
      await fetch('./api/habits?id=' + id, { method: 'DELETE' });
      this.showToast('Habit deleted');
      await Promise.all([this.loadHabits(), this.loadMetrics()]);
    },

    computeWeek() {
      const start = this.weekStartYmd ? new Date(this.weekStartYmd) : (() => {
        const today = new Date();
        const day = today.getDay();
        const mondayOffset = (day === 0 ? -6 : 1 - day);
        const monday = new Date(today);
        monday.setDate(today.getDate() + mondayOffset);
        return monday;
      })();
      const monday = new Date(start);
      this.weekStartYmd = monday.toISOString().slice(0, 10);
      this.weekDates = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d.toISOString().slice(0, 10);
      });
    },

    weekTitle() {
      const d = new Date(this.weekStartYmd);
      const end = new Date(this.weekStartYmd);
      end.setDate(d.getDate() + 6);
      const fmt = (x) => x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      return `Week of ${fmt(d)} - ${fmt(end)}`;
    },

    async resetWeek() {
      this.weekStartYmd = '';
      this.computeWeek();
      await this.loadLogs();
    },
    async prevWeek() {
      const s = new Date(this.weekStartYmd);
      s.setDate(s.getDate() - 7);
      this.weekStartYmd = s.toISOString().slice(0, 10);
      this.computeWeek();
      await this.loadLogs();
    },
    async nextWeek() {
      const s = new Date(this.weekStartYmd);
      s.setDate(s.getDate() + 7);
      this.weekStartYmd = s.toISOString().slice(0, 10);
      this.computeWeek();
      await this.loadLogs();
    },

    isToday(ymd) {
      return ymd === new Date().toISOString().slice(0, 10);
    },

    async loadLogs() {
      const start = this.weekDates[0];
      const end = this.weekDates[this.weekDates.length - 1];
      const res = await fetch(`./api/habit_logs?start=${start}&end=${end}`);
      const data = await res.json();
      this.logsMap = data.logs || {};
    },

    isMarked(habitId, ymd) {
      const byHabit = this.logsMap[String(habitId)] || {};
      return !!byHabit[ymd];
    },

    async toggleMark(habitId, ymd) {
      let res;
      if (this.isMarked(habitId, ymd)) {
        res = await fetch(`./api/unmark_habit?id=${habitId}&d=${ymd}`, { method: 'POST' });
      } else {
        res = await fetch(`./api/mark_habit?id=${habitId}&d=${ymd}`, { method: 'POST' });
        this.showToast('Habit completed!', 'success');
      }

      const data = await res.json();
      if (data.leveledUp) this.showToast(`Level Up! You are now Level ${data.newLevel}`, 'info');
      if (data.newBadges && data.newBadges.length) {
        data.newBadges.forEach(b => this.showToast(`Badge Unlocked: ${b.name} ${b.icon}`, 'success'));
      }

      await Promise.all([this.loadHabits(), this.loadMetrics(), this.loadLogs(), this.loadAnalytics(), this.loadCalendarActivity()]);
    },

    weekProgress(habit) {
      const dates = this.weekDates || [];
      if (!dates.length) return { percent: 0, percentLabel: '0%', summary: '0/0 this week' };
      const byHabit = this.logsMap[String(habit.id)] || {};
      let requiredCount = 0;
      let completedCount = 0;
      if (habit.frequency === 'weekly') {
        requiredCount = 1;
        completedCount = dates.some(d => !!byHabit[d]) ? 1 : 0;
      } else {
        requiredCount = dates.length;
        for (const d of dates) if (byHabit[d]) completedCount++;
      }
      const percent = requiredCount === 0 ? 0 : Math.round((completedCount / requiredCount) * 100);
      return {
        percent,
        percentLabel: `${percent}%`,
        summary: `${completedCount}/${requiredCount} this week`
      };
    },

    async loadRoutines() {
      const [m, n] = await Promise.all([
        fetch('./api/routines?kind=morning').then(r => r.json()),
        fetch('./api/routines?kind=night').then(r => r.json()),
      ]);
      this.morningRoutine = m;
      this.nightRoutine = n;
    },

    openRoutineModal(kind = 'morning', item = null) {
      if (item) {
        this.routineForm = { id: item.id, kind: item.kind, text: item.text };
        this.routineModal.isEdit = true;
      } else {
        this.routineForm = { id: null, kind: kind, text: '' };
        this.routineModal.isEdit = false;
      }
      this.routineModal.open = true;
    },

    async saveRoutine() {
      const payload = {
        kind: this.routineForm.kind,
        text: this.routineForm.text?.trim()
      };
      if (!payload.text) return;

      if (this.routineModal.isEdit) {
        await fetch('./api/routines?id=' + this.routineForm.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        this.showToast('Routine updated!');
      } else {
        const list = payload.kind === 'morning' ? this.morningRoutine : this.nightRoutine;
        payload.sort = list.length;

        const res = await fetch('./api/routines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res.status === 409) {
          this.showToast('Routine already exists!', 'error');
          return;
        }
        this.showToast('Routine added!');
      }

      this.routineModal.open = false;
      await this.loadRoutines();
    },

    async removeRoutine(item) {
      await fetch('./api/routines?id=' + item.id, { method: 'DELETE' });
      this.showToast('Routine item deleted');
      await this.loadRoutines();
    },

    async changeRoutineImage(file) {
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      await fetch('./api/upload_routine_image', { method: 'POST', body: form });
      this.routineImage = './assets/routine.jpg?ts=' + Date.now();
    },

    async loadRoutineProgress() {
      const res = await fetch(`./api/routines/progress?date=${this.routineDate}`);
      const data = await res.json();
      this.routineProgress.completed = data.completed || [];
    },

    isRoutineDone(id) {
      return this.routineProgress.completed.includes(id);
    },

    async toggleRoutine(id) {
      const res = await fetch('./api/routines/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, date: this.routineDate })
      });
      const data = await res.json();
      if (data.completed) {
        this.routineProgress.completed.push(id);
      } else {
        this.routineProgress.completed = this.routineProgress.completed.filter(x => x !== id);
      }

      if (data.leveledUp) this.showToast(`Level Up! You are now Level ${data.newLevel}`, 'info');
      if (data.newBadges && data.newBadges.length) {
        data.newBadges.forEach(b => this.showToast(`Badge Unlocked: ${b.name} ${b.icon}`, 'success'));
      }
      await Promise.all([this.loadMetrics(), this.loadAnalytics(), this.loadCalendarActivity()]);
    },

    async changeRoutineDate(offset) {
      const d = new Date(this.routineDate);
      d.setDate(d.getDate() + offset);
      this.routineDate = d.toISOString().slice(0, 10);
      await this.loadRoutineProgress();
    },

    routineDateLabel() {
      const d = new Date(this.routineDate);
      const today = new Date().toISOString().slice(0, 10);
      if (this.routineDate === today) return 'Today';
      return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    },

    routineProgressPercent(kind) {
      const list = kind === 'morning' ? this.morningRoutine : this.nightRoutine;
      if (!list.length) return 0;
      const done = list.filter(item => this.isRoutineDone(item.id)).length;
      return Math.round((done / list.length) * 100);
    },

    initNotifications() {
      if (!("Notification" in window)) return;
      if (Notification.permission !== "granted") {
        Notification.requestPermission();
      }

      setInterval(() => {
        const now = new Date();
        const timeStr = now.toTimeString().slice(0, 5); // HH:MM

        this.habits.forEach(h => {
          // Ensure we compare strings correctly and haven't notified this minute
          if (h.notification_time && h.notification_time === timeStr) {
            if (h._lastNotified !== timeStr) {
              this.showToast(`Time for: ${h.title}`, 'info');
              new Notification(`FlowTrack Reminder`, { body: `Time to: ${h.title}`, icon: h.icon });
              h._lastNotified = timeStr;
            }
          }
        });
      }, 10000); // Check every 10s for better precision
    },

    // === FLOW MODE (Focus Timer) ===
    openFlowMode() {
      this.flowModeOpen = true;
      this.timerSeconds = this.timerPreset * 60;
      this.timerActive = false;
      this.timerPaused = false;
    },

    closeFlowMode() {
      this.flowModeOpen = false;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.timerActive = false;
    },

    setTimerPreset(minutes) {
      if (!this.timerActive) {
        this.timerPreset = minutes;
        this.timerSeconds = minutes * 60;
      }
    },

    startTimer() {
      if (!this.timerActive) this.timerActive = true;
      this.timerPaused = false;

      this.intervalId = setInterval(() => {
        if (!this.timerPaused && this.timerSeconds > 0) {
          this.timerSeconds--;
        } else if (this.timerSeconds === 0) {
          this.completeFlowSession();
        }
      }, 1000);
    },

    pauseTimer() {
      this.timerPaused = true;
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
    },

    resetTimer() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.timerActive = false;
      this.timerPaused = false;
      this.timerSeconds = this.timerPreset * 60;
    },

    async completeFlowSession() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      const minutesCompleted = this.timerPreset;
      this.showToast(`🎉 Flow session complete! ${minutesCompleted} minutes focused.`, 'success');

      // Send to server
      const res = await fetch('./api/focus/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: minutesCompleted })
      });
      const data = await res.json();

      if (data.leveledUp) {
        this.showToast(`🎊 Level Up! You reached Level ${data.newLevel}!`, 'info');
      }

      await this.loadMetrics();
      this.resetTimer();
      this.flowModeOpen = false;
    },

    formatTime(seconds) {
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    },

    // === HABIT NOTES ===
    async openNoteModal(habitId, date) {
      const habit = this.habits.find(h => h.id === habitId);
      if (!habit) return;

      this.noteModal.habitId = habitId;
      this.noteModal.date = date;
      this.noteModal.habitTitle = habit.title;

      // Load existing note
      const res = await fetch(`./api/habit_note?habit_id=${habitId}&date=${date}`);
      const data = await res.json();
      this.noteModal.note = data.note || '';
      this.noteModal.open = true;
    },

    async saveNote() {
      await fetch('./api/habit_note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          habit_id: this.noteModal.habitId,
          date: this.noteModal.date,
          note: this.noteModal.note
        })
      });
      this.showToast('Note saved!');
      this.noteModal.open = false;
    }
  }
}