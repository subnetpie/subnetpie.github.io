#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { z } from "zod";

const API_KEY = process.env.CODEPEN_API_KEY;
const API_BASE = (process.env.CODEPEN_API_BASE || "https://api.codepen.io/v2").replace(/\/$/, "");

if (!API_KEY) {
  console.error("CODEPEN_API_KEY is required. Set it in the MCP client's environment configuration.");
  process.exit(1);
}

const server = new McpServer({
  name: "codepen",
  version: "1.0.0"
});

class CodePenApiError extends Error {
  constructor(message, { status, body, method, url } = {}) {
    super(message);
    this.name = "CodePenApiError";
    this.status = status;
    this.body = body;
    this.method = method;
    this.url = url;
  }
}

function cleanObject(value) {
  if (Array.isArray(value)) return value.map(cleanObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => [k, cleanObject(v)])
  );
}

function encodeFilePath(path) {
  return String(path)
    .replace(/^\/+/, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
}

function addQuery(url, query = {}) {
  const u = new URL(url);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") {
      u.searchParams.set(key, String(value));
    }
  }
  return u.toString();
}

async function codepenRequest(method, path, { query, body } = {}) {
  const url = addQuery(`${API_BASE}${path}`, query);
  const headers = {
    Authorization: `Bearer ${API_KEY}`,
    Accept: "application/json"
  };

  const options = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(cleanObject(body));
  }

  const response = await fetch(url, options);
  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!response.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    throw new CodePenApiError(
      `CodePen API ${method} ${path} failed with HTTP ${response.status}${detail ? `: ${detail}` : ""}`,
      { status: response.status, body: data, method, url }
    );
  }

  return {
    data,
    link: response.headers.get("link") || undefined
  };
}

function jsonResult(value) {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }]
  };
}

function errorResult(error) {
  const payload = {
    error: error?.message || String(error)
  };
  if (error instanceof CodePenApiError) {
    payload.status = error.status;
    payload.details = error.body;
  }
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
  };
}

async function tool(fn) {
  try {
    return await fn();
  } catch (error) {
    return errorResult(error);
  }
}

const accessSchema = z.enum(["Public", "Private", "Protected", "Collaborators"]);
const waitSchema = z.number().int().min(0).max(60).optional().describe("Seconds for CodePen to wait for the build before returning.");

server.registerTool(
  "list_pens",
  {
    description: "List the API key owner's CodePen Pens. Supports common CodePen v2 filters and pagination.",
    inputSchema: z.object({
      access: accessSchema.optional(),
      editor: z.enum(["V2", "Classic"]).optional(),
      search_term: z.string().optional(),
      tags: z.array(z.string()).optional(),
      sort: z.string().optional(),
      direction: z.enum(["asc", "desc"]).optional(),
      page: z.number().int().positive().optional(),
      per_page: z.number().int().min(1).max(100).optional()
    })
  },
  async (args) => tool(async () => {
    const query = { ...args, tags: args.tags?.join(",") };
    const result = await codepenRequest("GET", "/pens", { query });
    return jsonResult({ pens: result.data, link: result.link });
  })
);

server.registerTool(
  "get_pen",
  {
    description: "Get metadata for one CodePen Pen by ID.",
    inputSchema: z.object({ id: z.string().min(1) })
  },
  async ({ id }) => tool(async () => jsonResult((await codepenRequest("GET", `/pens/${encodeURIComponent(id)}`)).data))
);

server.registerTool(
  "get_pen_files",
  {
    description: "Read all files at a Pen's saved head, including text file contents.",
    inputSchema: z.object({ id: z.string().min(1) })
  },
  async ({ id }) => tool(async () => jsonResult((await codepenRequest("GET", `/pens/${encodeURIComponent(id)}/files`)).data))
);

server.registerTool(
  "get_pen_file",
  {
    description: "Read one file from a Pen by path, including content for text files.",
    inputSchema: z.object({
      id: z.string().min(1),
      path: z.string().min(1).describe("File path, e.g. /src/app.js or index.html")
    })
  },
  async ({ id, path }) => tool(async () => jsonResult((await codepenRequest("GET", `/pens/${encodeURIComponent(id)}/files/${encodeFilePath(path)}`)).data))
);

const penFileSchema = z.object({
  path: z.string().min(1),
  content: z.string()
});

server.registerTool(
  "create_pen",
  {
    description: "Create a CodePen 2.0 Pen. Supplying files creates those source files and triggers a build.",
    inputSchema: z.object({
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      access: accessSchema.optional(),
      password: z.string().optional(),
      wait: waitSchema,
      files: z.array(penFileSchema).optional()
    })
  },
  async (args) => tool(async () => jsonResult((await codepenRequest("POST", "/pens", { body: args })).data))
);

server.registerTool(
  "update_pen_metadata",
  {
    description: "Update Pen metadata without changing its files or creating a new version.",
    inputSchema: z.object({
      id: z.string().min(1),
      title: z.string().optional(),
      description: z.string().optional(),
      tags: z.array(z.string()).optional(),
      template: z.boolean().optional(),
      access: accessSchema.optional(),
      password: z.string().optional()
    })
  },
  async ({ id, ...body }) => tool(async () => jsonResult((await codepenRequest("PATCH", `/pens/${encodeURIComponent(id)}`, { body })).data))
);

server.registerTool(
  "write_pen_file",
  {
    description: "Create or replace one text file in a Pen. Prefer passing expected_version_id from the Pen's saved head to prevent overwriting concurrent changes.",
    inputSchema: z.object({
      id: z.string().min(1),
      path: z.string().min(1),
      content: z.string(),
      expected_version_id: z.string().optional(),
      wait: waitSchema
    })
  },
  async ({ id, path, content, expected_version_id, wait }) => tool(async () => {
    const body = { content, expected_version_id, wait };
    return jsonResult((await codepenRequest("PUT", `/pens/${encodeURIComponent(id)}/files/${encodeFilePath(path)}`, { body })).data);
  })
);

const fileChangeSchema = z.union([
  z.object({ path: z.string().min(1), content: z.string() }),
  z.object({ id: z.string().min(1), content: z.string() }),
  z.object({ id: z.string().min(1), path: z.string().min(1), content: z.string().optional() }),
  z.object({ path: z.string().min(1), delete: z.literal(true) }),
  z.object({ id: z.string().min(1), delete: z.literal(true) })
]);

server.registerTool(
  "update_pen_files",
  {
    description: "Apply multiple Pen file changes atomically as one new version/build. Supports create, update, move, and delete changes.",
    inputSchema: z.object({
      id: z.string().min(1),
      files: z.array(fileChangeSchema).min(1),
      expected_version_id: z.string().optional(),
      wait: waitSchema
    })
  },
  async ({ id, files, expected_version_id, wait }) => tool(async () => {
    const body = { files, expected_version_id, wait };
    return jsonResult((await codepenRequest("PUT", `/pens/${encodeURIComponent(id)}/files`, { body })).data);
  })
);

server.registerTool(
  "delete_pen_file",
  {
    description: "Delete one file, or every file under a directory path, from a Pen. Creates a new version/build.",
    inputSchema: z.object({
      id: z.string().min(1),
      path: z.string().min(1),
      expected_version_id: z.string().optional(),
      wait: waitSchema
    })
  },
  async ({ id, path, expected_version_id, wait }) => tool(async () => {
    const query = { expected_version_id, wait };
    return jsonResult((await codepenRequest("DELETE", `/pens/${encodeURIComponent(id)}/files/${encodeFilePath(path)}`, { query })).data);
  })
);

server.registerTool(
  "list_versions",
  {
    description: "List saved versions for a CodePen 2.0 Pen.",
    inputSchema: z.object({
      id: z.string().min(1),
      page: z.number().int().positive().optional(),
      per_page: z.number().int().min(1).max(100).optional()
    })
  },
  async ({ id, ...query }) => tool(async () => {
    const result = await codepenRequest("GET", `/pens/${encodeURIComponent(id)}/versions`, { query });
    return jsonResult({ versions: result.data, link: result.link });
  })
);

server.registerTool(
  "get_version",
  {
    description: "Get one CodePen version including its source files and build information.",
    inputSchema: z.object({ version_id: z.string().min(1) })
  },
  async ({ version_id }) => tool(async () => jsonResult((await codepenRequest("GET", `/versions/${encodeURIComponent(version_id)}`)).data))
);

server.registerTool(
  "restore_version",
  {
    description: "Restore an older version to a Pen's current head.",
    inputSchema: z.object({
      id: z.string().min(1),
      version_id: z.string().min(1)
    })
  },
  async ({ id, version_id }) => tool(async () => jsonResult((await codepenRequest("POST", `/pens/${encodeURIComponent(id)}/versions/${encodeURIComponent(version_id)}/restore`, { body: {} })).data))
);

server.registerTool(
  "get_build",
  {
    description: "Get build status, diagnostics, patches, and compiled files for a version/build ID.",
    inputSchema: z.object({ version_id: z.string().min(1) })
  },
  async ({ version_id }) => tool(async () => jsonResult((await codepenRequest("GET", `/builds/${encodeURIComponent(version_id)}`)).data))
);

server.registerTool(
  "list_assets",
  {
    description: "List the API key owner's CodePen Assets.",
    inputSchema: z.object({
      sort: z.string().optional(),
      direction: z.enum(["asc", "desc"]).optional(),
      page: z.number().int().positive().optional(),
      per_page: z.number().int().min(1).max(100).optional()
    })
  },
  async (query) => tool(async () => {
    const result = await codepenRequest("GET", "/assets", { query });
    return jsonResult({ assets: result.data, link: result.link });
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
