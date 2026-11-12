let lastMessage = '';
let lastPromptAt = 0;

/**
 * Prevents duplicate native confirm dialogs caused by rapid duplicate handlers
 * (e.g., bubbling + repeated bindings) while preserving normal user prompts.
 */
export function confirmOnce(message: string, cooldownMs = 1000): boolean {
  const now = Date.now();
  if (message === lastMessage && now - lastPromptAt < cooldownMs) {
    return false;
  }

  lastMessage = message;
  lastPromptAt = now;
  return window.confirm(message);
}
