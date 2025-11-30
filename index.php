<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>FlowTrack</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style> body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto} </style>
</head>
<body class="bg-zinc-50 text-zinc-900">
  <div class="max-w-5xl mx-auto p-6" x-data="appState()" x-init="init()">
    <div class="h-44 md:h-60 rounded-xl overflow-hidden relative mb-6"
         style="background-image: linear-gradient(to bottom, rgba(24,24,27,0.10), rgba(24,24,27,0.10)), url('./assets/cover.jpg'); background-size: cover; background-position: center;">
      <div class="absolute top-2 right-2">
        <input type="file" id="coverInput" class="hidden" @change="
          async ($event) => {
            const f = $event.target.files[0];
            if (!f) return;
            const form = new FormData();
            form.append('file', f);
            await fetch('./api/upload_cover.php', { method: 'POST', body: form });
            // Force reload of the image by appending a cache-busting query
            $event.target.value = '';
            window.location.reload();
          }
        ">
        <label for="coverInput" class="text-xs px-2 py-1 rounded bg-white/70 hover:bg-white cursor-pointer">Change cover</label>
      </div>
    </div>

    <header class="flex items-center justify-between mb-6">
      <h1 class="text-2xl font-semibold">FlowTrack</h1>
      <button @click="createHabit()" class="px-3 py-1.5 rounded bg-zinc-900 text-white text-sm">New</button>
    </header>

    <section class="space-y-6">
      <div class="flex items-end gap-3">
        <div class="flex-1">
          <label class="block text-sm text-zinc-600">Habit</label>
          <input x-model="habitForm.title" class="w-full border border-zinc-200 rounded px-3 py-2" placeholder="e.g., Read 20 min"/>
        </div>
        <div>
          <label class="block text-sm text-zinc-600">Frequency</label>
          <select x-model="habitForm.frequency" class="border border-zinc-200 rounded px-3 py-2">
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
          </select>
        </div>
        <button @click="createHabit()" class="h-10 px-4 rounded bg-zinc-900 text-white">Add</button>
      </div>

      <div class="flex items-center justify-between">
        <div class="text-sm text-zinc-600" x-text="weekTitle()"></div>
        <div class="flex items-center gap-2">
          <button @click="prevWeek()" class="px-2 py-1 rounded border border-zinc-200 hover:bg-zinc-100">←</button>
          <button @click="resetWeek()" class="px-2 py-1 rounded border border-zinc-200 hover:bg-zinc-100">Today</button>
          <button @click="nextWeek()" class="px-2 py-1 rounded border border-zinc-200 hover:bg-zinc-100">→</button>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 overflow-auto border border-zinc-200 rounded bg-white">
          <table class="min-w-full text-sm">
          <thead class="bg-zinc-50">
            <tr>
              <th class="text-left font-medium text-zinc-600 px-4 py-2 w-64">Habit</th>
              <template x-for="d in weekDates">
                <th class="text-center font-medium text-zinc-600 px-2 py-2">
                  <div x-text="new Date(d).toLocaleDateString(undefined,{weekday:'short'})"></div>
                  <div class="text-[10px] text-zinc-400" x-text="new Date(d).getDate()"></div>
                </th>
              </template>
              <th class="px-4 py-2 w-24 text-right font-medium text-zinc-600">Streak</th>
              <th class="px-4 py-2 w-20"></th>
            </tr>
          </thead>
          <tbody>
            <template x-for="h in habits" :key="h.id">
              <tr class="border-t border-zinc-100">
                <td class="px-4 py-3">
                  <div class="font-medium" x-text="h.title"></div>
                  <div class="text-xs text-zinc-500" x-text="h.frequency==='daily' ? 'Daily' : 'Weekly'"></div>
                </td>
                <template x-for="d in weekDates">
                  <td class="px-2 py-2 text-center">
                    <button @click="toggleMark(h.id, d)"
                            :class="isMarked(h.id,d) ? 'bg-zinc-900 text-white' : 'bg-transparent text-zinc-300 border border-zinc-200'"
                            class="h-6 w-6 rounded-sm inline-flex items-center justify-center text-xs"
                            title="Toggle">
                      ✓
                    </button>
                  </td>
                </template>
                <td class="px-4 py-3 text-right text-zinc-700" x-text="h.streak || 0"></td>
                <td class="px-4 py-3 text-right"><button class="hover:underline text-zinc-500" @click="removeHabit(h.id)">Delete</button></td>
              </tr>
            </template>
          </tbody>
          </table>
        </div>

        <div class="lg:col-span-1">
          <div class="rounded-xl border border-zinc-200 bg-white p-4">
            <div class="flex items-center justify-between mb-2">
              <div class="font-medium text-zinc-800">Progress board</div>
              <div class="text-xs text-zinc-500" x-text="weekTitle()"></div>
            </div>
            <div class="space-y-3" x-show="habits.length">
              <template x-for="h in habits" :key="'pb-'+h.id">
                <div>
                  <div class="flex items-center justify-between mb-1">
                    <div class="text-sm text-zinc-700 truncate" x-text="h.title"></div>
                    <div class="text-xs text-zinc-500 tabular-nums" x-text="weekProgress(h).percentLabel"></div>
                  </div>
                  <div class="h-2 w-full rounded bg-zinc-100 overflow-hidden">
                    <div class="h-full rounded bg-zinc-900 transition-all"
                         :style="`width: ${weekProgress(h).percent}%`"></div>
                  </div>
                  <div class="mt-1 text-[11px] text-zinc-500" x-text="weekProgress(h).summary"></div>
                </div>
              </template>
            </div>
            <div class="text-sm text-zinc-500" x-show="!habits.length">No habits yet.</div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="rounded-xl bg-zinc-900 text-white p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="font-semibold">☀️ morning routine</div>
            <button @click="addRoutine('morning')" class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">Add</button>
          </div>
          <ul class="space-y-2 text-sm">
            <template x-for="item in morningRoutine" :key="item.id">
              <li class="flex items-center justify-between gap-2">
                <div class="flex items-start gap-2">
                  <span class="mt-1.5 h-1.5 w-1.5 rounded-full bg-white/60 inline-block"></span>
                  <span x-text="item.text"></span>
                </div>
                <div class="flex items-center gap-2 opacity-80">
                  <button @click="editRoutine(item)" class="text-[11px] hover:underline">Edit</button>
                  <button @click="removeRoutine(item)" class="text-[11px] hover:underline">Delete</button>
                </div>
              </li>
            </template>
          </ul>
        </div>
        <div class="rounded-xl bg-zinc-900 text-white p-5">
          <div class="flex items-center justify-between mb-3">
            <div class="font-semibold">🌙 night routine</div>
            <button @click="addRoutine('night')" class="text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20">Add</button>
          </div>
          <ul class="space-y-2 text-sm">
            <template x-for="item in nightRoutine" :key="item.id">
              <li class="flex items-center justify-between gap-2">
                <div class="flex items-start gap-2">
                  <span class="mt-1.5 h-1.5 w-1.5 rounded-full bg-white/60 inline-block"></span>
                  <span x-text="item.text"></span>
                </div>
                <div class="flex items-center gap-2 opacity-80">
                  <button @click="editRoutine(item)" class="text-[11px] hover:underline">Edit</button>
                  <button @click="removeRoutine(item)" class="text-[11px] hover:underline">Delete</button>
                </div>
              </li>
            </template>
          </ul>
        </div>
        <div class="rounded-xl overflow-hidden">
          <div class="relative">
            <img :src="routineImage" alt="routine" class="w-full h-full object-cover"/>
            <div class="absolute top-2 right-2">
              <input type="file" id="routineInput" class="hidden" @change="async ($event) => { const f = $event.target.files[0]; await changeRoutineImage(f); $event.target.value=''; }">
              <label for="routineInput" class="text-xs px-2 py-1 rounded bg-white/80 hover:bg-white cursor-pointer">Change photo</label>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <script src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js" defer></script>
  <script src="./assets/js/app.js"></script>
</body>
</html> 