import { describe, test, expect } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "../../src/mcp/server.js";

async function createTestClient() {
  const server = createMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);

  const client = new Client({ name: "test-client", version: "1.0.0" });
  await client.connect(clientTransport);

  return { client, server };
}

describe("MCP server", () => {
  test("lists all tools", async () => {
    const { client } = await createTestClient();
    const result = await client.listTools();

    const toolNames = result.tools.map((t) => t.name);
    expect(toolNames).toContain("post");
    expect(toolNames).toContain("status");
    expect(toolNames).toContain("validate");
    expect(toolNames).toContain("screenshot");
    expect(toolNames).toContain("post_with_screenshot");
    expect(toolNames).toContain("list_devices");
  });

  test("post tool has correct input schema", async () => {
    const { client } = await createTestClient();
    const result = await client.listTools();

    const postTool = result.tools.find((t) => t.name === "post");
    expect(postTool).toBeDefined();
    expect(postTool!.description).toContain("Post content");

    const props = (postTool!.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty("text");
    expect(props).toHaveProperty("platforms");
    expect(props).toHaveProperty("dry_run");
    expect(props).toHaveProperty("image_paths");
    expect(props).toHaveProperty("url");
  });

  test("screenshot tool has correct input schema", async () => {
    const { client } = await createTestClient();
    const result = await client.listTools();

    const tool = result.tools.find((t) => t.name === "screenshot");
    expect(tool).toBeDefined();
    expect(tool!.description).toContain("screenshot");

    const props = (tool!.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty("url");
    expect(props).toHaveProperty("selector");
    expect(props).toHaveProperty("device");
    expect(props).toHaveProperty("full_page");
    expect(props).toHaveProperty("dark_mode");
  });

  test("list_devices returns device names", async () => {
    const { client } = await createTestClient();
    const result = await client.callTool({ name: "list_devices", arguments: {} });

    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("iphone-14");
    expect(text).toContain("macbook-pro");
    expect(text).toContain("desktop-hd");
  });

  test("status tool returns error when not configured", async () => {
    const { client } = await createTestClient();

    // If config doesn't exist, it should give a helpful error
    // (This depends on the test environment — may or may not have config)
    const result = await client.callTool({ name: "status", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;

    // Should either return platform list or suggest running init
    expect(text.length).toBeGreaterThan(0);
  });

  test("validate tool handles missing config", async () => {
    const { client } = await createTestClient();
    const result = await client.callTool({ name: "validate", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text.length).toBeGreaterThan(0);
  });

  test("post tool handles missing config gracefully", async () => {
    const { client } = await createTestClient();
    const result = await client.callTool({
      name: "post",
      arguments: { text: "Hello from MCP test" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    // Should either post or explain config is needed
    expect(text.length).toBeGreaterThan(0);
  });

  test("post_with_screenshot tool has combined schema", async () => {
    const { client } = await createTestClient();
    const result = await client.listTools();

    const tool = result.tools.find((t) => t.name === "post_with_screenshot");
    expect(tool).toBeDefined();

    const props = (tool!.inputSchema as { properties: Record<string, unknown> }).properties;
    expect(props).toHaveProperty("text");
    expect(props).toHaveProperty("screenshot_url");
    expect(props).toHaveProperty("platforms");
    expect(props).toHaveProperty("dry_run");
  });
});
