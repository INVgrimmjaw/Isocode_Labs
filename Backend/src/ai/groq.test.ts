import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import Groq from 'groq-sdk';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SAMPLE_MESSAGE, SKUS } from '../../prisma/seed-data.ts';
import { readWithGroq } from './groq.ts';
import type { MatchContext } from './matcher.ts';

/** Runs the real SDK against a local stand-in for the API, so the test needs no key and costs nothing. */

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

function completion(finishReason: string, content: string) {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    created: 1,
    model: 'openai/gpt-oss-120b',
    choices: [{ index: 0, finish_reason: finishReason, message: { role: 'assistant', content } }],
  };
}

let server: Server;
let client: Groq;
let lastRequest: { url: string; body: Record<string, any> };
let nextReply: unknown = completion('stop', JSON.stringify(reading));

beforeAll(async () => {
  server = createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      lastRequest = { url: req.url ?? '', body: JSON.parse(raw) };
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(nextReply));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  client = new Groq({ apiKey: 'test-key', baseURL: `http://127.0.0.1:${port}` });
});

afterAll(() => new Promise((resolve) => server.close(resolve)));

const systemPrompt = () => lastRequest.body.messages[0].content as string;
const userPrompt = () => lastRequest.body.messages[1].content as string;

describe('the Groq request', () => {
  it('parses a structured reply into checked lines', async () => {
    nextReply = completion('stop', JSON.stringify(reading));
    const lines = await readWithGroq(client, SAMPLE_MESSAGE, ctx);
    expect(lines).toEqual([
      {
        originalWords: '5 peti biscuit chhota',
        quantity: 5,
        unit: 'CASE',
        candidates: [{ skuId: 'SKU-BS-075', confidence: 0.95 }],
      },
    ]);
  });

  it('asks for strict structured output from the default model at low effort', async () => {
    await readWithGroq(client, SAMPLE_MESSAGE, ctx);
    const { url, body } = lastRequest;
    expect(url).toContain('/openai/v1/chat/completions');
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.reasoning_effort).toBe('low');
    expect(body.response_format.type).toBe('json_schema');
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.stream).toBeFalsy();
  });

  it('sends a schema strict mode accepts: every field required, nothing extra', async () => {
    await readWithGroq(client, SAMPLE_MESSAGE, ctx);
    const schema = lastRequest.body.response_format.json_schema.schema;
    const line = schema.properties.lines.items;
    expect(schema.additionalProperties).toBe(false);
    expect(line.additionalProperties).toBe(false);
    expect([...line.required].sort()).toEqual(Object.keys(line.properties).sort());
    expect(line.properties.quantity.type).toEqual(['number', 'null']);
  });

  it('puts the catalogue first and per-request data after it, so the prefix can be cached', async () => {
    await readWithGroq(client, SAMPLE_MESSAGE, ctx);
    expect(systemPrompt()).toContain('SKU-BS-075');
    expect(systemPrompt()).not.toContain(SAMPLE_MESSAGE);
    expect(userPrompt()).toContain(SAMPLE_MESSAGE);
  });

  it("gives the model this shop's history and vocabulary", async () => {
    await readWithGroq(client, SAMPLE_MESSAGE, ctx);
    expect(userPrompt()).toContain('SKU-BS-075 (in 12 past orders)');
    expect(userPrompt()).toContain('"pila" means SKU-DB-150');
  });

  it('wraps the customer message so it reads as data', async () => {
    await readWithGroq(client, SAMPLE_MESSAGE, ctx);
    expect(userPrompt()).toContain(`<message>\n${SAMPLE_MESSAGE}\n</message>`);
  });

  it('raises when the reply is cut off', async () => {
    nextReply = completion('length', '{"lines": [');
    await expect(readWithGroq(client, SAMPLE_MESSAGE, ctx)).rejects.toThrow(/did not finish/);
  });

  it('raises when the reply is not the expected shape', async () => {
    nextReply = completion('stop', JSON.stringify({ lines: [{ original_words: 'x' }] }));
    await expect(readWithGroq(client, SAMPLE_MESSAGE, ctx)).rejects.toThrow(/wrong shape/);
  });
});
