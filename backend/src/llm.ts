export interface LlmProvider {
  generateJson<T>(systemPrompt: string, userPayload: unknown): Promise<T | null>;
  generateText(systemPrompt: string, userPayload: unknown): Promise<string | null>;
}

export class OpenAiProvider implements LlmProvider {
  private readonly apiKey = process.env.OPENAI_API_KEY;
  private readonly model = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

  async generateJson<T>(systemPrompt: string, userPayload: unknown): Promise<T | null> {
    const text = await this.complete(systemPrompt, userPayload, true);
    if (!text) return null;

    try {
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  }

  async generateText(systemPrompt: string, userPayload: unknown): Promise<string | null> {
    return this.complete(systemPrompt, userPayload, false);
  }

  private async complete(systemPrompt: string, userPayload: unknown, jsonOnly: boolean): Promise<string | null> {
    if (!this.apiKey) return null;

    try {
      const response = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          input: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(userPayload) }
          ],
          text: jsonOnly ? { format: { type: "json_object" } } : undefined
        })
      });

      if (!response.ok) return null;
      const data = (await response.json()) as { output_text?: string };
      return data.output_text?.trim() || null;
    } catch {
      return null;
    }
  }
}
