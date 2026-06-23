export interface BasicFinancialsProviderResult {
  metricJson: Record<string, unknown>;
}

export interface BasicFinancialsProvider {
  readonly providerName: string;
  fetchBasicFinancials(symbol: string): Promise<BasicFinancialsProviderResult>;
}
