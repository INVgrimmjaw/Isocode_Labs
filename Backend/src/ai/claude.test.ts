import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Anthropic from '@anthropic-ai/sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_MESSAGE, SKUS } from '../../prisma/seed-data.ts';
import { readWithClaude } from './claude.ts';
import type { MatchContext } from './matcher.ts';

/**
 * Runs the real SDK against a local stand-in for the API, so no key is needed.
 * It proves the request is built and the reply parsed, which a mocked client cannot.
 */

const ctx: MatchContext = {
  skus: SKUS.map((s) => ({
    id: s.code,
    code: s.code,
    name: s.name,
    family: s.family,
    sizeGrams: s.sizeGrams,
    keywords: s.keywords,
  })),
  knownSizes: new Set(SKUS.map((s) => s.sizeGrams)),
  history: new Map([['SKU-BS-075', { orders: 12 }]]),
  aliases: new Map([['pila', 'SKU-DB-150']]),
};

const reading = {
  lines: [
    {
      original_words: '5 peti biscuit chhota',
      quantity: 5,
      unit: 'CASE',
      candidates: [{ sku_code: 'SKU-BS-075', confidence: 0.95 }],
    },
  ],
};

function messageReply(stopReason: string, text: string) {
  return {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    model: 'claude-opus-5-5',
    content: text ? [{ type: 'text', text }] : [],
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 10 },
  };
}

let server: Server;
let client: Anthropic;
let lastRequest: { url: string; headers: Record<string, unknown>; body: Record<string, any> };
let nextReply: unknown = messageReply('end_turn', JSON.stringify(reading));

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      lastRequest = { url: req.url ?? '', headers: req.headers, body: JSON.parse(raw) };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(nextReply));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  client = new Anthropic({ apiKey: 'test-key', baseURL: `http://127.0.0.1:${port}` });
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

describe('the Claude request', () => {
  it('parses a structured reply into checked lines', async () => {
    nextReply = messageReply('end_turn', JSON.stringify(reading));
    const lines = await readWithClaude(client, SAMPLE_MESSAGE, ctx);
    expect(lines).toEqual([
      {
        originalWords: '5 peti biscuit chhota',
        quantity: 5,
        unit: 'CASE',
        candidates: [{ skuId: 'SKU-BS-075', confidence: 0.95 }],
      },
    ]);
  });

  it('asks for structured output from the default model at low effort', async () => {
    await readWithClaude(client, SAMPLE_MESSAGE, ctx);
    const { body } = lastRequest;
    expect(lastRequest.url).toContain('/v1/messages');
    expect(body.model).toBe('claude-opus-5-5');
    expect(body.output_config.effort).toBe('low');
    expect(body.output_config.format.type).toBe('json_schema');
    expect(body.temperature).toBeUndefined();
  });

  it('opts into server-side fallback', async () => {
    await readWithClaude(client, SAMPLE_MESSAGE, ctx);
    expect(lastRequest.body.fallbacks).toBe('default');
    expect(String(lastRequest.headers['anthropic-beta'])).toContain('server-side-fallback-2026-07-01');
  });

  it('caches the catalogue and keeps per-request data after it', async () => {
    await readWithClaude(client, SAMPLE_MESSAGE, ctx);
    const { system, messages } = lastRequest.body;
    expect(system.at(-1).cache_control).toEqual({ type: 'ephemeral' });
    expect(system.at(-1).text).toContain('SKU-BS-075');
    expect(JSON.stringify(system)).not.toContain(SAMPLE_MESSAGE);
    expect(messages[0].content).toContain(SAMPLE_MESSAGE);
  });

  it("gives the model this shop's history and vocabulary", async () => {
    await readWithClaude(client, SAMPLE_MESSAGE, ctx);
    const content: string = lastRequest.body.messages[0].content;
    expect(content).toContain('SKU-BS-075 (in 12 past orders)');
    expect(content).toContain('"pila" means SKU-DB-150');
  });

  it('wraps the customer message so it reads as data', async () => {
    await readWithClaude(client, SAMPLE_MESSAGE, ctx);
    expect(lastRequest.body.messages[0].content).toContain(`<message>\n${SAMPLE_MESSAGE}\n</message>`);
  });

  it('raises on a refusal rather than using an empty reply', async () => {
    nextReply = messageReply('refusal', '');
    await expect(readWithClaude(client, SAMPLE_MESSAGE, ctx)).rejects.toThrow(/declined/);
  });
});
