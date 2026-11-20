"""Live article metadata. Map positions refer to publisher countries."""
import asyncio
import time
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends
from app.common import SampleMindException, get_current_user

router = APIRouter(prefix="/api/v1/news", tags=["Research news"], dependencies=[Depends(get_current_user)])
TOPICS = {
    "biobanks": '(biobank OR biospecimen OR "biological samples")',
    "genomics": '(genomics OR "ancient DNA" OR "DNA sequencing")',
    "databases": '("database provenance" OR "research data management" OR "scientific databases")',
}
cache = {}
lock = asyncio.Lock()


@router.get("")
async def live_news(topic: Literal["biobanks", "genomics", "databases"] = "biobanks"):
    async with lock:
        old = cache.get(topic)
        if old and time.monotonic() - old[0] < 300:
            return old[1]
        try:
            async with httpx.AsyncClient(timeout=25, follow_redirects=False) as client:
                response = await client.get("https://api.gdeltproject.org/api/v2/doc/doc", params={
                    "query": TOPICS[topic], "mode": "artlist", "format": "json",
                    "maxrecords": 75, "timespan": "7d", "sort": "datedesc",
                })
                response.raise_for_status()
                payload = response.json()
            articles = []
            seen = set()
            for row in payload.get("articles", []):
                url = row.get("url", "")
                if url in seen or urlparse(url).scheme not in ("http", "https"):
                    continue
                seen.add(url)
                articles.append({
                    "title": str(row.get("title", "Untitled"))[:400], "url": url,
                    "domain": str(row.get("domain", ""))[:150],
                    "country": str(row.get("sourcecountry", ""))[:100],
                    "seen": str(row.get("seendate", ""))[:40],
                    "language": str(row.get("language", ""))[:40],
                })
            result = {"articles": articles, "fetched_at": datetime.now(timezone.utc).isoformat(),
                      "source": "GDELT DOC 2.0", "window": "Last 7 days",
                      "location_basis": "Publisher country reported by GDELT"}
            cache[topic] = (time.monotonic(), result)
            return result
        except (httpx.HTTPError, ValueError) as error:
            raise SampleMindException(502, "The live news provider is unavailable or rate-limited. Try again later.", "NEWS_UNAVAILABLE") from error
