function appState() {
  return {
    view: 'habits', // 'habits' | 'routines'
    token: localStorage.getItem('token'),
    role: localStorage.getItem('user_role') || 'user',
    username: localStorage.getItem('username') || '',

    categories: [],
    habits: [],
    users: [],
    logsMap: {},
    metrics: { activeHabits: 0, longestStreak: 0 },
    habitView: 'week', // 'week' | 'month'
    viewDate: new Date().toISOString().slice(0, 10),
    habitDates: [],
    stats: { points: 0, level: 1, xp: 0 },
    badges: [],

    // Forms
    habitForm: { id: null, title: '', frequency: 'daily', color: '#000000', icon: '📝', notification_time: '', notification_enabled: false },
    habitModal: { open: false, isEdit: false },

    routineForm: { id: null, kind: 'morning', text: '' },
    routineModal: { open: false, isEdit: false },

    adminUserForm: { username: '', password: '', role: 'user', recovery_question: '', recovery_answer: '' },
    adminUserModal: { open: false },
    usersLoading: false,

    profileForm: { recovery_question: '', recovery_answer: '' },
    profileEditing: false,
    analyticsData: { stats: [], morningTotal: 0, nightTotal: 0 },
    last30Days: [],
    detailedLogs: [],
    reportFilters: {
      habitId: 'all',
      granularity: 'daily',
      page: 1,
      pageSize: 50,
      sortField: 'log_date',
      sortDir: 'desc',
      dateRange: 'all'
    },
    summaryPage: 0,
    summaryPageSize: 4,

    // UI State
    toasts: [],
    darkMode: localStorage.getItem('darkMode') === 'true',
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
    currentAmbientSound: null,
    ambientAudio: null,
    notificationId: null,
    currentAmbientSound: null,
    ambientAudio: null,

    // Habit Notes
    noteModal: { open: false, habitId: null, date: '', note: '', habitTitle: '' },

    // Routines
    morningRoutine: [],
    nightRoutine: [],
    routineImage: './assets/routine.jpg',
    routineProgress: { completed: [] },

    // Analytics
    routineChart: null,

    // Calendar
    calendar: { year: new Date().getFullYear(), month: new Date().getMonth(), days: [], activity: [] },

    // Routine History
    routineDate: new Date().toISOString().slice(0, 10),

    // Helper for Local YYYY-MM-DD
    toLocalYMD(dateInput) {
      const d = new Date(dateInput);
      const offset = d.getTimezoneOffset();
      const local = new Date(d.getTime() - (offset * 60 * 1000));
      return local.toISOString().slice(0, 10);
    },

    // Helper to parse SQLite UTC strings consistently
    parseUTC(dateStr) {
      if (!dateStr) return null;
      if (dateStr.length === 10) return new Date(dateStr); // YYYY-MM-DD is UTC in JS
      return new Date(dateStr + ' UTC');
    },

    // --- AUTHENTICATION HELPER ---
    async authFetch(url, options = {}) {
      if (!this.token) {
        window.location.href = 'login.html';
        return;
      }

      const headers = {
        'Authorization': `Bearer ${this.token}`,
        ...(options.headers || {})
      };

      const res = await fetch(url, { ...options, headers });
      if (res.status === 401 || res.status === 403) {
        this.logout();
        return null;
      }
      return res;
    },

    logout() {
      localStorage.removeItem('token');
      localStorage.removeItem('user_role');
      localStorage.removeItem('username');
      window.location.href = 'login.html';
    },

    async init() {
      if (!this.token) {
        window.location.href = 'login.html';
        return;
      }

      // Use local date for initial routine date to avoid timezone bugs on load
      this.routineDate = this.toLocalYMD(new Date());

      await Promise.all([
        this.loadCategories(),
        this.loadHabits(),
        this.loadMetrics(),
        this.loadRoutines(),
        this.loadRoutineProgress(),
        this.loadCoach(),
        this.loadCalendarActivity(),
        this.loadProfile()
      ]);
      this.computeHeatMapRange();
      this.resetWeek();
      this.initNotifications();
      this.loadAnalytics();
      this.computeCalendar();
      this.registerServiceWorker();
      this.startNotificationLoop();

      // Handle URL Routing
      const hash = window.location.hash.slice(1);
      const userViews = ['habits', 'routines', 'profile'];
      const adminViews = ['admin', 'profile'];

      if (this.role === 'admin') {
        if (hash && adminViews.includes(hash)) {
          this.switchView(hash);
        } else {
          this.switchView('admin');
        }
      } else {
        if (hash && userViews.includes(hash)) {
          this.switchView(hash);
        } else {
          this.switchView('habits');
        }
      }

      window.addEventListener('hashchange', () => {
        const h = window.location.hash.slice(1);
        if (h && h !== this.view) {
          this.switchView(h);
        }
      });
    },

    startNotificationLoop() {
      if (this.notificationId) clearInterval(this.notificationId);
      this.notificationId = setInterval(() => this.checkReminders(), 30000); // Check every 30s
    },

    checkReminders() {
      if (!('Notification' in window) || Notification.permission !== 'granted') return;

      const now = new Date();
      const currentHm = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
      const ymd = this.toLocalYMD(now);

      this.habits.forEach(habit => {
        if (habit.notification_time === currentHm) {
          // Check if already done today in activityMap
          const done = this.calendar.activityMap && this.calendar.activityMap[ymd] && this.calendar.activityMap[ymd].has(Number(habit.id));

          if (!done && habit._lastNotifiedYmdHm !== `${ymd}_${currentHm}`) {
            new Notification(`FlowTrack: ${habit.title}`, {
              body: `Time to complete your habit: ${habit.title} ${habit.icon}`,
              icon: `https://api.dicebear.com/7.x/avataaars/svg?seed=${this.username}`
            });
            habit._lastNotifiedYmdHm = `${ymd}_${currentHm}`;
          }
        }
      });
    },

    registerServiceWorker() {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js')
          .then(() => console.log('Service Worker Registered'))
          .catch(err => console.error('Service Worker Registration Failed', err));
      }
    },

    toggleDarkMode() {
      this.darkMode = !this.darkMode;
      localStorage.setItem('darkMode', this.darkMode);
    },

    previousView: null,

    switchView(v) {
      if (this.role === 'admin' && (v === 'habits' || v === 'routines')) return;
      if (this.role !== 'admin' && v === 'admin') return;
      this.previousView = this.view;
      this.view = v;
      window.location.hash = v;
      this.$nextTick(() => {
        this.loadAnalytics();
        if (v === 'admin') this.loadUsers();
        if (v === 'profile') this.loadProfile();
        if (v === 'reports') this.loadDetailedLogs();
      });
    },

    goBack() {
      if (this.previousView) {
        this.switchView(this.previousView);
      } else {
        this.switchView('habits');
      }
    },

    showToast(message, type = 'success') {
      const id = Date.now();
      this.toasts.push({ id, message, type, visible: true });
      setTimeout(() => this.hideToast(id), 3000);
    },

    hideToast(id) {
      const toast = this.toasts.find(t => t.id === id);
      if (toast) {
        toast.visible = false;
        setTimeout(() => {
          this.toasts = this.toasts.filter(t => t.id !== id);
        }, 500); // Wait for fade out animation
      }
    },

    confirmAction(message, callback) {
      this.confirmModal.message = message;
      this.confirmModal.onConfirm = callback;
      this.confirmModal.open = true;
    },

    async loadCategories() {
      const res = await this.authFetch('./api/categories');
      if (res) this.categories = await res.json();
    },

    async loadUsers() {
      if (this.role !== 'admin') return;
      this.usersLoading = true;
      try {
        const res = await this.authFetch('./api/users');
        if (res) this.users = await res.json();
      } finally {
        this.usersLoading = false;
      }
    },

    async removeUser(id) {
      if (!confirm("Are you sure? This deletes all their data.")) return;
      await this.authFetch('./api/users?id=' + id, { method: 'DELETE' });
      this.showToast('User deleted');
      this.loadUsers();
    },

    openUserModal() {
      this.adminUserForm = { username: '', password: '', role: 'user', recovery_question: '', recovery_answer: '' };
      this.adminUserModal.open = true;
    },

    async adminCreateUser() {
      if (!this.adminUserForm.username || !this.adminUserForm.password || !this.adminUserForm.recovery_question || !this.adminUserForm.recovery_answer) {
        this.showToast('All fields are required', 'error');
        return;
      }
      const res = await this.authFetch('./api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...this.adminUserForm })
      });
      if (!res) return;
      const data = await res.json();
      if (res.status !== 201) {
        this.showToast(data.error || 'Error creating user', 'error');
        return;
      }
      this.showToast('User created successfully');
      this.adminUserModal.open = false;
      this.adminUserForm = { username: '', password: '', role: 'user', recovery_question: '', recovery_answer: '' }; // Reset
      await this.loadUsers();
    },

    async updateUserRole(id, role) {
      const res = await this.authFetch('./api/users/role', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role })
      });
      if (res) {
        const data = await res.json();
        if (data.success) {
          this.showToast(`Role updated to ${role}`);
          this.loadUsers();
        } else {
          this.showToast(data.error || 'Update failed', 'error');
        }
      }
    },

    async loadProfile() {
      const res = await this.authFetch('./api/me');
      if (res) {
        const data = await res.json();
        this.profileForm.recovery_question = data.recovery_question || '';
        this.profileForm.recovery_answer = data.recovery_answer || '';
      }
    },

    async updateProfileSecurity() {
      if (!this.profileForm.recovery_question || !this.profileForm.recovery_answer) {
        this.showToast('Question and Answer required', 'error');
        return;
      }
      const res = await this.authFetch('./api/profile/security', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.profileForm)
      });
      if (res) {
        const data = await res.json();
        if (data.success) {
          this.showToast('Security settings updated');
        } else {
          this.showToast(data.error || 'Update failed', 'error');
        }
      }
    },

    async loadHabits() {
      const res = await this.authFetch('./api/habits');
      if (res) this.habits = await res.json();
    },

    async loadMetrics() {
      const res = await this.authFetch('./api/metrics');
      if (!res) return;
      const data = await res.json();
      this.metrics = data;
      this.stats = data.stats || { points: 0, level: 1, xp: 0 };
      this.badges = data.badges || [];
    },

    async loadCoach() {
      const res = await this.authFetch('./api/coach');
      if (!res) return;
      const data = await res.json();
      this.coachMessage = data.message;
    },

    async refreshCoach() {
      this.coachMessage = "Thinking...";
      await this.loadCoach();
    },

    async resetProgress() {
      const res = await this.authFetch('./api/me/reset', { method: 'POST' });
      if (res) {
        this.showToast('Progress has been reset');
        await Promise.all([this.loadMetrics(), this.loadHabits(), this.loadLogs(), this.loadCalendarActivity(), this.loadProfile()]);
        this.switchView('habits');
      }
    },

    async loadAnalytics() {
      const res = await this.authFetch('./api/analytics');
      if (!res) return;
      this.analyticsData = await res.json();
    },

    async loadDetailedLogs() {
      const res = await this.authFetch('./api/habit_detailed_logs');
      if (!res) return;
      this.detailedLogs = await res.json();
    },

    async openNoteModal(habitId, date) {
      const habit = this.habits.find(h => h.id === habitId);
      this.noteModal.habitId = habitId;
      this.noteModal.date = date;
      this.noteModal.habitTitle = habit ? habit.title : 'Habit';
      this.noteModal.note = 'Loading...';
      this.noteModal.open = true;

      // Fetch note from server
      try {
        const res = await this.authFetch(`./api/habit_note?habit_id=${habitId}&date=${date}`);
        if (res) {
          const data = await res.json();
          this.noteModal.note = data.note || '';
        } else {
          this.noteModal.note = '';
        }
      } catch (e) {
        console.error("Failed to fetch note", e);
        this.noteModal.note = '';
      }
    },

    async saveNote() {
      const habitId = this.noteModal.habitId;
      const date = this.noteModal.date;
      const noteContent = this.noteModal.note;

      const res = await this.authFetch('./api/habit_note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          habit_id: habitId,
          date: date,
          note: noteContent
        })
      });
      if (!res) return;
      this.showToast('Note saved!');
      this.noteModal.open = false;

      // Optimistic update for instant UI feedback
      const hId = String(habitId);
      const hasContent = noteContent && noteContent.trim().length > 0;
      if (this.logsMap[hId] && this.logsMap[hId][date]) {
        // Ensure we preserve the 'logged' status. 
        // If the value was historically a number (1), convert to object.
        let val = this.logsMap[hId][date];
        if (typeof val === 'number') val = { logged: val };

        this.logsMap[hId][date] = { ...val, hasNote: hasContent, logged: 1 };
      }

      if (this.view === 'reports') {
        this.loadDetailedLogs();
      }
    },

    async loadLogs() {
      const start = this.habitDates[0];
      const end = this.habitDates[this.habitDates.length - 1];
      // Add timestamp to prevent caching
      const res = await this.authFetch(`./api/habit_logs?start=${start}&end=${end}&_t=${Date.now()}`);
      if (!res) return;
      const data = await res.json();
      this.logsMap = data.logs || {};
    },

    filteredReports() {
      let data = [...this.detailedLogs];

      // 1. Filter by Date Range
      if (this.reportFilters.dateRange !== 'all') {
        let cutoffDate = new Date();
        if (this.reportFilters.dateRange === '7d') cutoffDate.setDate(cutoffDate.getDate() - 7);
        else if (this.reportFilters.dateRange === '30d') cutoffDate.setDate(cutoffDate.getDate() - 30);
        else if (this.reportFilters.dateRange === 'month') cutoffDate.setDate(1);

        const cutoffYmd = this.toLocalYMD(cutoffDate);
        data = data.filter(log => log.log_date >= cutoffYmd);
      }

      // 2. Filter by habit
      if (this.reportFilters.habitId !== 'all') {
        data = data.filter(log => log.habit_id == this.reportFilters.habitId);
      }

      // 3. Grouping by granularity
      if (this.reportFilters.granularity !== 'daily') {
        const grouped = {};
        data.forEach(log => {
          const date = new Date(log.log_date);
          let key;
          if (this.reportFilters.granularity === 'weekly') {
            const day = date.getDay();
            const diff = date.getDate() - day;
            const weekStart = new Date(date.setDate(diff));
            key = weekStart.toISOString().slice(0, 10);
          } else {
            key = log.log_date.slice(0, 7) + '-01'; // Monthly
          }

          // CRITICAL BUG FIX: Group by BOTH period and habit_id
          const compositeKey = `${key}_${log.habit_id}`;

          if (!grouped[compositeKey]) {
            grouped[compositeKey] = { ...log, log_date: key, count: 0, notes: [] };
          }
          grouped[compositeKey].count++;
          if (log.note) grouped[compositeKey].notes.push(log.note);
        });
        data = Object.values(grouped);
      }

      // 4. Sort
      data.sort((a, b) => {
        let valA = a[this.reportFilters.sortField];
        let valB = b[this.reportFilters.sortField];

        // Handle sorting for specific fields
        if (this.reportFilters.sortField === 'log_date') {
          valA = new Date(valA);
          valB = new Date(valB);
        } else if (this.reportFilters.sortField === 'title') {
          valA = (valA || '').toLowerCase();
          valB = (valB || '').toLowerCase();
        } else if (this.reportFilters.sortField === 'note') {
          // If grouped, check notes array, otherwise note string
          valA = (this.reportFilters.granularity !== 'daily' ? (a.notes || []).join(', ') : (a.note || '')).toLowerCase();
          valB = (this.reportFilters.granularity !== 'daily' ? (b.notes || []).join(', ') : (b.note || '')).toLowerCase();

          // Ensure empty items stay at bottom
          if (!valA && valB) return 1;
          if (valA && !valB) return -1;
        }

        if (this.reportFilters.sortDir === 'asc') return valA > valB ? 1 : -1;
        return valA < valB ? 1 : -1;
      });

      return data;
    },

    paginatedReports() {
      const data = this.filteredReports();
      const start = (this.reportFilters.page - 1) * this.reportFilters.pageSize;
      return data.slice(start, start + this.reportFilters.pageSize);
    },

    totalPages() {
      return Math.ceil(this.filteredReports().length / this.reportFilters.pageSize) || 1;
    },

    setSort(field) {
      if (this.reportFilters.sortField === field) {
        this.reportFilters.sortDir = this.reportFilters.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        this.reportFilters.sortField = field;
        this.reportFilters.sortDir = 'asc'; // Defaults to asc for title/note
      }
      this.reportFilters.page = 1;
    },

    exportToCSV() {
      const data = this.filteredReports();
      if (!data.length) return this.showToast('No data to export', 'error');

      const headers = ['Date', 'Habit', 'Notes/Count', 'Status'];
      const rows = data.map(log => [
        log.log_date,
        log.title,
        this.reportFilters.granularity === 'daily' ? (log.note || '-') : `${log.count} completions`,
        'Completed'
      ]);

      const csvContent = [headers, ...rows].map(e => e.join(",")).join("\n");
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `flowtrack_logs_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.showToast('Export successful!');
    },

    habitSummaries() {
      const summaries = {};
      const filteredLogs = [...this.detailedLogs];

      // Apply date filter to summaries too
      let summaryLogs = filteredLogs;
      if (this.reportFilters.dateRange !== 'all') {
        let cutoffDate = new Date();
        if (this.reportFilters.dateRange === '7d') cutoffDate.setDate(cutoffDate.getDate() - 7);
        else if (this.reportFilters.dateRange === '30d') cutoffDate.setDate(cutoffDate.getDate() - 30);
        else if (this.reportFilters.dateRange === 'month') cutoffDate.setDate(1);

        const cutoffYmd = this.toLocalYMD(cutoffDate);
        summaryLogs = filteredLogs.filter(log => log.log_date >= cutoffYmd);
      }

      this.habits.forEach(h => {
        summaries[h.id] = { ...h, count: 0 };
      });
      summaryLogs.forEach(log => {
        if (summaries[log.habit_id]) {
          summaries[log.habit_id].count++;
        }
      });
      return Object.values(summaries).sort((a, b) => b.count - a.count);
    },

    paginatedSummaries() {
      const all = this.habitSummaries();
      const start = this.summaryPage * this.summaryPageSize;
      return all.slice(start, start + this.summaryPageSize);
    },

    nextSummary() {
      if ((this.summaryPage + 1) * this.summaryPageSize < this.habitSummaries().length) {
        this.summaryPage++;
      }
    },

    prevSummary() {
      if (this.summaryPage > 0) {
        this.summaryPage--;
      }
    },

    // Insights Data Logic
    hourDistribution() {
      const dist = Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        count: 0,
        label: i === 0 ? '12 AM' : (i > 12 ? `${i - 12} PM` : (i === 12 ? '12 PM' : `${i} AM`)),
        percent: 0
      }));

      this.detailedLogs.forEach(log => {
        const date = this.parseUTC(log.created_at);
        if (date) {
          const h = date.getHours();
          dist[h].count++;
        }
      });

      const max = Math.max(...dist.map(d => d.count)) || 1;
      dist.forEach(d => d.percent = (d.count / max) * 100);
      return dist;
    },

    synergies() {
      // Find pairs of habits often done on the same day
      const dailyMap = {}; // ymd -> set of habitIds
      this.detailedLogs.forEach(log => {
        if (!dailyMap[log.log_date]) dailyMap[log.log_date] = new Set();
        dailyMap[log.log_date].add(Number(log.habit_id));
      });

      const habitPairs = {}; // "idA_idB" -> count
      Object.values(dailyMap).forEach(habits => {
        const arr = Array.from(habits).sort((a, b) => a - b);
        for (let i = 0; i < arr.length; i++) {
          for (let j = i + 1; j < arr.length; j++) {
            const key = `${arr[i]}_${arr[j]}`;
            habitPairs[key] = (habitPairs[key] || 0) + 1;
          }
        }
      });

      const habitMap = Object.fromEntries(this.habits.map(h => [h.id, h]));
      return Object.entries(habitPairs)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([key, count]) => {
          const [idA, idB] = key.split('_');
          const hA = habitMap[idA];
          const hB = habitMap[idB];
          if (!hA || !hB) return null;
          return {
            pair: key,
            iconA: hA.icon,
            iconB: hB.icon,
            label: `${hA.title} + ${hB.title}`,
            description: "Strongest Synergy",
            impact: Math.round((count / Math.max(1, this.detailedLogs.filter(l => l.habit_id == idA || l.habit_id == idB).length / 2)) * 100)
          };
        }).filter(Boolean);
    },

    computeHeatMapRange() {
      const dates = [];
      const today = new Date();
      for (let i = 27; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(today.getDate() - i);
        dates.push(this.toLocalYMD(d));
      }
      this.last30Days = dates;
    },

    getRoutineIntensity(date, kind) {
      if (!this.analyticsData || !this.analyticsData.stats) return 0;
      const day = this.analyticsData.stats.find(s => s.date === date);
      if (!day) return 0;
      const count = kind === 'morning' ? day.morning_count : day.night_count;
      const total = kind === 'morning' ? this.analyticsData.morningTotal : this.analyticsData.nightTotal;
      return total > 0 ? count / total : 0;
    },

    getHeatMapColor(intensity, kind) {
      if (!intensity || intensity <= 0) {
        if (this.darkMode) return 'bg-zinc-800/50';
        return 'bg-zinc-100';
      }
      const base = kind === 'morning' ? 'orange' : 'indigo';
      if (intensity <= 0.25) return `bg-${base}-200`;
      if (intensity <= 0.5) return `bg-${base}-400`;
      if (intensity <= 0.75) return `bg-${base}-600`;
      return `bg-${base}-800`;
    },

    hasActivity(ymd) {
      return this.calendar.activityMap && this.calendar.activityMap[ymd] && this.calendar.activityMap[ymd].size > 0;
    },

    isToday(ymd) {
      if (!ymd) return false;
      return ymd === this.toLocalYMD(new Date());
    },

    // Calendar Logic
    async loadCalendarActivity() {
      const y = this.calendar.year;
      const m = this.calendar.month;
      const start = new Date(y, m, 1);
      const end = new Date(y, m + 1, 0);

      const res = await this.authFetch(`./api/habit_logs?start=${this.toLocalYMD(start)}&end=${this.toLocalYMD(end)}`);
      if (!res) return;
      const data = await res.json();

      const activityMap = {};
      const logs = data.logs || {};
      for (const [habitId, dateMap] of Object.entries(logs)) {
        for (const dateStr of Object.keys(dateMap)) {
          if (!activityMap[dateStr]) activityMap[dateStr] = new Set();
          activityMap[dateStr].add(Number(habitId));
        }
      }
      this.calendar.activityMap = activityMap;
    },

    computeCalendar() {
      const y = this.calendar.year;
      const m = this.calendar.month;
      const first = new Date(y, m, 1);
      const startDay = (first.getDay() + 6) % 7; // Monday=0
      const daysInMonth = new Date(y, m + 1, 0).getDate();
      const grid = [];
      for (let i = 0; i < startDay; i++) grid.push(null);

      for (let d = 1; d <= daysInMonth; d++) {
        grid.push(this.toLocalYMD(new Date(y, m, d)));
      }
      while (grid.length % 7 !== 0) grid.push(null);
      this.calendar.days = grid;

      this.loadCalendarActivity();
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

    getCompletedCount(d) {
      if (!this.calendar.activityMap || !this.calendar.activityMap[d]) return 0;
      return this.calendar.activityMap[d].size;
    },

    isPerfectDay(ymd) {
      if (!this.calendar.activityMap) return false;

      const today = this.toLocalYMD(new Date());
      if (ymd > today) return false; // Future is never perfect

      const completedIds = this.calendar.activityMap[ymd] || new Set();

      let activeCount = 0;
      let dailyDone = 0;

      this.habits.forEach(h => {
        // Simple creation check
        const createdDate = this.parseUTC(h.created_at);
        if (this.toLocalYMD(createdDate) > ymd) return; // Created after this day

        if (h.frequency === 'daily') {
          activeCount++;
          if (completedIds.has(h.id)) dailyDone++;
        }
      });

      if (activeCount === 0) return false;
      return dailyDone >= activeCount;
    },

    isPastMonth(ymd) {
      if (!ymd) return false;
      const date = new Date(ymd);
      const today = new Date();
      const currentMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      const dateMonthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      return dateMonthStart < currentMonthStart;
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
        await this.authFetch('./api/habits?id=' + this.habitForm.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        this.showToast('Habit updated!');
      } else {
        await this.authFetch('./api/habits', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        this.showToast('Habit created!');
      }

      this.habitModal.open = false;
      this.habits = [];
      await Promise.all([this.loadHabits(), this.loadMetrics()]);
    },

    async removeHabit(id) {
      await this.authFetch('./api/habits?id=' + id, { method: 'DELETE' });
      this.showToast('Habit deleted');
      await Promise.all([this.loadHabits(), this.loadMetrics()]);
    },

    computeHabitDates() {
      const start = new Date(this.viewDate + 'T12:00:00');
      if (this.habitView === 'week') {
        const day = start.getDay();
        const mondayOffset = (day === 0 ? -6 : 1 - day);
        const monday = new Date(start);
        monday.setDate(start.getDate() + mondayOffset);
        this.habitDates = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          return this.toLocalYMD(d);
        });
      } else {
        const year = start.getFullYear();
        const month = start.getMonth();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        this.habitDates = Array.from({ length: daysInMonth }, (_, i) => {
          return this.toLocalYMD(new Date(year, month, i + 1));
        });
      }
    },

    setHabitView(v) {
      this.habitView = v;
      this.computeHabitDates();
      this.loadLogs();
    },

    habitTitle() {
      const start = new Date(this.habitDates[0] + 'T12:00:00');
      if (this.habitView === 'week') {
        const end = new Date(this.habitDates[6] + 'T12:00:00');
        const fmt = (x) => x.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        return `Week of ${fmt(start)} - ${fmt(end)}`;
      } else {
        return start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
      }
    },

    async resetWeek() {
      this.viewDate = new Date().toISOString().slice(0, 10);
      this.computeHabitDates();
      await this.loadLogs();
    },
    async prevPeriod() {
      const s = new Date(this.viewDate + 'T12:00:00');
      if (this.habitView === 'week') {
        s.setDate(s.getDate() - 7);
      } else {
        s.setMonth(s.getMonth() - 1);
      }
      this.viewDate = this.toLocalYMD(s);
      this.computeHabitDates();
      await this.loadLogs();
    },
    async nextPeriod() {
      const s = new Date(this.viewDate + 'T12:00:00');
      if (this.habitView === 'week') {
        s.setDate(s.getDate() + 7);
      } else {
        s.setMonth(s.getMonth() + 1);
      }
      this.viewDate = this.toLocalYMD(s);
      this.computeHabitDates();
      await this.loadLogs();
    },

    isFuture(ymd) {
      return ymd > this.toLocalYMD(new Date());
    },

    isCurrentWeek() {
      const today = this.toLocalYMD(new Date());
      return this.weekDates.includes(today);
    },

    async loadLogs() {
      const start = this.habitDates[0];
      const end = this.habitDates[this.habitDates.length - 1];
      const res = await this.authFetch(`./api/habit_logs?start=${start}&end=${end}`);
      if (!res) return;
      const data = await res.json();
      this.logsMap = data.logs || {};
    },

    isMarked(habitId, ymd) {
      const byHabit = this.logsMap[String(habitId)] || {};
      const val = byHabit[ymd];
      if (!val) return false;
      return !!(val.logged || val === 1);
    },

    isStreakActive(habit) {
      if (!habit.streak || habit.streak <= 1) return false;
      const today = this.toLocalYMD(new Date());

      if (habit.frequency === 'daily') {
        const yesterdayDate = new Date();
        yesterdayDate.setDate(yesterdayDate.getDate() - 1);
        const yesterday = this.toLocalYMD(yesterdayDate);
        return this.isMarked(habit.id, today) || this.isMarked(habit.id, yesterday);
      } else {
        // Weekly: check if marked this week or last week
        // Simplified: just check if marked current week for now, or trust simple backend streak
        // If streak > 1, and we have accurate logs, we should see at least one log in the last 7+ days.
        // For simplicity, let's just return true for weekly if streak > 1, assuming weekly cadence is looser.
        // Or better: check if we have ANY log in the last 7 days.
        return true;
      }
    },

    hasNote(habitId, ymd) {
      const byHabit = this.logsMap[String(habitId)] || {};
      const val = byHabit[ymd];
      return val && !!val.hasNote;
    },

    async toggleMark(habitId, ymd) {
      if (this.isFuture(ymd)) {
        this.showToast("Cannot check future dates", "error");
        return;
      }

      let res;
      if (this.isMarked(habitId, ymd)) {
        res = await this.authFetch(`./api/unmark_habit?id=${habitId}&d=${ymd}`, { method: 'POST' });
      } else {
        res = await this.authFetch(`./api/mark_habit?id=${habitId}&d=${ymd}`, { method: 'POST' });
        if (res) {
          this.showToast('Habit completed!', 'success');
          confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']
          });
        }
      }

      if (!res) return;
      const data = await res.json();
      if (data.leveledUp) {
        this.showToast(`Level Up! You are now Level ${data.newLevel}`, 'info');
        confetti({
          particleCount: 200,
          spread: 120,
          origin: { y: 0.6 },
          colors: ['#fbbf24', '#f59e0b', '#d97706', '#3b82f6', '#10b981', '#ffffff']
        });
      }

      // Milestone check: 30-day streak or similar big achievements
      // For demo, let's trigger a big celebration if they have a long longestStreak
      if (this.metrics.longestStreak > 0 && this.metrics.longestStreak % 30 === 0) {
        confetti({
          particleCount: 500,
          spread: 360,
          origin: { y: 0.5 },
          gravity: 0.5,
          scalar: 1.2,
          shapes: ['star']
        });
      }
      if (data.streak === 1) {
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.7 },
          colors: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#ffffff']
        });
        this.showToast('Streak started! Keep it going! 🔥', 'success');
      }

      if (data.newBadges && data.newBadges.length) {
        data.newBadges.forEach(b => this.showToast(`Badge Unlocked: ${b.name} ${b.icon}`, 'success'));
      }

      await Promise.all([this.loadHabits(), this.loadMetrics(), this.loadLogs(), this.loadAnalytics(), this.loadCalendarActivity()]);

      // Perfect day celebration
      if (this.isPerfectDay(ymd)) {
        confetti({
          particleCount: 200,
          spread: 160,
          origin: { y: 0.6 },
          colors: ['#10b981', '#34d399', '#059669']
        });
        this.showToast('Perfect Day! All habits completed!', 'success');
      }
    },

    weekProgress(habit) {
      const dates = this.habitDates || [];
      if (!dates.length) return { percent: 0, percentLabel: '0%', summary: `0/0 this ${this.habitView}` };
      const byHabit = this.logsMap[String(habit.id)] || {};
      let requiredCount = 0;
      let completedCount = 0;
      if (habit.frequency === 'weekly') {
        requiredCount = 1;
        // Check if any date in this view has a log
        completedCount = dates.some(d => {
          const val = byHabit[d];
          return val && (val.logged || val === 1);
        }) ? 1 : 0;
      } else {
        requiredCount = dates.length;
        for (const d of dates) {
          const val = byHabit[d];
          if (val && (val.logged || val === 1)) completedCount++;
        }
      }
      const percent = requiredCount === 0 ? 0 : Math.round((completedCount / requiredCount) * 100);
      return {
        percent,
        percentLabel: `${percent}%`,
        summary: `${completedCount}/${requiredCount} this ${this.habitView}`,
        isMet: habit.frequency === 'weekly' ? completedCount >= 1 : completedCount === requiredCount
      };
    },

    async loadRoutines() {
      const mRes = await this.authFetch('./api/routines?kind=morning');
      const nRes = await this.authFetch('./api/routines?kind=night');
      if (mRes) this.morningRoutine = await mRes.json();
      if (nRes) this.nightRoutine = await nRes.json();
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
        await this.authFetch('./api/routines?id=' + this.routineForm.id, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        this.showToast('Routine updated!');
      } else {
        const list = payload.kind === 'morning' ? this.morningRoutine : this.nightRoutine;
        payload.sort = list.length;

        const res = await this.authFetch('./api/routines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        if (res && res.status === 409) {
          this.showToast('Routine already exists!', 'error');
          return;
        }
        if (res) this.showToast('Routine added!');
      }

      this.routineModal.open = false;
      await this.loadRoutines();
    },

    async removeRoutine(item) {
      await this.authFetch('./api/routines?id=' + item.id, { method: 'DELETE' });
      this.showToast('Routine item deleted');
      await this.loadRoutines();
    },

    async changeRoutineImage(file) {
      if (!file) return;
      const form = new FormData();
      form.append('file', file);
      // Manually calling authFetch for FormData is tricky because of Content-Type 
      // authFetch sets header, but for FormData we usually let browser set Boundary
      // So we will construct headers manually, but NOT Content-Type

      const res = await fetch('./api/upload_routine_image', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.token}` },
        body: form
      });

      // We could patch authFetch to handle this, but explicit here is fine
      if (res.status === 401) { this.logout(); return; }

      this.routineImage = './assets/routine.jpg?ts=' + Date.now();
    },

    async loadRoutineProgress() {
      const res = await this.authFetch(`./api/routines/progress?date=${this.routineDate}`);
      if (!res) return;
      const data = await res.json();
      this.routineProgress.completed = data.completed || [];
    },

    isRoutineDone(id) {
      return this.routineProgress.completed.includes(id);
    },

    async toggleRoutine(id) {
      if (this.isFuture(this.routineDate)) {
        this.showToast("Cannot check future dates", "error");
        return;
      }
      const res = await this.authFetch('./api/routines/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, date: this.routineDate })
      });
      if (!res) return;
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
      this.routineDate = this.toLocalYMD(d);
      await this.loadRoutineProgress();
    },

    routineDateLabel() {
      const d = new Date(this.routineDate);
      const today = this.toLocalYMD(new Date());
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
      if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
      }
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
      if (this.intervalId) return;

      this.intervalId = setInterval(() => {
        if (this.timerPaused) return;
        if (this.timerSeconds > 0) {
          this.timerSeconds--;
        } else {
          this.stopTimer();
          this.completeFlowSession();
        }
      }, 1000);
    },

    pauseTimer() {
      this.timerPaused = !this.timerPaused;
    },

    toggleAmbientSound(sound) {
      if (this.currentAmbientSound === sound) {
        if (this.ambientAudio) {
          this.ambientAudio.pause();
          this.ambientAudio = null;
        }
        this.currentAmbientSound = null;
        return;
      }

      if (this.ambientAudio) {
        this.ambientAudio.pause();
      }

      const sounds = {
        'rain': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3', // Placeholder for actual looping assets
        'lofi': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        'white': 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
      };

      if (sounds[sound]) {
        this.ambientAudio = new Audio(sounds[sound]);
        this.ambientAudio.loop = true;
        this.ambientAudio.play().catch(e => console.error("Audio play failed:", e));
        this.currentAmbientSound = sound;
      }
    },

    stopTimer() {
      if (this.intervalId) {
        clearInterval(this.intervalId);
        this.intervalId = null;
      }
      this.timerActive = false;
      this.timerPaused = false;
      this.timerSeconds = this.timerPreset * 60;
    },

    async completeFlowSession() {
      const res = await this.authFetch('./api/flow/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ minutes: this.timerPreset })
      });
      this.showToast(`Flow Session Complete! +${this.timerPreset} Focus Minutes`, 'success');
      // Update stats
      await this.loadMetrics();
    },

    formatTime(seconds) {
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      return `${m}:${s.toString().padStart(2, '0')}`;
    }
  };
}