export interface LlmProvider {
  generateJson<T>(systemPrompt: string, userPayload: unknown): Promise<T | null>;
  generateText(systemPrompt: string, userPayload: unknown): Promise<string | null>;
}

export class OpenAiProvider implements LlmProvider {
  private readonly apiKey = process.env.LLM_API_KEY ?? process.env.OPENAI_API_KEY;
  private readonly model = process.env.LLM_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
  private readonly baseUrl = (process.env.LLM_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  private readonly apiStyle = process.env.LLM_API_STYLE ?? "responses";

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
      const response = this.apiStyle === "chat_completions"
        ? await this.completeWithChatCompletions(systemPrompt, userPayload, jsonOnly)
        : await this.completeWithResponses(systemPrompt, userPayload, jsonOnly);

      if (!response) return null;
      return response.trim() || null;
    } catch {
      return null;
    }
  }

  private async completeWithResponses(systemPrompt: string, userPayload: unknown, jsonOnly: boolean): Promise<string | null> {
    const response = await fetch(`${this.baseUrl}/responses`, {
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
    return data.output_text ?? null;
  }

  private async completeWithChatCompletions(systemPrompt: string, userPayload: unknown, jsonOnly: boolean): Promise<string | null> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(userPayload) }
          ],
          response_format: jsonOnly ? { type: "json_object" } : undefined
        })
      });

    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content ?? null;
  }
}
