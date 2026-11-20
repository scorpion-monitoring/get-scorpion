import { m } from '../paraglide/messages.js';
import type { Locale } from '../paraglide/runtime.js';

type Message = (inputs: Record<string, never>, options: { locale: Locale }) => string;
const messages = m as unknown as Record<string, Message | undefined>;

/**
 * Renders the message with the given key in the given locale. For keys that come from the data
 * files (src/data/*.yaml), where the key is a string; content.config.ts has already checked that it
 * exists. In components, call `m.key({}, { locale })` directly so the key is type-checked.
 */
export function t(key: string, locale: Locale): string {
  const message = messages[key];
  if (!message) throw new Error(`Unknown message key "${key}"`);
  return message({}, { locale });
}
