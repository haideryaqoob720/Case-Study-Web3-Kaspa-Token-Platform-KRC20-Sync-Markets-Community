// Floor Price Calculator Service: Calculates floor price from Kasplex marketplace listings
// Uses median of filtered recent OTC transactions or lowest listing price

import { Injectable } from '@nestjs/common';
import { KasplexApiService } from '../../kasplex/kasplex-api.service';
import { KasPriceService } from '../../kas-price/kas-price.service';

export interface MarketplaceListing {
  tick: string;
  amount: string; // Token amount (with decimals)
  uAmt: string; // KAS amount (satoshi)
  from: string;
  uAddr: string;
  opScoreAdd?: string;
}

export interface FloorPriceResult {
  floorPriceUsd: number;
  floorPriceKas: number;
  listingCount: number;
}

@Injectable()
export class FloorPriceCalculatorService {
  constructor(
    private readonly kasplexApiService: KasplexApiService,
    private readonly kasPriceService: KasPriceService,
  ) {}

  /**
   * Calculate floor price for a token from marketplace listings
   * @param tick Token ticker symbol
   * @param decimals Token decimals
   * @param kasUsdRateOverride If provided, use this KAS/USD rate instead of fetching (avoids repeated API calls in batch)
   * @returns Floor price result or null if no listings
   */
  async calculateFloorPrice(
    tick: string,
    decimals: string = '8',
    kasUsdRateOverride?: number,
  ): Promise<FloorPriceResult | null> {
    try {
      const response =
        await this.kasplexApiService.fetchMarketplaceListings(tick);

      if (!response || !response.result || !Array.isArray(response.result)) {
        return null;
      }

      const listings: MarketplaceListing[] = response.result;

      if (listings.length === 0) {
        return null;
      }

      const prices = this.calculatePricesFromListings(listings, decimals);

      if (prices.length === 0) {
        return null;
      }

      const filteredPrices = this.removeOutliers(prices);
      const medianPrice = this.calculateMedian(filteredPrices);

      const kasUsdRate =
        kasUsdRateOverride != null && kasUsdRateOverride > 0
          ? kasUsdRateOverride
          : await this.kasPriceService.getKasUsdRate();
      const floorPriceKas = medianPrice;
      const floorPriceUsd = floorPriceKas * kasUsdRate;

      return {
        floorPriceUsd,
        floorPriceKas,
        listingCount: listings.length,
      };
    } catch {
      return null;
    }
  }

  /**
   * Calculate prices from marketplace listings
   * Formula: price_in_KAS = (kas_amount / 10^8) / (token_amount / 10^decimals)
   */
  private calculatePricesFromListings(
    listings: MarketplaceListing[],
    decimals: string,
  ): number[] {
    const prices: number[] = [];
    const decimalsNum = parseInt(decimals, 10) || 8;

    for (const listing of listings) {
      try {
        // Normalize amounts
        const tokenAmount =
          parseFloat(listing.amount) / Math.pow(10, decimalsNum);
        const kasAmount = parseFloat(listing.uAmt) / Math.pow(10, 8); // KAS has 8 decimals

        // Skip invalid amounts
        if (tokenAmount <= 0 || kasAmount <= 0) {
          continue;
        }

        // Calculate price in KAS
        const priceInKas = kasAmount / tokenAmount;

        // Skip invalid prices (too high or too low)
        if (priceInKas > 0 && priceInKas < 1000000) {
          // Reasonable price range: 0 to 1M KAS per token
          prices.push(priceInKas);
        }
      } catch (error) {
        // Skip invalid listings
        continue;
      }
    }

    return prices;
  }

  /**
   * Remove outliers using IQR (Interquartile Range) method
   */
  private removeOutliers(prices: number[]): number[] {
    if (prices.length <= 2) {
      return prices; // Too few prices, return as-is
    }

    // Sort prices
    const sorted = [...prices].sort((a, b) => a - b);

    // Calculate quartiles
    const q1Index = Math.floor(sorted.length * 0.25);
    const q3Index = Math.floor(sorted.length * 0.75);
    const q1 = sorted[q1Index];
    const q3 = sorted[q3Index];
    const iqr = q3 - q1;

    // Filter outliers (values outside Q1 - 1.5*IQR to Q3 + 1.5*IQR)
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;

    return sorted.filter((price) => price >= lowerBound && price <= upperBound);
  }

  /**
   * Calculate median of prices
   */
  private calculateMedian(prices: number[]): number {
    if (prices.length === 0) {
      return 0;
    }

    const sorted = [...prices].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      // Even number of prices: average of two middle values
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      // Odd number of prices: middle value
      return sorted[mid];
    }
  }
}
