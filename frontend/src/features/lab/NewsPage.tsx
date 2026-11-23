import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { apiRequest } from '../../common/apiClient';
import {
  Globe2,
  Sparkles,
  RefreshCw,
  ExternalLink,
  Languages,
  TrendingUp,
  MapPin,
  Clock,
  Search,
  BookOpen,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Flame,
  Radio,
  Dna,
  FlaskConical,
  Database,
  Snowflake,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Bot,
} from 'lucide-react';

export interface Article {
  title: string;
  url: string;
  domain: string;
  country: string;
  city?: string;
  lat?: number;
  lon?: number;
  seen: string;
  language: string;
  raw_language?: string;
  is_english?: boolean;
}

export interface NewsResponse {
  articles: Article[];
  fetched_at: string;
  source: string;
  source_url: string;
  topic?: string;
  topic_title?: string;
  window: string;
  total_retrieved: number;
  location_basis: string;
}

interface CountryFeature {
  properties: {
    ADMIN: string;
    NAME: string;
    NAME_LONG?: string;
    LABEL_X: number;
    LABEL_Y: number;
    CONTINENT?: string;
    REGION_UN?: string;
  };
  geometry: {
    type: string;
    coordinates: number[][][] | number[][][][];
  };
}

const COUNTRY_ALIASES: Record<string, string> = {
  'united states': 'united states of america',
  'uk': 'united kingdom',
  'republic of korea': 'south korea',
  'korea, south': 'south korea',
  'russian federation': 'russia',
  'czech republic': 'czechia',
  'peoples republic of china': 'china',
  'prc': 'china',
  'deutschland': 'germany',
};

const normalize = (name: string) => COUNTRY_ALIASES[name.toLowerCase()] || name.toLowerCase();

function polygonPath(rings: number[][][]) {
  return rings
    .map(ring =>
      ring
        .map(([lon, lat], index) => `${index ? 'L' : 'M'}${((lon + 180) * 2.8).toFixed(1)},${((90 - lat) * 2.8).toFixed(1)}`)
        .join(' ') + ' Z'
    )
    .join(' ');
}

function getPath(country: CountryFeature) {
  return country.geometry.type === 'Polygon'
    ? polygonPath(country.geometry.coordinates as number[][][])
    : (country.geometry.coordinates as number[][][][]).map(polygonPath).join(' ');
}

const PAGE_SIZE = 6;

export function NewsPage() {
  const [topic, setTopic] = useState<string>('all_project');
  const [selectedCity, setSelectedCity] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [langFilter, setLangFilter] = useState<'all' | 'english_only' | 'non_english'>('all');
  const [news, setNews] = useState<NewsResponse | null>(null);
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);

  // Pagination state: strictly 6 items per page
  const [currentPage, setCurrentPage] = useState<number>(1);

  // Auto-refresh timer state (30s, 60s, 5m, or Off)
  const [autoRefreshSecs, setAutoRefreshSecs] = useState<number>(60);
  const [countdown, setCountdown] = useState<number>(60);

  // Translation states: article URL -> translated title
  const [translations, setTranslations] = useState<Record<string, { text: string; loading: boolean }>>({});

  // AI Domain Summary State
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiSummaryModel, setAiSummaryModel] = useState<string>('');
  const [aiSummaryLoading, setAiSummaryLoading] = useState<boolean>(false);

  // Google Maps-style Interactive Map Pan & Zoom states
  const [mapZoom, setMapZoom] = useState<number>(1);
  const [mapPan, setMapPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [mapTheme, setMapTheme] = useState<'google_terrain' | 'dark_tactical' | 'satellite_blue'>('satellite_blue');
  const [hoveredPin, setHoveredPin] = useState<{ title: string; count: number; x: number; y: number } | null>(null);
  const mapSvgRef = useRef<SVGSVGElement>(null);

  // Load geojson map boundaries
  useEffect(() => {
    const controller = new AbortController();
    fetch('/world-countries.geojson', { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('World map boundaries could not be loaded.');
        return response.json();
      })
      .then((data) => setCountries(data.features || []))
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Fetch Live News function
  const fetchNews = useCallback(() => {
    setBusy(true);
    setError('');
    setCurrentPage(1); // reset to page 1 on refresh/topic switch
    apiRequest<NewsResponse>(`/news?topic=${topic}${searchQuery ? `&query=${encodeURIComponent(searchQuery)}` : ''}`)
      .then((data) => {
        setNews(data);
        setCountdown(autoRefreshSecs);
      })
      .catch((err) => {
        setError(err.message || 'Live scientific research syndication interrupted. Retrying automatically...');
      })
      .finally(() => {
        setBusy(false);
      });
  }, [topic, searchQuery, autoRefreshSecs]);

  // Initial and trigger load
  useEffect(() => {
    fetchNews();
  }, [fetchNews, revision]);

  // Request AI Summary from Gemini for current articles ONLY on explicit user request
  const generateAiSummary = useCallback(async (articles: Article[], topicKey: string) => {
    if (!articles || articles.length === 0) return;
    setAiSummaryLoading(true);
    try {
      const res = await apiRequest<{ summary: string; model: string }>('/news/summarize', {
        method: 'POST',
        body: JSON.stringify({
          topic: topicKey,
          articles: articles.slice(0, 15).map(a => ({
            title: a.title,
            city: a.city,
            country: a.country,
          })),
        }),
      });
      setAiSummary(res.summary);
      setAiSummaryModel(res.model);
    } catch {
      setAiSummary('AI summarizer encountered a transient network delay. Click "Generate Summary" to retry.');
    } finally {
      setAiSummaryLoading(false);
    }
  }, []);

  // Automated live refresh ticker
  useEffect(() => {
    if (autoRefreshSecs <= 0) return;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          fetchNews();
          return autoRefreshSecs;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [autoRefreshSecs, fetchNews]);

  // Translate handler
  async function handleTranslate(article: Article) {
    if (translations[article.url]?.loading || translations[article.url]?.text) return;

    setTranslations((prev) => ({
      ...prev,
      [article.url]: { text: '', loading: true },
    }));

    try {
      const res = await apiRequest<{ translated_text: string; source_lang: string }>('/news/translate', {
        method: 'POST',
        body: JSON.stringify({
          text: article.title,
          target_lang: 'en',
          source_lang: article.raw_language || 'auto',
        }),
      });

      setTranslations((prev) => ({
        ...prev,
        [article.url]: { text: res.translated_text || article.title, loading: false },
      }));
    } catch {
      setTranslations((prev) => ({
        ...prev,
        [article.url]: { text: 'Translation failed or rate-limited.', loading: false },
      }));
    }
  }

  // Exact City Pin Clusters with (lat, lon)
  const cityClusters = useMemo(() => {
    const map = new Map<string, { city: string; country: string; lat: number; lon: number; articles: Article[] }>();
    for (const article of news?.articles || []) {
      const cityKey = article.city || article.country || 'Global Site';
      const existing = map.get(cityKey);
      if (existing) {
        existing.articles.push(article);
      } else {
        map.set(cityKey, {
          city: cityKey,
          country: article.country,
          lat: article.lat ?? 0,
          lon: article.lon ?? 0,
          articles: [article],
        });
      }
    }
    return map;
  }, [news]);

  // Country Clusters for landmass highlight
  const countryClusters = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const article of news?.articles || []) {
      const c = article.country ? normalize(article.country) : 'unspecified';
      map.set(c, [...(map.get(c) || []), article]);
    }
    return map;
  }, [news]);

  // Analytics Computations
  const analytics = useMemo(() => {
    const total = news?.articles.length || 0;
    if (!total) return null;

    const domainCounts: Record<string, number> = {};
    let nonEnglishCount = 0;

    for (const art of news?.articles || []) {
      if (!art.is_english) nonEnglishCount++;
      if (art.domain) {
        domainCounts[art.domain] = (domainCounts[art.domain] || 0) + 1;
      }
    }

    const topCities = [...cityClusters.values()]
      .sort((a, b) => b.articles.length - a.articles.length)
      .slice(0, 6);

    const scientificKeywords = [
      'Ancient DNA', 'Biobank', 'Neanderthal', 'Cryopreservation',
      'Sequencing', 'Genomics', 'Skeletal', 'Svalbard', 'Fossil',
      'Cold Chain', 'LIMS', 'PCR', 'Microbiome'
    ];
    const keywordMatches = scientificKeywords
      .map(kw => ({
        keyword: kw,
        count: (news?.articles || []).filter(a => a.title.toLowerCase().includes(kw.toLowerCase())).length,
      }))
      .filter(k => k.count > 0)
      .sort((a, b) => b.count - a.count);

    return {
      total,
      nonEnglishCount,
      englishPercent: Math.round(((total - nonEnglishCount) / total) * 100),
      topCities,
      keywordMatches,
      totalCities: cityClusters.size,
      totalCountries: countryClusters.size,
    };
  }, [news, cityClusters, countryClusters]);

  // Filtered Articles based on selection and filters
  const filteredArticles = useMemo(() => {
    let list = news?.articles || [];

    if (selectedCity) {
      list = cityClusters.get(selectedCity)?.articles || [];
    } else if (selectedCountry) {
      list = countryClusters.get(selectedCountry) || [];
    }

    if (langFilter === 'english_only') {
      list = list.filter((a) => a.is_english);
    } else if (langFilter === 'non_english') {
      list = list.filter((a) => !a.is_english);
    }

    return list;
  }, [news, selectedCity, selectedCountry, cityClusters, countryClusters, langFilter]);

  // 6 articles per page pagination calculations
  const totalPages = Math.ceil(filteredArticles.length / PAGE_SIZE) || 1;
  const paginatedArticles = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredArticles.slice(start, start + PAGE_SIZE);
  }, [filteredArticles, currentPage]);

  // Map Zoom & Pan Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - mapPan.x, y: e.clientY - mapPan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setMapPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const zoomIn = () => setMapZoom((z) => Math.min(z * 1.35, 7));
  const zoomOut = () => setMapZoom((z) => Math.max(z / 1.35, 0.7));
  const resetMap = () => {
    setMapZoom(1);
    setMapPan({ x: 0, y: 0 });
    setSelectedCity('');
    setSelectedCountry('');
    setCurrentPage(1);
  };

  // Google Maps Style Palettes
  const themeStyles = {
    google_terrain: {
      ocean: '#AAD3DF',
      land: '#F2EFE9',
      landSelected: '#D4E8DC',
      border: '#D8D4CC',
      borderSelected: '#10B981',
      pin: '#EA4335',
      pinPulse: '#EA4335',
      text: '#202124',
    },
    dark_tactical: {
      ocean: '#0F172A',
      land: '#1E293B',
      landSelected: '#1E3A5F',
      border: '#334155',
      borderSelected: '#38BDF8',
      pin: '#2DD4BF',
      pinPulse: '#2DD4BF',
      text: '#F8FAFC',
    },
    satellite_blue: {
      ocean: '#081F37',
      land: '#253B6E',
      landSelected: '#1F51FF',
      border: '#455A8A',
      borderSelected: '#60A5FA',
      pin: '#F59E0B',
      pinPulse: '#F59E0B',
      text: '#FFFFFF',
    },
  }[mapTheme];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Banner */}
      <div
        className="card"
        style={{
          padding: '22px 28px',
          background: 'linear-gradient(135deg, var(--color-surface) 0%, rgba(40, 125, 120, 0.08) 100%)',
          borderLeft: '4px solid var(--color-teal)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: 'var(--color-teal)',
                backgroundColor: 'var(--color-pale-teal)',
                padding: '3px 8px',
                borderRadius: '4px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <Radio size={12} className="animate-pulse" /> LIVE SAMPLEMIND GEOSPATIAL RADAR
            </span>
            <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              City & Site Level Coordinates • Continuous Global Biobank & Paleogenomics Stream
            </span>
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: 'var(--color-ink)', margin: 0, letterSpacing: '-0.02em' }}>
            Scientific Research News & Exact Geocoded Locations
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--color-muted)' }}>
            Real-time discoveries from ancient DNA excavation sites, biorepositories, and cryo-cold chains mapped to exact geographical coordinates.
          </p>
        </div>

        {/* Live Auto-Refresh & Manual Sync */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <div
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              backgroundColor: 'var(--color-surface)',
              border: '1px solid var(--color-border)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              fontSize: '12px',
            }}
          >
            <Clock size={13} color="var(--color-teal)" />
            <span>
              Auto-sync: <strong>{autoRefreshSecs > 0 ? `${countdown}s` : 'Off'}</strong>
            </span>
            <select
              value={autoRefreshSecs}
              onChange={(e) => {
                const s = Number(e.target.value);
                setAutoRefreshSecs(s);
                setCountdown(s);
              }}
              style={{
                border: 'none',
                background: 'none',
                fontSize: '12px',
                fontWeight: 600,
                color: 'var(--color-teal)',
                cursor: 'pointer',
              }}
            >
              <option value="30">Every 30s</option>
              <option value="60">Every 1m</option>
              <option value="300">Every 5m</option>
              <option value="0">Manual only</option>
            </select>
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setRevision((v) => v + 1);
            }}
            disabled={busy}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px' }}
          >
            <RefreshCw size={14} className={busy ? 'animate-spin' : ''} />
            {busy ? 'Scanning Wires...' : 'Sync Now'}
          </button>
        </div>
      </div>

      {/* SAMPLEMIND SCIENTIFIC DOMAIN CHANNELS */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', marginRight: '4px' }}>
              Project Topics:
            </span>
            {[
              { id: 'all_project', label: 'All SampleMind Domains', icon: <Sparkles size={14} /> },
              { id: 'ancient_dna', label: 'Ancient DNA & Paleogenomics', icon: <Dna size={14} /> },
              { id: 'biobanks', label: 'Biobanks & Biospecimens', icon: <FlaskConical size={14} /> },
              { id: 'cold_chain', label: 'Cryogenics & Cold-Chain (-196°C)', icon: <Snowflake size={14} /> },
              { id: 'sequencing_qc', label: 'DNA Assays & Sequencing QC', icon: <ShieldCheck size={14} /> },
              { id: 'lab_databases', label: 'Laboratory Databases & Provenance', icon: <Database size={14} /> },
            ].map((t) => {
              const active = topic === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTopic(t.id);
                    setSelectedCity('');
                    setSelectedCountry('');
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '8px',
                    border: active ? '1px solid var(--color-teal)' : '1px solid var(--color-border)',
                    backgroundColor: active ? 'var(--color-teal)' : 'var(--color-surface)',
                    color: active ? '#FFFFFF' : 'var(--color-ink)',
                    fontSize: '12px',
                    fontWeight: active ? 600 : 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Error state alert */}
      {error && (
        <div className="card" style={{ padding: '14px 18px', backgroundColor: '#FEF2F2', borderLeft: '4px solid #EF4444' }}>
          <div style={{ color: '#B91C1C', fontSize: '13px', fontWeight: 600 }}>{error}</div>
        </div>
      )}

      {/* SCIENTIFIC ANALYTICS DASHBOARD WITH REAL AI SYNTHESIS */}
      {analytics && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px' }}>
          {/* Card 1: Volume */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                Scientific Reports
              </span>
              <BookOpen size={18} color="var(--color-teal)" />
            </div>
            <div className="font-mono" style={{ fontSize: '28px', fontWeight: 700, color: 'var(--color-ink)', marginTop: '4px' }}>
              {analytics.total} Indexed
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '4px' }}>
              Mapped to <strong style={{ color: 'var(--color-teal)' }}>{analytics.totalCities}</strong> exact research sites & cities
            </div>
          </div>

          {/* Card 2: Scientific Entities */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                Extracted Biological Entities
              </span>
              <Flame size={18} color="#EA4335" />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
              {analytics.keywordMatches.slice(0, 6).map((km) => (
                <span
                  key={km.keyword}
                  className="badge"
                  style={{
                    backgroundColor: 'rgba(40, 125, 120, 0.1)',
                    color: 'var(--color-teal)',
                    borderColor: 'rgba(40, 125, 120, 0.3)',
                    fontSize: '11px',
                    fontWeight: 600,
                  }}
                >
                  #{km.keyword} ({km.count})
                </span>
              ))}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '6px' }}>
              Extracted from active genomic publications
            </div>
          </div>

          {/* Card 3: Top Specific Excavation Sites / Cities */}
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)', textTransform: 'uppercase' }}>
                Key Cities & Sites
              </span>
              <TrendingUp size={18} color="var(--color-teal)" />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginTop: '8px' }}>
              {analytics.topCities.map((cluster) => (
                <button
                  key={cluster.city}
                  type="button"
                  onClick={() => {
                    setSelectedCity(selectedCity === cluster.city ? '' : cluster.city);
                    setCurrentPage(1);
                  }}
                  style={{
                    fontSize: '11px',
                    padding: '3px 8px',
                    borderRadius: '4px',
                    backgroundColor: selectedCity === cluster.city ? 'var(--color-teal)' : 'var(--color-pale-teal)',
                    color: selectedCity === cluster.city ? '#FFFFFF' : 'var(--color-teal)',
                    border: 'none',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  {cluster.city}: {cluster.articles.length}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GOOGLE MAPS STYLE INTERACTIVE WORLD MAP CANVAS WITH EXACT CITY COORDINATES */}
      <div className="card" style={{ padding: '20px 24px', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-ink)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Globe2 size={18} color="var(--color-teal)" />
              World Specimen Radar
            </h3>
            <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
              Drag to pan • Zoom with wheel or controls • Click exact city pins (e.g. Denisova, Leipzig, Svalbard, Rakhigarhi) to filter
            </span>
          </div>

          {/* Map Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Style switcher */}
            <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden' }}>
              {[
                { id: 'google_terrain', label: 'Terrain' },
                { id: 'dark_tactical', label: 'Tactical' },
                { id: 'satellite_blue', label: 'Satellite' },
              ].map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMapTheme(m.id as any)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    border: 'none',
                    backgroundColor: mapTheme === m.id ? 'var(--color-teal)' : 'var(--color-surface)',
                    color: mapTheme === m.id ? '#FFFFFF' : 'var(--color-ink)',
                    fontWeight: mapTheme === m.id ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>

            {(selectedCity || selectedCountry) && (
              <button
                type="button"
                onClick={resetMap}
                className="btn btn-secondary"
                style={{ padding: '4px 10px', fontSize: '12px', color: 'var(--color-teal)', fontWeight: 600 }}
              >
                Reset Filter ({selectedCity || selectedCountry.toUpperCase()})
              </button>
            )}
          </div>
        </div>

        {/* Viewport */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '460px',
            backgroundColor: themeStyles.ocean,
            borderRadius: '12px',
            overflow: 'hidden',
            border: '1px solid var(--color-border)',
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.15)',
            cursor: isDragging ? 'grabbing' : 'grab',
            userSelect: 'none',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Lat/Lon Grid lines */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(rgba(0,0,0,0.06) 1px, transparent 1px)',
              backgroundSize: '30px 30px',
              pointerEvents: 'none',
            }}
          />

          <svg
            ref={mapSvgRef}
            viewBox="0 0 1008 504"
            role="img"
            aria-label="Google Maps Style Interactive World Map"
            style={{
              width: '100%',
              height: '100%',
              display: 'block',
              transform: `translate(${mapPan.x}px, ${mapPan.y}px) scale(${mapZoom})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.15s ease-out',
            }}
          >
            {/* Country boundary polygons */}
            <g className="map-landmasses">
              {countries.map((country) => {
                const normName = normalize(country.properties.ADMIN);
                const isSelected = selectedCountry === normName;
                const fill = isSelected ? themeStyles.landSelected : themeStyles.land;

                return (
                  <path
                    key={country.properties.ADMIN}
                    d={getPath(country)}
                    fill={fill}
                    stroke={isSelected ? themeStyles.borderSelected : themeStyles.border}
                    strokeWidth={isSelected ? 1.5 : 0.6}
                    style={{ transition: 'fill 0.15s ease' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCountry(selectedCountry === normName ? '' : normName);
                      setSelectedCity('');
                      setCurrentPage(1);
                    }}
                  />
                );
              })}
            </g>

            {/* EXACT CITY / SITE RED PINS BASED ON (LAT, LON) */}
            <g className="map-city-pins">
              {[...cityClusters.values()].map((item) => {
                const isSelected = selectedCity === item.city;
                // Equirectangular formula: cx = (lon + 180) * 2.8, cy = (90 - lat) * 2.8
                const cx = (item.lon + 180) * 2.8;
                const cy = (90 - item.lat) * 2.8;
                const count = item.articles.length;
                const pinRadius = 5 + Math.min(10, Math.sqrt(count) * 2.5);

                return (
                  <g
                    key={`city-${item.city}`}
                    style={{ cursor: 'pointer' }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCity(selectedCity === item.city ? '' : item.city);
                      setSelectedCountry('');
                      setCurrentPage(1);
                    }}
                    onMouseEnter={(e) => {
                      const rect = mapSvgRef.current?.getBoundingClientRect();
                      if (rect) {
                        setHoveredPin({
                          title: item.city,
                          count,
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top,
                        });
                      }
                    }}
                    onMouseLeave={() => setHoveredPin(null)}
                  >
                    {/* Pulsing ring for selected pin */}
                    {isSelected && (
                      <circle cx={cx} cy={cy} r={pinRadius + 8} fill="none" stroke={themeStyles.pinPulse} strokeWidth="2" opacity="0.8">
                        <animate attributeName="r" values={`${pinRadius + 4};${pinRadius + 16}`} dur="1.6s" repeatCount="indefinite" />
                        <animate attributeName="opacity" values="0.9;0" dur="1.6s" repeatCount="indefinite" />
                      </circle>
                    )}

                    {/* Shadow */}
                    <circle cx={cx + 1} cy={cy + 1.5} r={pinRadius} fill="rgba(0,0,0,0.35)" />

                    {/* Red / Amber Google Map Pin Body */}
                    <circle
                      cx={cx}
                      cy={cy}
                      r={pinRadius}
                      fill={isSelected ? '#F59E0B' : themeStyles.pin}
                      stroke="#FFFFFF"
                      strokeWidth={1.8}
                    />

                    {/* Count badge */}
                    <text
                      x={cx}
                      y={cy + 3.5}
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize={pinRadius > 8 ? '9px' : '7.5px'}
                      fontWeight="700"
                      fontFamily="sans-serif"
                      pointerEvents="none"
                    >
                      {count}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Floating Zoom & Pan Controls on right */}
          <div
            style={{
              position: 'absolute',
              right: '16px',
              bottom: '24px',
              display: 'flex',
              flexDirection: 'column',
              backgroundColor: '#FFFFFF',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              overflow: 'hidden',
              border: '1px solid #DADCE0',
              zIndex: 10,
            }}
          >
            <button
              type="button"
              onClick={zoomIn}
              title="Zoom In"
              style={{
                width: '38px',
                height: '38px',
                border: 'none',
                background: '#FFFFFF',
                color: '#3C4043',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: '1px solid #E8EAED',
              }}
            >
              <ZoomIn size={18} />
            </button>
            <button
              type="button"
              onClick={zoomOut}
              title="Zoom Out"
              style={{
                width: '38px',
                height: '38px',
                border: 'none',
                background: '#FFFFFF',
                color: '#3C4043',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderBottom: '1px solid #E8EAED',
              }}
            >
              <ZoomOut size={18} />
            </button>
            <button
              type="button"
              onClick={resetMap}
              title="Reset View"
              style={{
                width: '38px',
                height: '38px',
                border: 'none',
                background: '#FFFFFF',
                color: '#3C4043',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <RotateCcw size={16} />
            </button>
          </div>

          {/* Hover Tooltip */}
          {hoveredPin && (
            <div
              style={{
                position: 'absolute',
                left: `${hoveredPin.x + 14}px`,
                top: `${hoveredPin.y - 32}px`,
                backgroundColor: '#202124',
                color: '#FFFFFF',
                borderRadius: '6px',
                padding: '6px 10px',
                fontSize: '12px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                pointerEvents: 'none',
                zIndex: 20,
              }}
            >
              <strong>{hoveredPin.title}</strong>
              <div style={{ color: '#81C995', fontSize: '11px', fontWeight: 600 }}>
                {hoveredPin.count} {hoveredPin.count === 1 ? 'research report' : 'research reports'}
              </div>
            </div>
          )}

          {/* Status Badge */}
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '14px',
              backgroundColor: 'rgba(255, 255, 255, 0.94)',
              backdropFilter: 'blur(4px)',
              padding: '6px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#3C4043',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              border: '1px solid #DADCE0',
              boxShadow: '0 1px 4px rgba(0,0,0,0.1)',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: themeStyles.pin }} />
              Active Research Coordinates ({cityClusters.size} Sites)
            </span>
            <span>Zoom: {mapZoom.toFixed(1)}x</span>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar for News Stream */}
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '14px' }}>
          {/* Search box */}
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <Search size={15} style={{ position: 'absolute', left: '12px', top: '10px', color: 'var(--color-muted)' }} />
            <input
              type="text"
              placeholder="Search ancient specimen discoveries, biobank sites, PCR assays, institutions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') fetchNews();
              }}
              className="input-field"
              style={{ paddingLeft: '34px', width: '100%', fontSize: '13px' }}
            />
          </div>

          {/* Language filter pills */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)' }}>Language:</span>
            <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden' }}>
              {[
                { id: 'all', label: 'All Articles' },
                { id: 'english_only', label: 'English' },
                { id: 'non_english', label: `International (${analytics?.nonEnglishCount || 0})` },
              ].map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  onClick={() => {
                    setLangFilter(pill.id as any);
                    setCurrentPage(1);
                  }}
                  style={{
                    padding: '6px 12px',
                    fontSize: '12px',
                    border: 'none',
                    backgroundColor: langFilter === pill.id ? 'var(--color-teal)' : 'var(--color-surface)',
                    color: langFilter === pill.id ? '#FFFFFF' : 'var(--color-ink)',
                    fontWeight: langFilter === pill.id ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>

          {/* City / Excavation Site selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--color-muted)' }}>Site / City:</span>
            <select
              className="input-field"
              value={selectedCity}
              onChange={(e) => {
                setSelectedCity(e.target.value);
                setSelectedCountry('');
                setCurrentPage(1);
              }}
              style={{ width: '220px', padding: '6px 10px', fontSize: '12px' }}
            >
              <option value="">All Research Sites ({cityClusters.size})</option>
              {[...cityClusters.keys()]
                .sort()
                .map((name) => (
                  <option key={name} value={name}>
                    {name} ({cityClusters.get(name)?.articles.length})
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Status Line */}
        <div style={{ marginTop: '12px', fontSize: '12px', color: 'var(--color-muted)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <span>
            Displaying <strong>{paginatedArticles.length}</strong> of <strong>{filteredArticles.length}</strong> reports
            {selectedCity ? ` for ${selectedCity}` : selectedCountry ? ` for ${selectedCountry.toUpperCase()}` : ''} • (Page {currentPage} of {totalPages})
          </span>
          {news && (
            <span>
              Provider: <a href={news.source_url} target="_blank" rel="noreferrer" style={{ color: 'var(--color-teal)', fontWeight: 600 }}>{news.source}</a>
            </span>
          )}
        </div>
      </div>

      {/* ARTICLES GRID - STRICTLY 6 PER PAGE */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '16px' }}>
        {paginatedArticles.map((article) => {
          const trans = translations[article.url];
          const hasTranslation = !!trans?.text;
          const isTranslating = !!trans?.loading;
          const isNonEnglish = !article.is_english;

          return (
            <div
              key={article.url}
              className="card"
              style={{
                padding: '18px 20px',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
                borderLeft: isNonEnglish ? '3px solid #F59E0B' : '3px solid var(--color-teal)',
                backgroundColor: 'var(--color-surface)',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span
                    className="badge"
                    style={{
                      fontSize: '11px',
                      backgroundColor: 'rgba(40, 125, 120, 0.1)',
                      color: 'var(--color-teal)',
                      fontWeight: 600,
                    }}
                  >
                    {article.domain || 'Scientific Journal'}
                  </span>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {isNonEnglish && (
                      <span
                        className="badge"
                        style={{
                          fontSize: '10px',
                          backgroundColor: '#FEF3C7',
                          color: '#B45309',
                          borderColor: '#FCD34D',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '3px',
                        }}
                      >
                        <Languages size={11} />
                        Original: {article.language}
                      </span>
                    )}

                    <span style={{ fontSize: '11px', color: 'var(--color-muted)', display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                      <MapPin size={11} color="var(--color-teal)" />
                      <strong>{article.city || article.country || 'International'}</strong>
                    </span>
                  </div>
                </div>

                {/* Headline link */}
                <h3 style={{ fontSize: '15px', fontWeight: 600, lineHeight: 1.4, margin: '0 0 8px' }}>
                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--color-ink)',
                      textDecoration: 'none',
                      display: 'inline',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--color-teal)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-ink)')}
                  >
                    {article.title}
                  </a>
                </h3>

                {/* Translation view */}
                {hasTranslation && (
                  <div
                    style={{
                      padding: '10px 12px',
                      backgroundColor: '#F8FAFC',
                      border: '1px solid #E2E8F0',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#0F172A',
                      marginTop: '6px',
                      lineHeight: 1.5,
                    }}
                  >
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--color-teal)', textTransform: 'uppercase', marginBottom: '2px' }}>
                      English Translation:
                    </div>
                    {trans.text}
                  </div>
                )}
              </div>

              {/* Card Footer */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingTop: '10px',
                  borderTop: '1px solid var(--color-border)',
                  fontSize: '11px',
                  color: 'var(--color-muted)',
                }}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={12} />
                  {article.seen || 'Live Index'}
                </span>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isNonEnglish && !hasTranslation && (
                    <button
                      type="button"
                      onClick={() => handleTranslate(article)}
                      disabled={isTranslating}
                      className="btn btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                    >
                      <Languages size={12} />
                      {isTranslating ? 'Translating...' : 'Translate'}
                    </button>
                  )}

                  <a
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-secondary"
                    style={{
                      padding: '3px 8px',
                      fontSize: '11px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      textDecoration: 'none',
                    }}
                  >
                    <span>Read Study</span>
                    <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* PAGINATION CONTROLS (Next / Prev / Page Numbers) */}
      {totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '8px',
            marginTop: '8px',
            padding: '14px 0',
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
          >
            <ChevronLeft size={14} /> Previous
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {Array.from({ length: totalPages }).map((_, i) => {
              const p = i + 1;
              const isCur = p === currentPage;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setCurrentPage(p)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '6px',
                    border: isCur ? '1px solid var(--color-teal)' : '1px solid var(--color-border)',
                    backgroundColor: isCur ? 'var(--color-teal)' : 'var(--color-surface)',
                    color: isCur ? '#FFFFFF' : 'var(--color-ink)',
                    fontSize: '12px',
                    fontWeight: isCur ? 700 : 500,
                    cursor: 'pointer',
                  }}
                >
                  {p}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="btn btn-secondary"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
          >
            Next <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* ON-DEMAND SCROLLABLE GEMINI AI EXECUTIVE SYNTHESIS SECTION */}
      <div className="card" style={{ padding: '22px 24px', borderLeft: '4px solid #8B5CF6', backgroundColor: 'var(--color-surface)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={18} color="#8B5CF6" />
              <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--color-ink)' }}>
                Gemini AI Executive Synthesis
              </h3>
              <span className="badge" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)', color: '#7C3AED', fontSize: '10px', fontWeight: 600 }}>
                On-Demand Analysis
              </span>
            </div>
            <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--color-muted)' }}>
              Synthesizes live specimen discoveries, excavation site reports, and biobank cold-chain protocols. Only runs when you click Generate.
            </p>
          </div>

          <button
            type="button"
            onClick={() => news?.articles && generateAiSummary(news.articles, news.topic_title || topic)}
            disabled={aiSummaryLoading}
            className="btn btn-primary"
            style={{
              padding: '8px 16px',
              fontSize: '12px',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#8B5CF6',
              borderColor: '#7C3AED',
            }}
          >
            <Sparkles size={14} className={aiSummaryLoading ? 'animate-spin' : ''} />
            {aiSummaryLoading ? 'Analyzing Wires...' : aiSummary ? 'Regenerate AI Synthesis' : 'Generate AI Synthesis'}
          </button>
        </div>

        {/* Scrollable Response Container */}
        {aiSummaryLoading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--color-muted)', backgroundColor: '#F8FAFC', borderRadius: '8px' }}>
            <Sparkles size={20} className="animate-spin" color="#8B5CF6" style={{ margin: '0 auto 8px' }} />
            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-ink)' }}>
              Querying Gemini AI on active {news?.topic_title || 'research'} reports...
            </div>
            <div style={{ fontSize: '11px', color: 'var(--color-muted)', marginTop: '4px' }}>
              Extracting breakthroughs, biobank standards, and paleogenomic trends.
            </div>
          </div>
        ) : aiSummary ? (
          <div
            style={{
              maxHeight: '260px',
              overflowY: 'auto',
              padding: '16px 20px',
              backgroundColor: '#F8FAFC',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              fontSize: '13px',
              color: 'var(--color-ink)',
              lineHeight: 1.65,
              whiteSpace: 'pre-line',
            }}
          >
            {aiSummary}
          </div>
        ) : (
          <div
            style={{
              padding: '20px',
              textAlign: 'center',
              backgroundColor: '#F8FAFC',
              borderRadius: '8px',
              border: '1px dashed #CBD5E1',
              color: 'var(--color-muted)',
              fontSize: '12px',
            }}
          >
            Click <strong>Generate AI Synthesis</strong> above to run an AI domain analysis on the current scientific headlines without consuming background credits.
          </div>
        )}

        {aiSummaryModel && !aiSummaryLoading && (
          <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--color-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Model: <strong>{aiSummaryModel}</strong></span>
            <span>Domain: <strong>{news?.topic_title || topic}</strong></span>
          </div>
        )}
      </div>

      {!busy && filteredArticles.length === 0 && (
        <div className="card" style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-muted)' }}>
          <Globe2 size={36} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
          <h4 style={{ margin: 0, fontSize: '16px', color: 'var(--color-ink)' }}>No scientific articles found</h4>
          <p style={{ margin: '6px 0 0', fontSize: '13px' }}>
            No specimen or genomic stories match this specific filter. Try selecting another research channel or resetting the site selection.
          </p>
        </div>
      )}

      {/* Attribution footer */}
      <div style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--color-muted)', textAlign: 'center' }}>
        SampleMind Scientific Radar • Continuous monitoring of peer-reviewed biobank publications and paleogenomics news • AI domain executive synthesis by Google Gemini.
      </div>
    </div>
  );
}
export default NewsPage;
