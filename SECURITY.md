# Security

## Threat model

Quantiom is a single-owner web app. The intended deployment is a public Fly.io
instance the maintainer operates for their own use and as a demo. There is no
user-account system, no persistent storage of user data, and no authentication.

If you self-host Quantiom on a network you don't control, anyone reaching the
URL can use the symbolic simulator. That's by design for the public demo; it
may not be appropriate for your deployment.

## What the server does and doesn't do

- **Receives** JSON descriptions of circuits the user builds in the browser
  (gate ids, qubit indices, symbolic parameter strings).
- **Returns** symbolic statevector amplitudes computed with sympy.
- **Does not** persist any data — every request is stateless.
- **Does not** make outbound network calls.
- **Does not** execute user-supplied code. Symbolic parameter strings are
  parsed through sympy's `sympify` with a restricted `locals` mapping; sympy's
  parser itself is the trust boundary.

## What's NOT in the repo

The following file patterns are gitignored and never committed:

```
.env, .env.*           — environment files
*.pem, *.key           — TLS / private keys
*.p12, *.pfx, *.jks    — keystores
id_rsa*, id_ed25519*   — SSH keys
secrets.*, .secrets    — anything explicitly named "secret"
.fly/                  — local Fly state
```

Fly.io secrets (set via `fly secrets set …`) are stored in Fly's encrypted
secret store, injected into the runtime environment, and never written to the
Docker image.

## Reporting a vulnerability

Since Quantiom is a personal project that does not accept pull requests (see
[`CONTRIBUTING.md`](./CONTRIBUTING.md)), the most direct way to report a
non-sensitive security concern is to open a GitHub
[discussion](../../discussions) or an [issue](../../issues) with the label
"security". For anything sensitive (active exploit, credential exposure),
please contact the maintainer privately rather than filing publicly.

## Known limitations

- **No authentication.** The public Fly instance is open by design.
- **No rate limiting.** Symbolic simulation of large circuits is computationally
  expensive; the simulator is capped at 8 qubits to bound resource use, but
  there is no per-client request limiting yet.
- **sympify trust.** Symbolic parameter strings flow through `sympy.sympify`.
  We pass a restricted `locals` table, but sympy's parser itself is the trust
  boundary — if you discover a parser vector for arbitrary code execution,
  please report it.
