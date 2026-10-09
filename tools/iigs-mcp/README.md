# Apple IIgs MCP companion — v0.1

Eight tools connect an MCP client to one explicitly paired browser emulator:
`get_status`, `get_devices`, `read_memory`, `capture_screen`, `pause`, `resume`,
`step`, and `capture_trace`. The CPU, video and audio still run in the browser.

## Start

Requires Node.js 20 or newer. In this directory run `npm ci`.
Configure a **local MCP client** to spawn:

```json
{
  "mcpServers": {
    "iigs": {
      "command": "node",
      "args": ["/absolute/path/to/tools/iigs-mcp/server.mjs"],
      "env": {
        "IIGS_BRIDGE_TOKEN": "replace-with-a-random-secret-of-at-least-24-characters"
      }
    }
  }
}
```

Alternatively `npm start` starts the companion manually; its MCP transport is
stdin/stdout. When no token is supplied it generates one and prints it to stderr.
Generate a token with `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.

Open the emulator, then **Machine → MCP / Debug connection** (legacy UI:
**Load → MCP / Debug connection**). Enter the bridge URL and matching token,
then Connect. Read-only inspection is the default. Check **Allow pause, resume,
stepping and traces** to permit execution control. Disconnect revokes that access.
Credentials are not saved to browser storage. Closing the dialog keeps the connection.

## Connection limits

The browser bridge listens on `127.0.0.1:8788`, accepts only the configured browser
origin (default `https://subnetpie.github.io`), and requires a bearer token. Override
port/origin with `IIGS_BRIDGE_PORT` / `IIGS_BROWSER_ORIGIN`.

This first version provides **local stdio MCP**, not a publicly hosted ChatGPT
connector. For an iPhone/iPad on another device, a trusted HTTPS reverse proxy to
the companion is required; localhost on the phone does not reach your computer.
The proxy must forward the loopback Host header, preserve Authorization and Origin,
and disable request-body logging. Browser local-network/mixed-content restrictions
may also prevent a hosted page from using the default HTTP loopback address.
Remote MCP hosting and OAuth are not included or deployed by this change.

## Semantics

- `read_memory` reads physical backing stores, not CPU-mapped I/O. IIgs regions:
  `ram` (linear fast RAM), `e0`, `e1` (physical slow banks), `rom`. IIe: `main`, `aux`.
  E1 SHR bytes therefore use the emulator's physical mapping. Maximum 4096 bytes.
- `capture_screen` returns the emulated framebuffer PNG, excluding UI and CSS effects.
- `step` / `capture_trace` pause and remain paused. At most 1000 instructions and
  50 ms of host work per call; check `completed`. Peripherals advance through the
  normal motherboard clock. Trace records contain pre-instruction CPU registers.
- Commands expire after 5 seconds and are never automatically replayed. A timeout
  can occur after execution if its reply was lost; inspect status before retrying.
- One browser session owns the bridge; idle sessions expire after 15 seconds.
  Backgrounded/suspended Safari tabs must reconnect after expiry.
- This version cannot mount disks, reset, write RAM, or export audio remotely.

## Verify

`npm test` exercises authentication, pairing isolation, timeouts and a real SDK MCP
client through the browser bridge. From repository root:
`node --test computer/appleii/debug_api.test.mjs` checks side-effect-free inspection,
execution gating, real CPU stepping and peripheral clock advancement.

On an actual iPhone, verify native URL/token inputs, Connect/Disconnect, scrolling,
and control opt-in using a reachable HTTPS bridge. Physical Safari validation is
still required; automated tests exercise the API and transport.
