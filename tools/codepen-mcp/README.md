# CodePen MCP

A local MCP server for **CodePen API v2** used by the JSDev project. It gives MCP-compatible clients structured tools for reading and editing CodePen Pens while keeping the CodePen API key outside source control.

## Requirements

- Node.js 20+
- A CodePen API v2 key from **CodePen → Settings → API**

## Security first

If an API key has ever been pasted into a chat, issue tracker, source file, or other shared location, rotate it before using this server.

Never place the key in `src/index.js` or commit it to Git. Supply it to the MCP process as `CODEPEN_API_KEY`.

## Install

From `tools/codepen-mcp`:

```bash
npm install
npm run check
```

## Run directly

macOS/Linux:

```bash
CODEPEN_API_KEY='cp_user_REPLACE_ME' npm start
```

PowerShell:

```powershell
$env:CODEPEN_API_KEY='cp_user_REPLACE_ME'
npm start
```

The server uses MCP over **stdio**, so normally the MCP client starts it for you.

## MCP client configuration

Point the MCP client at this JSDev checkout. Example:

```json
{
  "mcpServers": {
    "codepen": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/subnetpie.github.io/tools/codepen-mcp/src/index.js"],
      "env": {
        "CODEPEN_API_KEY": "cp_user_REPLACE_ME"
      }
    }
  }
}
```

If the client provides an encrypted secret/environment-variable UI, use that instead of writing the key into JSON.

## Tools

### Read

- `list_pens`
- `get_pen`
- `get_pen_files`
- `get_pen_file`
- `list_versions`
- `get_version`
- `get_build`
- `list_assets`

### Write

- `create_pen`
- `update_pen_metadata`
- `write_pen_file`
- `update_pen_files`
- `delete_pen_file`
- `restore_version`

This release intentionally does **not** expose Pen deletion, asset deletion, collaborator administration, or deployment operations.

## Safe file editing

CodePen file writes create a new version and build. For edits, use this workflow:

1. Call `get_pen` or `get_pen_files`.
2. Capture the current saved version ID.
3. Call `write_pen_file` or `update_pen_files` with `expected_version_id`.
4. If CodePen returns HTTP 409, re-read the Pen before attempting another edit.
5. Inspect the returned build. If needed, call `get_build` for diagnostics.

This avoids silently replacing edits made by another browser session or tool.

## Environment variables

| Variable | Required | Default |
| --- | --- | --- |
| `CODEPEN_API_KEY` | Yes | — |
| `CODEPEN_API_BASE` | No | `https://api.codepen.io/v2` |

## Notes

- Classic Pens can be read but are not writable through the v2 file-write workflow.
- This implementation handles text Pen files. Binary upload support can be added later if needed.
- CodePen's compiler may modify files during a build. Read the resulting version/build before chaining dependent writes.
