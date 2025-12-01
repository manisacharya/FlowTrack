# FlowTrack

Minimalist task and habit manager built with Node.js, Express, SQLite, AlpineJS, and TailwindCSS.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```
   Or run the executable directly:
   ```bash
   ./src/server.js
   ```

3. Visit `http://localhost:3000`.

## Database
The application uses SQLite (`database.sqlite`). The database file will be automatically created in the project root upon the first run.

## API Endpoints
- `/api/tasks` GET/POST/PUT/DELETE
- `/api/categories` GET/POST
- `/api/habits` GET/POST/DELETE
- `/api/mark_habit` POST?id=HABIT_ID
- `/api/metrics` GET
- `/api/routines` GET/POST/PUT/DELETE

## Legacy
The original PHP backend files have been moved to `legacy_api/`.