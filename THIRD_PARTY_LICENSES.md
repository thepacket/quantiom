# Third-party licenses

Quantiom itself is licensed under the [MIT License](./LICENSE). It depends on,
and (for the small server-side Python runtime) redistributes in its Docker
image, the third-party software listed below. Each remains under its own
license; the notices and obligations here are preserved as those licenses
require.

This file is informational, not legal advice.

## Architecture context

The quantum simulator and every visualization, optimisation, transpilation,
tomography, and noise-channel pipeline runs **entirely in the browser** as
TypeScript on a `Float64Array`. The Python server's only jobs are
`/api/health` for Fly's checks and serving the built client as static
files. The previous Python toolchain — sympy / NumPy / Pydantic /
mpmath — was removed when the simulator moved to TypeScript (see the
commit history and the comment in [Dockerfile](./Dockerfile) line 32:
*"Server is just a static host now — the quantum simulator runs in the
browser. Drop sympy, numpy, pydantic; FastAPI + uvicorn is enough."*).
Older revisions of this file listed those packages; they are no longer
installed and no longer apply.

## Client — JavaScript / TypeScript (bundled into the static assets)

Direct runtime dependencies (defined in [`client/package.json`](./client/package.json)):

| Package | License | Notes |
|---|---|---|
| React | MIT | UI framework |
| React-DOM | MIT | DOM renderer for React |
| KaTeX | MIT | LaTeX math rendering used in a handful of panel labels (CSS + fonts also shipped) |

KaTeX ships its own font files (KaTeX_*) which are produced from the
Computer Modern fonts and are distributed under the **SIL Open Font
License 1.1** alongside KaTeX's MIT-licensed code.

Build- and type-time dependencies (not bundled into the production assets):

| Package | License | Notes |
|---|---|---|
| TypeScript | Apache-2.0 | compile-time only |
| Vite | MIT | dev server and build tool; only its small runtime helpers ship in the production bundle |
| `@vitejs/plugin-react` | MIT | Vite plugin |
| `@types/react`, `@types/react-dom`, `@types/katex` | MIT | type definitions; erased at build time |
| `@webgpu/types` | BSD-3-Clause | type definitions for the WebGPU API; erased at build time |

## Server — Python (bundled in the Docker image)

Direct runtime dependencies (defined in
[`server/pyproject.toml`](./server/pyproject.toml)) and explicitly
installed in [`Dockerfile`](./Dockerfile):

| Package | License | Notes |
|---|---|---|
| FastAPI | MIT | HTTP framework — used by `/api/health` and the static-file mount |
| Uvicorn[standard] | BSD-3-Clause | ASGI server; the `[standard]` extra pulls in a few additional optional libraries |

The transitive dependency tree pulled in by `pip install` for the two
packages above (as of the most recent Docker build) — these are not
called by Quantiom code directly but are part of the production image:

| Package | License | Pulled in by |
|---|---|---|
| Starlette | BSD-3-Clause | FastAPI |
| Pydantic | MIT | FastAPI (response model machinery; we don't define any models) |
| `pydantic-core` | MIT | Pydantic |
| `annotated-types` | MIT | Pydantic |
| `typing-extensions` | PSF-2.0 | FastAPI / Pydantic |
| `anyio` | MIT | Starlette |
| `sniffio` | MIT / Apache-2.0 | anyio |
| `idna` | BSD-3-Clause | anyio |
| `click` | BSD-3-Clause | Uvicorn |
| `h11` | MIT | Uvicorn |
| `httptools` | MIT | `uvicorn[standard]` extra |
| `websockets` | BSD-3-Clause | `uvicorn[standard]` extra |
| `uvloop` | Apache-2.0 / MIT (dual) | `uvicorn[standard]` extra |
| `watchfiles` | MIT | `uvicorn[standard]` extra |
| `python-dotenv` | BSD-3-Clause | `uvicorn[standard]` extra |

All bundled server dependencies are permissively licensed
(MIT / BSD-3-Clause / Apache-2.0 / PSF-2.0). None are copyleft;
Quantiom does not redistribute any LGPL/GPL code in the production
image.

## Reproducing the dependency tree

- Client lockfile: [`client/package-lock.json`](./client/package-lock.json)
- Server constraints: [`server/pyproject.toml`](./server/pyproject.toml)
  and the two `pip install` lines in [`Dockerfile`](./Dockerfile).

Run `npm ls --omit=dev` in `client/` for the exact bundled JS tree;
`pip list` inside the production image (`fly ssh console` → `pip list`)
for the exact installed Python tree.
