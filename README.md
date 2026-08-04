# mcp-openrouter

OpenRouter Models MCP.

Part of [Pipeworx](https://pipeworx.io) — an MCP gateway connecting AI agents to 1394+ live data sources.

## Tools

| Tool | Description |
|------|-------------|
| `list_models` | List LLMs from the OpenRouter catalog (~340 models across all major providers) with normalized $/1M-token pricing, context windows, and modality. Filter by search, free-only, minimum context, or modality (e.g. "image" for vision models). Sorted cheapest-first by completion price. Keyless. |
| `get_model` | Get full details for one OpenRouter model by id — normalized $/1M pricing (prompt, completion, plus per-request/image/web-search costs), context window, modality, supported parameters, tokenizer, knowledge cutoff. e.g. id "anthropic/claude-sonnet-4.5". Keyless. |
| `compare_models` | Side-by-side comparison of pricing ($/1M tokens), context window, and modality for 2-5 OpenRouter models. Answers "is claude-sonnet-4.5 cheaper than gpt-4o". Keyless. |

## Quick Start

Add to your MCP client (Claude Desktop, Cursor, Windsurf, etc.):

```json
{
  "mcpServers": {
    "openrouter": {
      "url": "https://gateway.pipeworx.io/openrouter/mcp"
    }
  }
}
```

Or connect to the full Pipeworx gateway for access to all 1394+ data sources:

```json
{
  "mcpServers": {
    "pipeworx": {
      "url": "https://gateway.pipeworx.io/mcp"
    }
  }
}
```

## Using with ask_pipeworx

Instead of calling tools directly, you can ask questions in plain English:

```
ask_pipeworx({ question: "your question about Openrouter data" })
```

The gateway picks the right tool and fills the arguments automatically.

## More

- [Docs and guides](https://pipeworx.io/docs)
- [pipeworx.io](https://pipeworx.io)

## License

MIT
