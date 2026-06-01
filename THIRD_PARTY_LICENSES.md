# Third-party licenses

Quantiom itself is licensed under the [MIT License](./LICENSE). It depends on,
and (for the server-side Python components) redistributes in its Docker image,
the third-party software listed below. Each remains under its own license; the
notices and obligations here are preserved as those licenses require.

This file is informational, not legal advice.

## Client — JavaScript / TypeScript (bundled into the static assets)

| Package | License | Notes |
|---|---|---|
| React | MIT | UI framework |
| React-DOM | MIT | DOM renderer for React |
| Vite | MIT | dev server and build tool (only the runtime helpers ship in the bundle) |
| KaTeX | MIT | LaTeX math rendering (CSS + fonts also shipped) |
| TypeScript | Apache-2.0 | compile-time only; not bundled |

KaTeX ships its own font files (KaTeX_*) which are produced from the
Computer Modern fonts and are distributed under the SIL Open Font License 1.1.

## Server — Python (bundled in the Docker image)

| Package | License | Notes |
|---|---|---|
| FastAPI | MIT | HTTP framework |
| Starlette | BSD-3-Clause | FastAPI's ASGI core |
| Uvicorn | BSD-3-Clause | ASGI server |
| Pydantic | MIT | request/response validation |
| **sympy** | **BSD-3-Clause** | symbolic mathematics — the core of Quantiom's symbolic statevector pipeline |
| NumPy | BSD-3-Clause | numerical arrays (used by sympy and reserved for the future numeric path) |
| mpmath | BSD-3-Clause | arbitrary-precision arithmetic (sympy dependency) |
| anyio | MIT | async runtime (Starlette dependency) |
| h11, httptools, websockets, uvloop, watchfiles | MIT / BSD-3-Clause | Uvicorn dependencies |
| python-dotenv | BSD-3-Clause | optional, used in dev |
| typing-extensions | PSF-2.0 | type-system helpers |

All bundled server dependencies are permissively licensed (BSD/MIT/PSF). None
of them are copyleft; Quantiom does not redistribute any LGPL/GPL code in the
production image.

## Reproducing the dependency tree

- Client lockfile: [`client/package-lock.json`](./client/package-lock.json)
- Server constraints: [`server/pyproject.toml`](./server/pyproject.toml)

Run `npm ls` in `client/` or `pip show <package>` in the server venv to obtain
the exact installed versions for any deployment.
