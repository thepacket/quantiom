# Security

## Threat model

Quantiom is a browser-native, single-owner web app. Everything — the editor,
all three simulators, the visualisers, the OpenQASM 3 round-trip, and the code
exporters — runs entirely in the user's browser. The intended deployment is a
public Fly.io instance the maintainer operates as a demo. There is no
user-account system, no authentication, and no server-side storage of user
data.

The server is deliberately minimal: a FastAPI app that serves the built static
client and exposes a single `/api/health` endpoint for Fly's health check. It
performs no circuit computation and stores nothing.

If you self-host Quantiom on a network you don't control, anyone reaching the
URL can use it. That's by design for the public demo; it may not be appropriate
for your deployment.

## What the server does and doesn't do

- **Serves** the built client (static HTML / JS / CSS) and answers
  `GET /api/health`.
- **Does not** receive, compute, or store circuits — all simulation is
  client-side.
- **Does not** persist any user data; every request is stateless.
- **Does not** make outbound network calls. (The browser does, for the optional
  AI chat — see below.)
- **Does not** execute user-supplied code server-side.

## Client-side considerations

Because all logic runs in the browser, the relevant trust boundaries are local:

- **Local persistence.** Your circuits / tabs, custom gates, noise model, panel
  layout, and — if you use the AI chat — your OpenRouter API key are stored in
  your browser's `localStorage`, on your own machine. Nothing is uploaded to the
  Quantiom server. On a shared or public computer, clear site data when done.
- **Parameter expressions.** Symbolic gate parameters are JIT-compiled with
  `new Function` and evaluated in your own browser tab, on your own input. This
  is self-contained (worst case, a circuit you build mis-evaluates in your own
  session); it is not a server-side or cross-user vector.
- **Untrusted circuits.** Share links encode a circuit in the URL hash
  (gzip + base64url), and the noise importer and OpenQASM parser accept
  user-supplied text. These are parsed as *data* client-side, never executed as
  code. Opening a share link or importing a file you don't trust loads that
  circuit into your editor — review it as you would any untrusted input.

## Third-party services (AI chat)

The optional AI chat panel talks **directly from your browser to the OpenRouter
API**, using an API key you supply. There is no Quantiom server proxy:

- Your key is stored only in your browser's `localStorage` and is sent only to
  OpenRouter, in the `Authorization` header of requests your browser makes.
- The Quantiom server never sees, receives, or logs your key.
- The current circuit (as OpenQASM 3) and your chat messages are sent to
  OpenRouter when you use the panel. Don't paste anything into the chat you
  wouldn't send to a third-party API.
- The chat is entirely opt-in; if you never open it, no outbound requests are
  made.

## Secrets are never committed

These patterns are gitignored and must never be committed:

```
.env, .env.*           — environment files
*.pem, *.key, *.crt    — TLS / private keys / certs
*.p12, *.pfx, *.jks    — keystores
id_rsa*, id_ed25519*   — SSH keys
secrets.*, .secrets    — anything explicitly named "secret"
.fly/                  — local Fly state
```

The deployment needs no server-side application secrets today. If any are ever
required, they will be set via `fly secrets set …` — stored in Fly's encrypted
secret store, injected into the runtime environment, and never written into the
Docker image or the repo. The OpenRouter API key is **not** a server secret: it
is user-provided and lives only in the user's browser.

## Reporting a vulnerability

Since Quantiom is a personal project that does not accept pull requests (see
[`CONTRIBUTING.md`](./CONTRIBUTING.md)), the most direct way to report a
non-sensitive security concern is to open a GitHub
[discussion](../../discussions) or an [issue](../../issues) labelled "security".
For anything sensitive (active exploit, credential exposure), please contact the
maintainer privately rather than filing publicly.

## Known limitations

- **No authentication.** The public Fly instance is open by design.
- **No rate limiting.** The server only serves static files and a health check,
  so there is little to abuse server-side; simulation cost is bounded in each
  user's own browser (statevector capped at 20 qubits, stabilizer tableau at
  1024). There is no per-client request limiting on the static host.
- **Client-side dependency surface.** The app ships third-party JavaScript
  (React, KaTeX, and so on); a vulnerability in a bundled dependency would run
  in the user's browser. Production dependencies are kept clean under
  `npm audit`; dev-only tooling advisories (test / build) do not ship.
- **You trust OpenRouter with chat content.** If you use the AI panel, your
  circuit and messages are sent to OpenRouter under your own account and their
  terms.
