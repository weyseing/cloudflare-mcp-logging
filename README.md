# Setup: -
- Start up container
    > `docker compose up -d`
- Initialize **package.json**
    - > `npm init -y` (First time to create package.json)
    - > `npm install`

# MCP Server Creation
- Create from CF template
    - > `npm create cloudflare@latest -- mcp-logging --template=cloudflare/ai/demos/remote-mcp-authless`
    - *If **clone template failed**, git clone cloudflare/ai repo below, then recreate*
        > `git clone https://github.com/cloudflare/ai.git`
- Start dev server
    - Update to use `wrangler dev --ip 0.0.0.0` IP in **package.json**
    - Port mapping `8787:8787` in **docker-compose.yml**
    - `npm start` OR `wrangler dev --ip 0.0.0.0`
    - Access via `localhost:8787/sse`

# Deploy CF Worker
- Set CF account ID to **wrangler.jsonc**
    > `"account_id": "<EDIT-HERE>"`
- Set CF API key in env
    - API's permission template: `Edit Cloudflare Workers`
    - ENV: `CLOUDFLARE_API_TOKEN=<EDIT-HERE>`
- Deploy worker to CF
    - `npm run deploy` OR `npx wrangler deploy`

# MCP Inspector
- Start inspector
    > `npx @modelcontextprotocol/inspector@latest`

# Connect via MCP Host/Client
- Ensure `mcp-remote` is installed
    > npm install mcp-remote
- MCP server config
    > ```json
    > {
    >   "mcpServers": {
    >     "CF Remote MCP": {
    >       "command": "mcp-remote",
    >       "args": [
    >         "https://<MCP_SERVER_URL>/sse"
    >       ]
    >     }
    >   }
    > }
    > ```

