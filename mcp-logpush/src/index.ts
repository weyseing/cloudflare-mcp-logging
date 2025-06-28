import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Define our MCP agent with tools
export class MyMCP extends McpAgent {
	server = new McpServer({
		name: "Authless Calculator",
		version: "1.0.0",
	});

	async init() {
		// calculator tool
		this.server.tool(
			"calculate",
			{
				operation: z.enum(["add", "subtract", "multiply", "divide"]),
				a: z.number(),
				b: z.number(),
			},
			async ({ operation, a, b }) => {
				try {
					// pid
					const processId = Date.now().toString(); 
					console.log(`[${processId}] calculating ${operation} with ${a} and ${b}`);

					// header
					

					// calc operation
					let result: number;
					switch (operation) {
						case "add":
							result = a + b;
							break;
						case "subtract":
							result = a - b;
							break;
						case "multiply":
							result = a * b;
							break;
						case "divide":
							if (b === 0)
								return {
									content: [
										{
											type: "text",
											text: "Error: Cannot divide by zero",
										},
									],
								};
							result = a / b;
							break;
					}
					console.log(`[${processId}] result: ${result}`);
					return { content: [{ type: "text", text: String(result) }] };
				// error handling
				} catch (error: any) {
					console.error("ERROR:", error);
					return { content: [{ type: "text", text: JSON.stringify({ status: "error", error_message: error.message }) }], isError: true };
				}
			}
		);
	}
}

export default {
	fetch(request: Request, env: Env, ctx: ExecutionContext) {
		// auth header
		const authData = request.headers.get('X-Auth');
		if (authData) {
			const parts = authData.split(',');
			let userId: string | undefined;
			let secretKey: string | undefined;
			for (const part of parts) {
				if (part.startsWith('userID_')) {
					userId = part.substring('userID_'.length);
				} else if (part.startsWith('skey_')) {
					secretKey = part.substring('skey_'.length);
				}
			}
			if (userId)
				console.log(`Parsed UserId from X-Auth-Data: ${userId}`);
			if (secretKey) 
				console.log(`Parsed SecretKey from X-Auth-Data: ${secretKey}`);
		} else {
			console.log(`X-Auth-Data header not found.`);
		}

		const url = new URL(request.url);
		if (url.pathname === "/sse" || url.pathname === "/sse/message") {
			return MyMCP.serveSSE("/sse").fetch(request, env, ctx);
		}
		if (url.pathname === "/mcp") {
			return MyMCP.serve("/mcp").fetch(request, env, ctx);
		}
		return new Response("Not found", { status: 404 });
	},
};
