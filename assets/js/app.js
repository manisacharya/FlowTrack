function appState() {
  return {
    view: 'habits',
    categories: [],
    tasks: [],
    habits: [],
    logsMap: {},
    weekDates: [],
    weekStartYmd: '',
    metrics: { tasksCompleted: 0, activeHabits: 0, longestStreak: 0 },
    filters: { query: '', category_id: '' },
    taskForm: { title: '', category_id: '', due_date: '' },
    habitForm: { title: '', frequency: 'daily' },
    calendar: {
      year: new Date().getFullYear(),
      month: new Date().getMonth(), // 0-11
      days: [],
      tasksByDate: {}
    },
    morningRoutine: [],
    nightRoutine: [],
    routineImage: './assets/routine.jpg',

    async init() {
      await Promise.all([this.loadCategories(), this.loadTasks(), this.loadHabits(), this.loadMetrics()]);
      this.resetWeek();
      await this.loadRoutines();
    },

    async loadCategories() {
      const res = await fetch('./api/categories.php');
      this.categories = await res.json();
    },

    async promptCreateCategory() {
      const name = window.prompt('New category name');
      if (!name) return;
      await fetch('./api/categories.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      await this.loadCategories();
    },

    async loadTasks() {
      const params = new URLSearchParams();
      if (this.filters.query) params.set('q', this.filters.query);
      if (this.filters.category_id) params.set('category_id', this.filters.category_id);
      const res = await fetch('./api/tasks.php?' + params.toString());
      this.tasks = await res.json();
    },

    async loadHabits() {
      const res = await fetch('./api/habits.php');
      this.habits = await res.json();
    },

    async loadMetrics() {
      const res = await fetch('./api/metrics.php');
      this.metrics = await res.json();
    },

    filteredTasks() {
      const q = (this.filters.query || '').toLowerCase();
      const cat = this.filters.category_id;
      return this.tasks.filter(t => {
        const matchesQ = !q || (t.title || '').toLowerCase().includes(q);
        const matchesC = !cat || String(t.category_id) === String(cat);
        return matchesQ && matchesC;
      });
    },

    async createTask() {
      const payload = {
        title: this.taskForm.title?.trim(),
        category_id: this.taskForm.category_id || null,
        due_date: this.taskForm.due_date || null,
      };
      if (!payload.title) return;
      await fetch('./api/tasks.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      this.taskForm = { title: '', category_id: '', due_date: '' };
      await Promise.all([this.loadTasks(), this.loadMetrics(), this.loadCalendarTasks()]);
    },

    async toggleTask(task) {
      await fetch('./api/tasks.php?id=' + task.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ completed: task.completed == 1 ? 0 : 1 }) });
      await Promise.all([this.loadTasks(), this.loadMetrics(), this.loadCalendarTasks()]);
    },

    async removeTask(id) {
      await fetch('./api/tasks.php?id=' + id, { method: 'DELETE' });
      await Promise.all([this.loadTasks(), this.loadMetrics(), this.loadCalendarTasks()]);
    },

    async createHabit() {
      const payload = { title: this.habitForm.title?.trim(), frequency: this.habitForm.frequency };
      if (!payload.title) return;
      await fetch('./api/habits.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      this.habitForm = { title: '', frequency: 'daily' };
      await Promise.all([this.loadHabits(), this.loadMetrics()]);
    },

    async markHabit(id) {
      await fetch('./api/mark_habit.php?id=' + id, { method: 'POST' });
      await Promise.all([this.loadHabits(), this.loadMetrics()]);
    },

    async removeHabit(id) {
      await fetch('./api/habits.php?id=' + id, { method: 'DELETE' });
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
      this.weekStartYmd = s.toISOString().slice(0,10);
      this.computeWeek();
      await this.loadLogs();
    },
    async nextWeek() {
      const s = new Date(this.weekStartYmd);
      s.setDate(s.getDate() + 7);
      this.weekStartYmd = s.toISOString().slice(0,10);
      this.computeWeek();
      await this.loadLogs();
    },

    isToday(ymd) {
      return ymd === new Date().toISOString().slice(0,10);
    },

    async loadLogs() {
      const start = this.weekDates[0];
      const end = this.weekDates[this.weekDates.length - 1];
      const res = await fetch(`./api/habit_logs.php?start=${start}&end=${end}`);
      const data = await res.json();
      this.logsMap = data.logs || {};
    },

    isMarked(habitId, ymd) {
      const byHabit = this.logsMap[String(habitId)] || {};
      return !!byHabit[ymd];
    },

    async toggleMark(habitId, ymd) {
      // Allow toggling any day in the visible week
      if (this.isMarked(habitId, ymd)) {
        await fetch(`./api/unmark_habit.php?id=${habitId}&d=${ymd}`, { method: 'POST' });
      } else {
        await fetch(`./api/mark_habit.php?id=${habitId}&d=${ymd}`, { method: 'POST' });
      }
      await Promise.all([this.loadHabits(), this.loadMetrics(), this.loadLogs()]);
    },

    // Compute weekly progress for a habit as a percentage and summary text
    weekProgress(habit) {
      const dates = this.weekDates || [];
      if (!dates.length) return { percent: 0, percentLabel: '0%', summary: '0/0 this week' };
      const byHabit = this.logsMap[String(habit.id)] || {};
      let requiredCount = 0;
      let completedCount = 0;
      if (habit.frequency === 'weekly') {
        // Weekly: one required check within the visible week
        requiredCount = 1;
        completedCount = dates.some(d => !!byHabit[d]) ? 1 : 0;
      } else {
        // Daily: one required check per day in the visible week
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

    computeCalendar() {
      const y = this.calendar.year;
      const m = this.calendar.month; // 0-11
      const first = new Date(y, m, 1);
      const startDay = (first.getDay() + 6) % 7; // Monday=0
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const grid = [];
      // Fill leading blanks
      for (let i = 0; i < startDay; i++) grid.push(null);
      // Fill days
      for (let d = 1; d <= daysInMonth; d++) grid.push(new Date(y, m, d).toISOString().slice(0,10));
      // Pad to full weeks (multiples of 7)
      while (grid.length % 7 !== 0) grid.push(null);
      this.calendar.days = grid;
    },

    calendarTitle() {
      const d = new Date(this.calendar.year, this.calendar.month, 1);
      return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    },

    async prevMonth() {
      const d = new Date(this.calendar.year, this.calendar.month, 1);
      d.setMonth(d.getMonth() - 1);
      this.calendar.year = d.getFullYear();
      this.calendar.month = d.getMonth();
      this.computeCalendar();
      await this.loadCalendarTasks();
    },

    async nextMonth() {
      const d = new Date(this.calendar.year, this.calendar.month, 1);
      d.setMonth(d.getMonth() + 1);
      this.calendar.year = d.getFullYear();
      this.calendar.month = d.getMonth();
      this.computeCalendar();
      await this.loadCalendarTasks();
    },

    async loadCalendarTasks() {
      const y = this.calendar.year;
      const m = this.calendar.month;
      const start = new Date(y, m, 1).toISOString().slice(0,10);
      const end = new Date(y, m + 1, 0).toISOString().slice(0,10);
      const res = await fetch(`./api/tasks.php?start_due=${start}&end_due=${end}`);
      const rows = await res.json();
      const map = {};
      for (const t of rows) {
        if (!t.due_date) continue;
        if (!map[t.due_date]) map[t.due_date] = [];
        map[t.due_date].push(t);
      }
      this.calendar.tasksByDate = map;
    },

    async loadRoutines() {
      const [m, n] = await Promise.all([
        fetch('./api/routines.php?kind=morning').then(r=>r.json()),
        fetch('./api/routines.php?kind=night').then(r=>r.json()),
      ]);
      this.morningRoutine = m;
      this.nightRoutine = n;
    },

    async addRoutine(kind) {
      const text = window.prompt(kind==='morning' ? 'Add morning routine item' : 'Add night routine item');
      if (!text) return;
      const list = kind==='morning' ? this.morningRoutine : this.nightRoutine;
      const sort = list.length;
      await fetch('./api/routines.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, text, sort }) });
      await this.loadRoutines();
    },

    async editRoutine(item) {
      const text = window.prompt('Edit item', item.text);
      if (text === null) return;
      await fetch('./api/routines.php?id=' + item.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      await this.loadRoutines();
    },

    async removeRoutine(item) {
      if (!confirm('Delete item?')) return;
      await fetch('./api/routines.php?id=' + item.id, { method: 'DELETE' });
      await this.loadRoutines();
    },

    async changeRoutineImage(file) {
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      await fetch('./api/upload_routine_image.php', { method: 'POST', body: form });
      // cache-bust
      this.routineImage = './assets/routine.jpg?ts=' + Date.now();
    },
  }
} 