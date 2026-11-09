import type { CaptureEngine } from '#shared/api';
import { defaultClaudeClient, readWithClaude, type ClaudeClient } from './claude.ts';
import { parseMessage, parseOriginalWords } from './parse.ts';
import type { MatchContext } from './rank.ts';
import { resolveLine, type ResolvedLine } from './resolve.ts';

export interface MessageReading {
  engine: CaptureEngine;
  engineNote: string | null;
  lines: ResolvedLine[];
}

const NOTE_NO_KEY = 'AI is not configured, so the built-in matcher read this message.';
const NOTE_FAILED = 'AI could not read this message just now, so the built-in matcher did.';

function readWithMatcher(text: string, ctx: MatchContext, engineNote: string): MessageReading {
  return {
    engine: 'MATCHER',
    engineNote,
    lines: parseMessage(text, ctx.knownSizes).map((item) => resolveLine(item, text, ctx)),
  };
}

/** Always returns a reading. An AI outage slows the desk down, but must never stop orders. */
export async function readMessage(
  text: string,
  ctx: MatchContext,
  client: ClaudeClient | null = defaultClaudeClient(),
): Promise<MessageReading> {
  if (!client) return readWithMatcher(text, ctx, NOTE_NO_KEY);

  try {
    const modelLines = await readWithClaude(client, text, ctx);
    if (modelLines.length === 0) return readWithMatcher(text, ctx, NOTE_FAILED);
    return {
      engine: 'CLAUDE',
      engineNote: null,
      lines: modelLines.map((line) =>
        resolveLine(parseOriginalWords(line.originalWords, ctx.knownSizes), text, ctx, line),
      ),
    };
  } catch (err) {
    // The message text stays out of the logs: it is customer data.
    console.warn('Claude could not read a capture:', err instanceof Error ? err.name : 'unknown error');
    return readWithMatcher(text, ctx, NOTE_FAILED);
  }
}
