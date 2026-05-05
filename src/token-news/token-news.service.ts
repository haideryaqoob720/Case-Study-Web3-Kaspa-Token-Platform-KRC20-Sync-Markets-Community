import { Injectable, Logger } from '@nestjs/common';
import Parser from 'rss-parser';
import axios from 'axios';

export interface TokenNewsArticle {
  title: string;
  link: string;
  contentSnippet?: string;
  pubDate?: string;
  image?: string;
}

const RSS_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'application/rss+xml, application/xml, text/xml, application/atom+xml, application/json',
};

const HTML_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

@Injectable()
export class TokenNewsService {
  private readonly logger = new Logger(TokenNewsService.name);
  private readonly parser: Parser;

  constructor() {
    this.parser = new Parser({
      customFields: {
        item: [
          'media:content',
          'content:encoded',
          'enclosure',
          'media:thumbnail',
          'description',
        ],
        feed: ['title', 'description'],
      },
      requestOptions: {
        headers: RSS_HEADERS,
        rejectUnauthorized: false,
      },
      timeout: 15000,
    });
  }

  private getImageFromRssItem(item: unknown): string | undefined {
    const it = item as Record<string, unknown>;
    if (!it || typeof it !== 'object') return undefined;
    const enc = it.enclosure as
      | { url?: string; href?: string; type?: string }
      | undefined;
    if (enc) {
      const encUrl = enc.url || enc.href;
      if (encUrl && typeof encUrl === 'string') {
        const isImage =
          enc.type?.startsWith('image/') ||
          /\.(jpe?g|png|gif|webp)(\?|$)/i.test(encUrl);
        if (isImage) return encUrl;
      }
    }
    const mediaContent = it['media:content'] ?? it.mediaContent;
    const contentUrl =
      typeof mediaContent === 'string'
        ? mediaContent
        : typeof mediaContent === 'object' &&
            mediaContent &&
            (mediaContent as { $?: { url?: string } })?.$?.url
          ? (mediaContent as { $: { url: string } }).$.url
          : typeof mediaContent === 'object' &&
              mediaContent &&
              (mediaContent as { '@'?: { url?: string } })?.['@']?.url
            ? (mediaContent as { '@': { url: string } })['@'].url
            : null;
    if (
      contentUrl &&
      typeof contentUrl === 'string' &&
      contentUrl.startsWith('http')
    )
      return contentUrl;
    const mediaThumb = it['media:thumbnail'] ?? it.mediaThumbnail;
    const thumbUrl =
      typeof mediaThumb === 'string'
        ? mediaThumb
        : typeof mediaThumb === 'object' &&
            mediaThumb &&
            (mediaThumb as { $?: { url?: string } })?.$?.url
          ? (mediaThumb as { $: { url: string } }).$.url
          : typeof mediaThumb === 'object' &&
              mediaThumb &&
              (mediaThumb as { '@'?: { url?: string } })?.['@']?.url
            ? (mediaThumb as { '@': { url: string } })['@'].url
            : null;
    if (
      thumbUrl &&
      typeof thumbUrl === 'string' &&
      thumbUrl.startsWith('http')
    )
      return thumbUrl;
    const htmlContent = (it['content:encoded'] ||
      it.content ||
      it.contentSnippet ||
      it.content ||
      it.description ||
      '') as string;
    if (htmlContent && typeof htmlContent === 'string') {
      const imgMatch = htmlContent.match(
        /<img[^>]+(?:src|data-src)=["']([^"'>]+)["']/i,
      );
      const src = imgMatch?.[1];
      if (src && (src.startsWith('http') || src.startsWith('//')))
        return src.startsWith('//') ? 'https:' + src : src;
    }
    return undefined;
  }

  private async fetchOgImage(articleLink: string): Promise<string | undefined> {
    try {
      const { data: html } = await axios.get(articleLink, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)',
          Accept: 'text/html',
        },
        timeout: 3000,
        maxRedirects: 2,
      });
      const og =
        html.match(
          /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"'>]+)["']/i,
        ) ||
        html.match(
          /<meta[^>]+content=["']([^"'>]+)["'][^>]+property=["']og:image["']/i,
        );
      if (og?.[1]) return og[1];
      const tw =
        html.match(
          /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"'>]+)["']/i,
        ) ||
        html.match(
          /<meta[^>]+content=["']([^"'>]+)["'][^>]+name=["']twitter:image["']/i,
        );
      if (tw?.[1]) return tw[1];
    } catch {
      // ignore
    }
    return undefined;
  }

  async getTokenNews(ticker: string): Promise<TokenNewsArticle[]> {
    const tokenUpper = ticker.trim().toUpperCase();
    const searchQueries = [
      `${tokenUpper} token`,
      `$${tokenUpper}`,
      `${tokenUpper} crypto`,
      `${tokenUpper} cryptocurrency`,
      `${tokenUpper} kaspa`,
    ];
    const allArticles: TokenNewsArticle[] = [];
    const seenLinks = new Set<string>();
    const tokenRegex = new RegExp(
      `\\b${tokenUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b|\\$${tokenUpper}\\b`,
      'i',
    );

    const addFromRssItem = (
      item: { link?: string; title?: string; contentSnippet?: string; content?: string; description?: string; pubDate?: string; isoDate?: string },
      combinedText: string,
      isKaspaRelated: boolean,
    ) => {
      const link = item.link || '';
      if (seenLinks.has(link)) return;
      if (!tokenRegex.test(combinedText) && !isKaspaRelated) return;
      seenLinks.add(link);
      allArticles.push({
        title: item.title || '',
        link,
        contentSnippet:
          item.contentSnippet || item.content || item.description || '',
        pubDate: item.pubDate || item.isoDate || '',
        image: this.getImageFromRssItem(item),
      });
    };

    // Priority 1: Kaspa RSS
    const kaspaFeeds = [
      'https://kaspa.org/news/feed/',
      'https://kaspa.org/feed/',
      'https://kaspa.org/news/rss/',
    ];
    for (const url of kaspaFeeds) {
      try {
        const feed = await this.parser.parseURL(url);
        if (feed.items?.length) {
          for (const item of feed.items.slice(0, 20)) {
            const title = (item.title || '').toLowerCase();
            const content = (
              (item.contentSnippet || item.content || item.description || '') as string
            ).toLowerCase();
            const combined = `${title} ${content}`;
            const isKaspa =
              combined.includes('kaspa') ||
              combined.includes('krc20') ||
              combined.includes('kaspa token');
            addFromRssItem(item, combined, isKaspa);
          }
          break;
        }
      } catch {
        continue;
      }
    }

    // Fallback: Kaspa HTML scrape
    if (allArticles.length === 0) {
      try {
        const { data: html } = await axios.get('https://kaspa.org/news/', {
          headers: HTML_HEADERS,
          timeout: 10000,
        });
        const matches = html.matchAll(
          /<a[^>]+href=["']([^"']*\/news\/[^"']+)["'][^>]*>([^<]+)<\/a>/gi,
        );
        const scraped: Array<{ link: string; title: string }> = [];
        for (const m of matches) {
          const link = m[1].startsWith('http')
            ? m[1]
            : `https://kaspa.org${m[1]}`;
          const title = m[2].trim();
          if (title && link.includes('/news/') && !seenLinks.has(link)) {
            scraped.push({ link, title });
            seenLinks.add(link);
          }
        }
        for (const a of scraped.slice(0, 10)) {
          const lower = a.title.toLowerCase();
          const isKaspa =
            lower.includes('kaspa') || lower.includes('krc20');
          if (tokenRegex.test(a.title) || isKaspa) {
            allArticles.push({
              title: a.title,
              link: a.link,
              contentSnippet: '',
              pubDate: new Date().toISOString(),
              image: undefined,
            });
          }
        }
      } catch (err) {
        this.logger.warn('Kaspa news scrape failed', err);
      }
    }

    // Priority 2: kas.fyi RSS
    const kasFyiFeeds = [
      'https://kas.fyi/feed/',
      'https://kas.fyi/rss/',
      'https://kas.fyi/news/feed/',
    ];
    for (const url of kasFyiFeeds) {
      try {
        const feed = await this.parser.parseURL(url);
        if (feed.items?.length) {
          for (const item of feed.items.slice(0, 15)) {
            const title = (item.title || '').toLowerCase();
            const content = (
              (item.contentSnippet || item.content || item.description || '') as string
            ).toLowerCase();
            const combined = `${title} ${content}`;
            const isKaspa =
              combined.includes('kaspa') ||
              combined.includes('krc20') ||
              combined.includes('kaspa token');
            addFromRssItem(item, combined, isKaspa);
          }
          break;
        }
      } catch {
        continue;
      }
    }

    // Priority 3: kaspamemes RSS
    const kaspamemesFeeds = [
      'https://kaspamemes.com/feed/',
      'https://kaspamemes.com/rss/',
      'https://www.kaspamemes.com/feed/',
    ];
    for (const url of kaspamemesFeeds) {
      try {
        const feed = await this.parser.parseURL(url);
        if (feed.items?.length) {
          for (const item of feed.items.slice(0, 15)) {
            const title = (item.title || '').toLowerCase();
            const content = (
              (item.contentSnippet || item.content || item.description || '') as string
            ).toLowerCase();
            const combined = `${title} ${content}`;
            const isKaspa =
              combined.includes('kaspa') ||
              combined.includes('krc20') ||
              combined.includes('kaspa token');
            addFromRssItem(item, combined, isKaspa);
          }
          break;
        }
      } catch {
        continue;
      }
    }

    // Scrape kas.fyi HTML if no kas.fyi in list
    if (!allArticles.some((a) => a.link.includes('kas.fyi'))) {
      try {
        const { data: html } = await axios.get('https://kas.fyi/', {
          headers: HTML_HEADERS,
          timeout: 10000,
        });
        const matches = html.matchAll(
          /<a[^>]+href=["']([^"']*kas\.fyi[^"']*)["'][^>]*>([^<]+)<\/a>/gi,
        );
        const scraped: Array<{ link: string; title: string }> = [];
        for (const m of matches) {
          const link = m[1].startsWith('http') ? m[1] : `https://kas.fyi${m[1]}`;
          const title = m[2].trim();
          if (
            title &&
            !seenLinks.has(link) &&
            (link.includes('/news/') ||
              link.includes('/blog/') ||
              link.includes('/article/'))
          ) {
            scraped.push({ link, title });
            seenLinks.add(link);
          }
        }
        for (const a of scraped.slice(0, 10)) {
          const lower = a.title.toLowerCase();
          const isKaspa =
            lower.includes('kaspa') || lower.includes('krc20');
          if (tokenRegex.test(a.title) || isKaspa) {
            allArticles.push({
              title: a.title,
              link: a.link,
              contentSnippet: '',
              pubDate: new Date().toISOString(),
              image: undefined,
            });
          }
        }
      } catch (err) {
        this.logger.warn('kas.fyi scrape failed', err);
      }
    }

    // Scrape kaspamemes HTML if none in list
    if (!allArticles.some((a) => a.link.includes('kaspamemes'))) {
      try {
        const { data: html } = await axios.get('https://kaspamemes.com/', {
          headers: HTML_HEADERS,
          timeout: 10000,
        });
        const matches = html.matchAll(
          /<a[^>]+href=["']([^"']*kaspamemes[^"']*)["'][^>]*>([^<]+)<\/a>/gi,
        );
        const scraped: Array<{ link: string; title: string }> = [];
        for (const m of matches) {
          const link = m[1].startsWith('http')
            ? m[1]
            : `https://kaspamemes.com${m[1]}`;
          const title = m[2].trim();
          if (
            title &&
            !seenLinks.has(link) &&
            (link.includes('/news/') ||
              link.includes('/post/') ||
              link.includes('/article/'))
          ) {
            scraped.push({ link, title });
            seenLinks.add(link);
          }
        }
        for (const a of scraped.slice(0, 10)) {
          const lower = a.title.toLowerCase();
          const isKaspa =
            lower.includes('kaspa') || lower.includes('krc20');
          if (tokenRegex.test(a.title) || isKaspa) {
            allArticles.push({
              title: a.title,
              link: a.link,
              contentSnippet: '',
              pubDate: new Date().toISOString(),
              image: undefined,
            });
          }
        }
      } catch (err) {
        this.logger.warn('kaspamemes scrape failed', err);
      }
    }

    // Priority 4: Google News RSS (3 queries)
    for (const query of searchQueries.slice(0, 3)) {
      try {
        const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}+cryptocurrency&hl=en-US&gl=US&ceid=US:en`;
        const feed = await this.parser.parseURL(url);
        if (feed.items?.length) {
          for (const item of feed.items.slice(0, 10)) {
            const link = item.link || '';
            if (seenLinks.has(link)) continue;
            seenLinks.add(link);
            allArticles.push({
              title: item.title || '',
              link,
              contentSnippet:
                item.contentSnippet || item.content || item.description || '',
              pubDate: item.pubDate || item.isoDate || '',
              image: this.getImageFromRssItem(item),
            });
          }
        }
      } catch (err) {
        this.logger.warn(`Google News query "${query}" failed`, err);
      }
    }

    // Priority 5: Crypto feeds (2 feeds, token filter)
    const cryptoFeeds = [
      'https://cryptonews.com/news/feed/',
      'https://www.newsbtc.com/feed/',
    ];
    for (const feedUrl of cryptoFeeds) {
      try {
        const feed = await this.parser.parseURL(feedUrl);
        if (feed.items?.length) {
          for (const item of feed.items.slice(0, 20)) {
            const link = item.link || '';
            if (seenLinks.has(link)) continue;
            const title = (item.title || '').toLowerCase();
            const content = (
              (item.contentSnippet || item.content || item.description || '') as string
            ).toLowerCase();
            if (!tokenRegex.test(`${title} ${content}`)) continue;
            seenLinks.add(link);
            allArticles.push({
              title: item.title || '',
              link,
              contentSnippet:
                item.contentSnippet || item.content || item.description || '',
              pubDate: item.pubDate || item.isoDate || '',
              image: this.getImageFromRssItem(item),
            });
          }
        }
      } catch (err) {
        this.logger.warn(`Crypto feed ${feedUrl} failed`, err);
      }
    }

    // Sort: token-specific first, then source priority, then date
    const getSourcePriority = (link: string): number => {
      if (link.includes('kaspa.org')) return 1;
      if (link.includes('kas.fyi')) return 2;
      if (link.includes('kaspamemes')) return 3;
      return 4;
    };
    allArticles.sort((a, b) => {
      const aSpecific =
        tokenRegex.test(a.title || '') ||
        tokenRegex.test(a.contentSnippet || '');
      const bSpecific =
        tokenRegex.test(b.title || '') ||
        tokenRegex.test(b.contentSnippet || '');
      if (aSpecific && !bSpecific) return -1;
      if (!aSpecific && bSpecific) return 1;
      const pa = getSourcePriority(a.link);
      const pb = getSourcePriority(b.link);
      if (pa !== pb) return pa - pb;
      const dateA = new Date(a.pubDate || '').getTime();
      const dateB = new Date(b.pubDate || '').getTime();
      return dateB - dateA;
    });

    const limited = allArticles.slice(0, 30);

    // Fetch og:image for first 5 without image
    const needImage = limited.filter((a) => !a.image).slice(0, 5);
    if (needImage.length > 0) {
      const results = await Promise.allSettled(
        needImage.map((a) => this.fetchOgImage(a.link)),
      );
      results.forEach((result, i) => {
        if (
          result.status === 'fulfilled' &&
          result.value &&
          needImage[i]
        ) {
          needImage[i].image = result.value;
        }
      });
    }

    return limited;
  }
}
