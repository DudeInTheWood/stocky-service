import type { MarketContextConfig } from "../config/app-config.js";
import type { BasicFinancialsService } from "../modules/market-context/basic-financials.service.js";
import type { CompanyNewsService } from "../modules/market-context/company-news.service.js";

export interface MarketContextRefreshJobDependencies {
  config: MarketContextConfig;
  watchlistSymbols: string[];
  companyNewsService: CompanyNewsService;
  basicFinancialsService: BasicFinancialsService;
}

export class MarketContextRefreshJob {
  constructor(private readonly dependencies: MarketContextRefreshJobDependencies) {}

  async run(): Promise<void> {
    const to = new Date();
    const from = new Date(
      to.getTime() - this.dependencies.config.newsLookbackDays * 24 * 60 * 60 * 1000
    );

    const newsResult = await this.dependencies.companyNewsService.refreshCompanyNews({
      symbols: this.dependencies.watchlistSymbols,
      from,
      to,
      maxItemsPerSymbol: this.dependencies.config.maxNewsItemsPerSymbol
    });

    console.log(
      `Market context news refresh complete: ${newsResult.fetchedSymbols} symbols, ${newsResult.storedItems} items.`
    );

    if (newsResult.failedSymbols.length > 0) {
      console.log(`Market context news failures: ${newsResult.failedSymbols.join(", ")}.`);
    }

    if (!this.dependencies.config.fetchBasicFinancials) {
      return;
    }

    const financialsResult = await this.dependencies.basicFinancialsService.refreshBasicFinancials({
      symbols: this.dependencies.watchlistSymbols,
      refreshHours: this.dependencies.config.basicFinancialsRefreshHours
    });

    console.log(
      [
        "Market context financials refresh complete:",
        `${financialsResult.fetchedSymbols} fetched,`,
        `${financialsResult.skippedSymbols} fresh enough.`
      ].join(" ")
    );

    if (financialsResult.failedSymbols.length > 0) {
      console.log(`Market context financials failures: ${financialsResult.failedSymbols.join(", ")}.`);
    }
  }
}
