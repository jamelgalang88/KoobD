# KoobD

KoobD is a PHP and MySQL story platform with a Capacitor mobile wrapper.

## Run locally

Start the web app and its supporting services with Docker Compose:

```powershell
docker compose up --build
```

Open the application at <http://localhost:8080>. phpMyAdmin is available at
<http://localhost:8081>.

## Project layout

```text
.
├── mobile-app/          Capacitor project and Android wrapper
├── src/
│   ├── assets/
│   │   └── images/
│   │       ├── backgrounds/
│   │       ├── banners/
│   │       ├── blocks/
│   │       ├── books/
│   │       ├── characters/
│   │       ├── grounds/
│   │       ├── icons/
│   │       ├── logos/
│   │       ├── posters/
│   │       └── social/
│   ├── css/             Stylesheets
│   ├── js/              Browser-side application code
│   ├── uploads/         User-uploaded stories and media
│   └── *.php            Web routes and PHP application code
├── compose.yaml         Local web, database, and phpMyAdmin services
├── Dockerfile           PHP/Apache application image
├── init.sql             Database initialization
└── db-start.sh          Database container startup
```

PHP files stay at the web root because their filenames are public routes and
are also used by saved story links. Static images are grouped by purpose under
`src/assets/images/`. The compatibility rewrite in `src/css/img/` keeps
previously saved image URLs working after the asset move.

The mobile wrapper has its own setup and build instructions in
[`mobile-app/README.md`](mobile-app/README.md).
