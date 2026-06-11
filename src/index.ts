interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * OpenRouter Models MCP.
 *
 * Keyless catalog of ~340 LLMs across every major provider (Anthropic, OpenAI,
 * Google, Meta, Mistral, DeepSeek, xAI, and more) via the OpenRouter models API
 * (openrouter.ai/api/v1). Live cross-provider PRICING, context windows, and
 * capabilities — answers "which models exist, how much do they cost, how big is
 * their context window". Pricing is normalized to $ per 1M tokens for
 * readability. Keyless.
 */


const BASE = 'https://openrouter.ai/api/v1';
const UA = 'pipeworx/1.0 (+https://pipeworx.io)';

interface RawModel {
  id: string;
  canonical_slug?: string;
  name?: string;
  created?: number;
  description?: string;
  context_length?: number;
  architecture?: {
    modality?: string;
    input_modalities?: string[];
    output_modalities?: string[];
    tokenizer?: string;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    request?: string;
    image?: string;
    web_search?: string;
    input_cache_read?: string;
    input_cache_write?: string;
  };
  top_provider?: {
    context_length?: number;
    max_completion_tokens?: number;
    is_moderated?: boolean;
  };
  supported_parameters?: string[];
  knowledge_cutoff?: string | null;
  hugging_face_id?: string | null;
  per_request_limits?: unknown;
}

const tools: McpToolExport['tools'] = [
  {
    name: 'list_models',
    description:
      'List LLMs from the OpenRouter catalog (~340 models across all major providers) with normalized $/1M-token pricing, context windows, and modality. Filter by search, free-only, minimum context, or modality (e.g. "image" for vision models). Sorted cheapest-first by completion price. Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Case-insensitive substring match against model id, name, and description. e.g. "claude", "gpt-4o", "deepseek".',
        },
        free_only: {
          type: 'boolean',
          description: 'If true, only return models whose prompt price is $0 (free tier).',
        },
        min_context: {
          type: 'number',
          description: 'Minimum context_length in tokens, e.g. 100000 or 200000.',
        },
        modality: {
          type: 'string',
          description: 'Substring match on architecture.modality, e.g. "image" to find vision/multimodal models, "text->text" for text-only.',
        },
        limit: {
          type: 'number',
          description: 'Max models to return (default 25, max 60).',
        },
      },
    },
  },
  {
    name: 'get_model',
    description:
      'Get full details for one OpenRouter model by id — normalized $/1M pricing (prompt, completion, plus per-request/image/web-search costs), context window, modality, supported parameters, tokenizer, knowledge cutoff. e.g. id "anthropic/claude-sonnet-4.5". Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'Exact model id, e.g. "anthropic/claude-sonnet-4.5", "openai/gpt-4o", "google/gemini-2.5-pro".',
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'compare_models',
    description:
      'Side-by-side comparison of pricing ($/1M tokens), context window, and modality for 2-5 OpenRouter models. Answers "is claude-sonnet-4.5 cheaper than gpt-4o". Keyless.',
    inputSchema: {
      type: 'object',
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of 2-5 exact model ids, e.g. ["anthropic/claude-sonnet-4.5", "openai/gpt-4o"].',
        },
      },
      required: ['ids'],
    },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  try {
    switch (name) {
      case 'list_models':
        return listModels(args);
      case 'get_model':
        return getModel(args);
      case 'compare_models':
        return compareModels(args);
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

/** Convert a per-token price string to $ per 1M tokens, rounded to 4dp. null if missing. */
function perMillion(priceStr: string | undefined): number | null {
  if (priceStr === undefined || priceStr === null || priceStr === '') return null;
  const n = Number(priceStr);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 1_000_000 * 1e4) / 1e4;
}

function provider(id: string): string {
  const i = id.indexOf('/');
  return i > 0 ? id.slice(0, i) : id;
}

/** Map a raw model into a compact record (full=false) or a detailed one (full=true). */
function mapModel(raw: RawModel, opts: { full?: boolean } = {}): Record<string, unknown> {
  const pricing = raw.pricing ?? {};
  const arch = raw.architecture ?? {};
  const promptPer1m = perMillion(pricing.prompt);
  const completionPer1m = perMillion(pricing.completion);
  const isFree = Number(pricing.prompt ?? NaN) === 0;

  if (!opts.full) {
    return {
      id: raw.id,
      name: raw.name,
      context_length: raw.context_length ?? null,
      prompt_per_1m: promptPer1m,
      completion_per_1m: completionPer1m,
      is_free: isFree,
      modality: arch.modality ?? null,
      provider: provider(raw.id),
    };
  }

  const tp = raw.top_provider ?? {};
  let description = raw.description ?? '';
  if (description.length > 500) description = `${description.slice(0, 500)}…`;

  return {
    id: raw.id,
    name: raw.name,
    description,
    context_length: raw.context_length ?? null,
    pricing: {
      prompt_per_1m: promptPer1m,
      completion_per_1m: completionPer1m,
      input_cache_read_per_1m: perMillion(pricing.input_cache_read),
      input_cache_write_per_1m: perMillion(pricing.input_cache_write),
      request: pricing.request ?? null,
      image: pricing.image ?? null,
      web_search: pricing.web_search ?? null,
    },
    architecture: {
      modality: arch.modality ?? null,
      input_modalities: arch.input_modalities ?? null,
      output_modalities: arch.output_modalities ?? null,
      tokenizer: arch.tokenizer ?? null,
    },
    top_provider: {
      context_length: tp.context_length ?? null,
      max_completion_tokens: tp.max_completion_tokens ?? null,
      is_moderated: tp.is_moderated ?? null,
    },
    supported_parameters: raw.supported_parameters ?? [],
    knowledge_cutoff: raw.knowledge_cutoff ?? null,
    hugging_face_id: raw.hugging_face_id ?? null,
    created: raw.created ? new Date(raw.created * 1000).toISOString() : null,
  };
}

let _cache: RawModel[] | null = null;
/** Fetch + cache the models list within a single call. */
async function orGet(): Promise<RawModel[]> {
  if (_cache) return _cache;
  const res = await fetch(`${BASE}/models`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`openrouter: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { data?: RawModel[] };
  _cache = Array.isArray(body.data) ? body.data : [];
  return _cache;
}

async function listModels(args: Record<string, unknown>): Promise<unknown> {
  const all = await orGet();

  const search = typeof args.search === 'string' ? args.search.trim().toLowerCase() : '';
  const freeOnly = args.free_only === true;
  const minContext = typeof args.min_context === 'number' ? args.min_context : 0;
  const modality = typeof args.modality === 'string' ? args.modality.trim().toLowerCase() : '';
  let limit = typeof args.limit === 'number' ? Math.floor(args.limit) : 25;
  if (!Number.isFinite(limit) || limit < 1) limit = 25;
  if (limit > 60) limit = 60;

  let filtered = all.filter((m) => {
    if (search) {
      const hay = `${m.id} ${m.name ?? ''} ${m.description ?? ''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (freeOnly && Number(m.pricing?.prompt ?? NaN) !== 0) return false;
    if (minContext && (m.context_length ?? 0) < minContext) return false;
    if (modality && !(m.architecture?.modality ?? '').toLowerCase().includes(modality)) return false;
    return true;
  });

  // Sort cheapest-first by completion price ($/1M); nulls last.
  filtered = filtered.sort((a, b) => {
    const av = perMillion(a.pricing?.completion);
    const bv = perMillion(b.pricing?.completion);
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return av - bv;
  });

  const models = filtered.slice(0, limit).map((m) => mapModel(m));
  return { total_available: all.length, count: models.length, models };
}

async function getModel(args: Record<string, unknown>): Promise<unknown> {
  const id = typeof args.id === 'string' ? args.id.trim() : '';
  if (!id) return { error: 'provide a model id, e.g. "anthropic/claude-sonnet-4.5"', id: args.id ?? null };

  const all = await orGet();
  const raw = all.find((m) => m.id === id);
  if (!raw) return { error: 'model not found', id };
  return mapModel(raw, { full: true });
}

async function compareModels(args: Record<string, unknown>): Promise<unknown> {
  const ids = Array.isArray(args.ids) ? args.ids.filter((x): x is string => typeof x === 'string') : [];
  if (ids.length < 2 || ids.length > 5) {
    return { error: 'provide 2-5 model ids', ids };
  }

  const all = await orGet();
  const byId = new Map(all.map((m) => [m.id, m]));

  const comparison: Record<string, unknown>[] = [];
  const notFound: string[] = [];
  for (const id of ids) {
    const raw = byId.get(id);
    if (!raw) {
      notFound.push(id);
      continue;
    }
    const compact = mapModel(raw);
    comparison.push({
      id: compact.id,
      name: compact.name,
      context_length: compact.context_length,
      prompt_per_1m: compact.prompt_per_1m,
      completion_per_1m: compact.completion_per_1m,
      modality: compact.modality,
      is_free: compact.is_free,
    });
  }

  const result: Record<string, unknown> = { count: comparison.length, comparison };
  if (notFound.length) result.not_found = notFound;
  return result;
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
