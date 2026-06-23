export interface CompanyNewsProviderItem {
  externalId?: string;
  headline: string;
  summary?: string;
  source?: string;
  url?: string;
  publishedAt: Date;
  rawJson: unknown;
}

export interface CompanyNewsProvider {
  readonly providerName: string;
  fetchCompanyNews(symbol: string, from: string, to: string): Promise<CompanyNewsProviderItem[]>;
}
