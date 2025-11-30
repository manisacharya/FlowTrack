# FlowTrack

Minimalist task and habit manager built with PHP, MySQL, AlpineJS, and TailwindCSS.

## Setup
- Start Apache and MySQL in XAMPP.
- Ensure this project lives in `htdocs/FlowTrack`.
- Visit `http://localhost/FlowTrack/`.
- The app will auto-create the `flowtrack` database and tables on first API call.

## Endpoints
- `api/tasks.php` GET/POST/PUT/DELETE
- `api/categories.php` GET/POST/DELETE
- `api/habits.php` GET/POST/DELETE
- `api/mark_habit.php` POST?id=HABIT_ID
- `api/metrics.php` GET

## Notes
- Default DB credentials: user `root`, empty password.
- Adjust in `api/config.php` if needed. 