# KoobD

KoobD is a PHP and MySQL story platform with a Capacitor mobile wrapper.

## Run locally

Start the web app and its supporting services with Docker Compose:

```powershell
docker compose up --build
```

Open the application at <http://localhost:8080>. phpMyAdmin is available at
<http://localhost:8081>.

### Tablets and phones (https, for speaking practice)

Browsers only allow the microphone on secure addresses, so "Say it"
questions need KoobD's https address on other devices:
`https://<this computer's Wi-Fi address>:8443`.

1. Put this computer's Wi-Fi address (`ipconfig`) in `KOOBD_HOSTS` in
   `compose.yaml`, then run `docker compose up -d --build web`.
2. On each tablet, open `http://<address>:8080/koobd-ca.crt` and install it
   (Android: Settings → Security → Encryption & credentials → Install a
   certificate → CA certificate). Do this once per device.
3. Use `https://<address>:8443` from then on.

The certificate authority lives in `docker/certs/` (ignored by git). Never
share that folder: it holds the private keys. Speaking practice also needs
the internet (Chrome turns speech into text with Google's service); listening
and everything else work offline.

### Versus Mode's live relay

The `relay` service (`relay/versus-relay.js`) passes each player's movement
straight to the other player, so both screens stay in step. It listens on
port 8090 (`ws://`, for http pages) and 8091 (`wss://`, for https pages, with
the same certificate). Allow both ports through the computer's firewall for
classroom devices. Start it on its own with `docker compose up -d relay`.
It makes a shared secret in `docker/certs/relay-secret` on its first start.
If the relay cannot be reached, Versus Mode still works by checking the
server more often, just with a little more delay.

To see the connection numbers while testing, open a match with `&vsdebug`
added to its address and read `window.KoobdVersusDebug` in the console
(`live()`, `rtt()`, `delay()`).

## Project layout

```text
.
├── mobile-app/          Capacitor project and Android wrapper
├── relay/               Versus Mode's live relay (Node, no packages)
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
