import type { AlertNotification } from "../../types/alert.js";
import type { Quote } from "../../types/quote.js";

export class AlertRuleService {
  async evaluateQuotes(_quotes: Quote[]): Promise<AlertNotification[]> {
    throw new Error("AlertRuleService.evaluateQuotes is not implemented yet.");
  }
}
