# FlowTrack Product Documentation

## Introduction
**FlowTrack** is a minimalist yet powerful habit and routine manager designed to help you build consistency, track your progress, and stay focused. It combines essential productivity tools with gamification elements to make self-improvement engaging and rewarding.

## Core Features

### 1. Habit Tracking
Build lasting habits with a flexible tracking system.
- **Customizable Habits**: Define habits with custom titles, icons, colors, and frequencies (Daily or Weekly).
- **Streak Tracking**: Visualize your consistency with streak counters and "fire" indicators for active streaks.
- **Detailed Logs**: View your history on a weekly or monthly calendar.
- **Daily Notes**: Add context to your progress by attaching notes to any habit entry (e.g., "Felt tired but did it anyway").
- **Smart Reminders**: Set specific notification times for each habit to stay on track.

### 2. Routine Management
Structure your day with dedicated Morning and Night routines.
- **Checklist Style**: Simple, satisfying checkbox interface for daily routines.
- **Progress Tracking**: See your daily routine completion percentage at a glance.
- **Admin Managed**: Standard routines can be configured by administrators to guide users.

### 3. Focus Mode
Deep work made easy with built-in focus tools.
- **Pomodoro Timer**: customizable timer presets (5, 15, 25, 45, 60 mins).
- **Ambient Sounds**: Mask distractions with high-quality background sounds (Rain, Forest, Lo-Fi Cafe).
- **XP Rewards**: Earn Experience Points (XP) for every minute of focused work.

### 4. Gamification
Stay motivated with a leveling system.
- **XP & Levels**: Earn XP for completing habits, routines, and focus sessions to level up.
- **Badges**: Unlock special badges for milestones like "7-Day Streak", "Early Bird", or "Night Owl".
- **Rankings**: See your rank based on your level.

### 5. Insights & Analytics
Understand your behavior with visual reports.
- **Heatmaps**: A GitHub-style contribution graph showing your activity over the year.
- **Progress Charts**: Visualize completion rates for Morning vs. Night routines.
- **Habit Statistics**: Track your longest streaks, total active habits, and overall completion rates.

### 6. AI Coach
Get personalized advice based on your data.
- **Smart Feedback**: The AI Coach analyzes your streaks, activity levels, and recent logs to offer tailored encouragement and tips.

### 7. Mobile Ready (PWA)
Install FlowTrack on your device.
- **Progressive Web App**: Add to your home screen on iOS or Android for a native app-like experience.
- **Offline Capable**: Core assets are cached for fast loading, thanks to the integrated Service Worker.

## Getting Started

### Prerequisites
- **Node.js** (v14 or higher)
- **npm** (Node Package Manager)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/manisacharya/FlowTrack.git
   cd FlowTrack
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the application:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   `http://localhost:3000`

### Initial Setup
- The application uses a local SQLite database (`database.sqlite`) which is created automatically on the first run.
- Register a new account to get started. The first user created does *not* automatically become an admin (this requires manual database update or using the provided admin registration flow if enabled/configured), but broadly speaking, the app supports multi-user usage.

## User Guide

### Dashboard Overview
The main dashboard gives you a snapshot of your day:
- **Top Bar**: Navigation (Habits, Routines, Reports) and Quick Actions (Focus Timer, AI Coach, Profile).
- **Summary Cards**: View your Active Habits count, Current Level, Longest Streak, and Total XP.

### Managing Habits
1. **Create**: Click `+ New Habit`. Enter a title, choose an icon/color, selecting frequency (Daily/Weekly), and optionally set a notification time.
2. **Track**: Click the date cell for a habit to toggle its status (Done/Not Done).
3. **Note**: Click the small "plus" or "note" icon in the corner of a completed day to add a journal entry.
4. **Edit/Delete**: Hover over the habit name to reveal the menu (three dots) to edit or delete.

### Using Focus Mode
1. Click the **Stopwatch (⏱️)** icon in the header.
2. Select a duration (e.g., 25m).
3. (Optional) Select a background sound.
4. Click **Start**.
5. When the timer ends, your points are automatically awarded.

## Technical Overview

### Tech Stack
- **Backend**: Node.js with Express framework.
- **Database**: SQLite (lightweight, file-based relational database).
- **Frontend**: 
  - **HTML5** & **Vanilla JavaScript** for logic.
  - **Alpine.js** for reactive UI components (modals, state management).
  - **TailwindCSS** for styling (via CDN).
  - **Chart.js** for analytics visualizations.

### Project Structure
- `public/`: Static files (HTML, CSS, Client-side JS, Service Worker).
  - `assets/`: Images and uploaded content.
  - `js/app.js`: Main frontend logic (Vue/Alpine-like state store).
- `src/`: Backend source code.
  - `server.js`: Main application entry point, API routes, and server configuration.
  - `database.js`: Database connection and schema initialization.

### Authentication
- Uses **JWT (JSON Web Tokens)** for stateless authentication.
- Passwords are hashed using **bcryptjs** for security.

### API Endpoints
- **Auth**: `/api/register`, `/api/login`, `/api/me`
- **Habits**: `/api/habits` (CRUD), `/api/mark_habit`, `/api/habit_note`
- **Routines**: `/api/routines`, `/api/routines/toggle`
- **Metrics**: `/api/metrics`, `/api/analytics`, `/api/calendar_activity`
- **Focus**: `/api/focus/complete`

---
*FlowTrack is designed to be a private, self-hosted productivity companion.*
