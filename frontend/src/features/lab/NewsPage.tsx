import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../../common/apiClient';

interface Article { title: string; url: string; domain: string; country: string; seen: string; language: string }
interface News { articles: Article[]; fetched_at: string; source: string; window: string; location_basis: string }
interface Country {
  properties: { ADMIN: string; NAME: string; LABEL_X: number; LABEL_Y: number };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}
const aliases: Record<string, string> = { 'united states': 'united states of america', 'uk': 'united kingdom',
  'republic of korea': 'south korea', 'russian federation': 'russia', 'czech republic': 'czechia' };
const normalized = (name: string) => aliases[name.toLowerCase()] || name.toLowerCase();

function polygonPath(rings: number[][][]) {
  return rings.map(ring => ring.map(([lon, lat], index) =>
    `${index ? 'L' : 'M'}${(lon + 180) * 2},${(90 - lat) * 2}`).join(' ') + ' Z').join(' ');
}
function path(country: Country) {
  return country.geometry.type === 'Polygon' ? polygonPath(country.geometry.coordinates as number[][][])
    : (country.geometry.coordinates as number[][][][]).map(polygonPath).join(' ');
}
function seenDate(raw: string) {
  const parsed = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(raw);
  return parsed ? new Date(`${parsed[1]}-${parsed[2]}-${parsed[3]}T${parsed[4]}:${parsed[5]}:${parsed[6]}Z`).toLocaleString() : raw;
}

export function NewsPage() {
  const [topic, setTopic] = useState('biobanks');
  const [country, setCountry] = useState('');
  const [news, setNews] = useState<News>();
  const [countries, setCountries] = useState<Country[]>([]);
  const [error, setError] = useState('');
  const [mapError, setMapError] = useState('');
  const [busy, setBusy] = useState(true);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/world-countries.geojson', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('World map could not load.');
      return response.json();
    }).then(data => setCountries(data.features)).catch(err => { if (!controller.signal.aborted) setMapError(err.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setBusy(true); setError(''); setNews(undefined); setCountry('');
    apiRequest<News>(`/news?topic=${topic}`, { signal: controller.signal }).then(setNews)
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [topic, revision]);

  const groups = useMemo(() => {
    const result = new Map<string, Article[]>();
    for (const article of news?.articles ?? []) {
      const key = normalized(article.country || 'Unknown');
      result.set(key, [...(result.get(key) || []), article]);
    }
    return result;
  }, [news]);
  const articles = country ? groups.get(country) || [] : news?.articles || [];
  return <div className="lab-stack">
    <header className="lab-hero"><div><div className="lab-kicker">RESEARCH COVERAGE · LIVE PROVIDER</div><h1>World News</h1>
      <p>Recent coverage of biobanks, genomics and research data systems.</p></div></header>
    <section className="card lab-panel">
      <div className="lab-controls">
        <label>Topic<select className="input-field" value={topic} onChange={event => setTopic(event.target.value)}>
          <option value="biobanks">Biobanks and specimens</option><option value="genomics">Genomics and ancient DNA</option>
          <option value="databases">Research databases</option>
        </select></label>
        <label>Publisher country<select className="input-field" value={country} onChange={event => setCountry(event.target.value)}>
          <option value="">All publisher countries</option>
          {[...groups.keys()].sort().map(name => <option key={name}>{name}</option>)}
        </select></label>
        <button className="btn-secondary" type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}>Refresh coverage</button>
      </div>
      <p className="lab-muted">Markers show publisher countries from GDELT, positioned at country label points. Article event locations may differ. Select a marker to filter stories.</p>
      {error && <p className="lab-error" role="alert">{error}</p>}
      {mapError && <p className="lab-error" role="alert">{mapError}</p>}
      <svg viewBox="0 0 720 360" role="img" aria-label="World map of publisher countries" style={{ width: '100%', background: '#edf5f7', borderRadius: 12 }}>
        {countries.map(item => <path key={item.properties.ADMIN} d={path(item)} fill="#d4e4dd" stroke="#8ca89e" strokeWidth=".4" />)}
        {countries.filter(item => groups.has(normalized(item.properties.ADMIN))).map(item => {
          const name = normalized(item.properties.ADMIN);
          const count = groups.get(name)?.length || 0;
          return <g key={name} role="button" tabIndex={0} aria-label={`${item.properties.ADMIN}, ${count} articles`}
            onClick={() => setCountry(country === name ? '' : name)}
            onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setCountry(country === name ? '' : name); } }}
            style={{ cursor: 'pointer' }}>
            <circle cx={(item.properties.LABEL_X + 180) * 2} cy={(90 - item.properties.LABEL_Y) * 2}
              r={4 + Math.min(8, Math.sqrt(count))} fill={country === name ? '#b16a28' : '#287d78'} stroke="white" strokeWidth="1">
              <title>{item.properties.ADMIN} · {count} articles</title>
            </circle>
          </g>;
        })}
      </svg>
      <p className="lab-muted" role="status">{busy ? 'Fetching recent articles…' : news
        ? `${news.source} · ${news.window} · Fetched ${new Date(news.fetched_at).toLocaleString()}` : 'Live coverage unavailable.'}</p>
      <div className="lab-grid" style={{ width: '100%' }}>
        {articles.map(article => <article className="cryo-detail" key={article.url}>
          <h3 style={{ fontSize: '1rem' }}><a href={article.url} target="_blank" rel="noreferrer">{article.title}</a></h3>
          <p className="lab-muted">{article.domain} · {article.country || 'Country unavailable'} · {article.language}</p>
          <small>Indexed {seenDate(article.seen)}</small>
        </article>)}
      </div>
      {!busy && news && articles.length === 0 && <p className="lab-muted">No articles match this selection.</p>}
      <p className="lab-muted">Map boundaries © Natural Earth, public domain. Article metadata comes from GDELT. Refreshes may reuse a five-minute server cache.</p>
    </section>
  </div>;
}
