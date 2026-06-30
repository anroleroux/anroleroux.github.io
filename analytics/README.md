# Analytics dashboard

A local Grafana that reads page-visit data straight from the Supabase Postgres
database (`sessions` + `page_views`). Spin it up when you want to look at your
analytics, shut it down when you're done — no data is copied or stored locally
beyond Grafana's own config.

## Setup

1. Copy the env file and fill in your database password:

   ```sh
   cp analytics/.env.example analytics/.env
   ```

   Open `analytics/.env` and set `SUPABASE_DB_PASSWORD`. Confirm
   `SUPABASE_DB_HOST` / `SUPABASE_DB_USER` match what the Supabase dashboard
   shows under **Project → Connect → Session pooler** (the region prefix may be
   `aws-0` or `aws-1`).

2. Start it from the repo root (where `docker-compose.yml` lives):

   ```sh
   docker compose up -d
   ```

3. Open <http://localhost:3000> and log in (default `admin` / `admin`, or
   whatever you set in `.env`). The **Page Visits** dashboard is under the
   *Analytics* folder — it's provisioned automatically.

4. Stop it when done:

   ```sh
   docker compose down
   ```

## What's on the dashboard

- Page views, unique visitors, new sessions, and distinct countries (stat tiles)
- Page views + new sessions over time
- Top pages, referrers, and countries
- A world map of visitor locations (by session lat/long)
- Top cities and a recent-page-views feed

The time range (default: last 30 days) is controlled by the picker top-right;
every panel respects it.

## Notes

- Grafana connects with the `postgres` role, which bypasses RLS, so it sees all
  rows. Keep `.env` out of version control (it's gitignored).
- Bot traffic is already filtered at write time by the `track-visit` edge
  function, so these numbers reflect real visits.
- The map and country panels depend on geo data; rows where geo lookup failed
  simply don't appear there.
