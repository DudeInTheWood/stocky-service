export interface LlmMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmProvider {
  completeJson(messages: LlmMessage[]): Promise<unknown>;
}
