import type { LlmMessage, LlmProvider } from "./llm.provider.js";

export interface OllamaLlmProviderOptions {
  baseUrl: string;
  model: string;
}

interface OllamaChatResponse {
  message?: {
    content?: unknown;
  };
  error?: unknown;
}

export class OllamaLlmProvider implements LlmProvider {
  constructor(private readonly options: OllamaLlmProviderOptions) {}

  async completeJson(messages: LlmMessage[]): Promise<unknown> {
    const response = await fetch(`${trimTrailingSlash(this.options.baseUrl)}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: this.options.model,
        messages,
        stream: false,
        format: "json",
        think: false,
        options: {
          temperature: 0.2,
          num_predict: 1200
        }
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama chat request failed: ${response.status} ${body}`);
    }

    const body = (await response.json()) as OllamaChatResponse;

    if (body.error) {
      throw new Error(`Ollama chat returned an error: ${String(body.error)}`);
    }

    if (typeof body.message?.content !== "string") {
      throw new Error("Ollama chat response did not include message.content.");
    }

    return parseJsonContent(body.message.content);
  }
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const jsonMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);

    if (jsonMatch?.[1]) {
      return JSON.parse(jsonMatch[1]);
    }

    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");

    if (objectStart >= 0 && objectEnd > objectStart) {
      return JSON.parse(trimmed.slice(objectStart, objectEnd + 1));
    }

    throw new Error(`Ollama returned invalid JSON content: ${trimmed.slice(0, 200)}`);
  }
}
