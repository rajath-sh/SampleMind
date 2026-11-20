"""Schema-derived coursework documents and SVG diagrams."""
from html import escape as e
from app.common import Base

SECTIONS = {
    "synopsis": "Synopsis",
    "requirements": "Requirement specification",
    "er": "ER diagram",
    "tests": "SQL and NoSQL test options",
    "dfd": "Data flow diagrams",
    "normalization": "Normalized tables",
    "security": "Forms, security and validation",
}

def schema_info():
    tables = []
    for table in Base.metadata.sorted_tables:
        tables.append({
            "name": table.name,
            "columns": [{"name": column.name, "type": str(column.type),
                         "primary": column.primary_key, "nullable": column.nullable,
                         "references": [fk.target_fullname for fk in column.foreign_keys]}
                        for column in table.columns],
            "keys": [column.name for column in table.primary_key],
            "unique": [list(constraint.columns.keys()) for constraint in table.constraints
                       if constraint.__class__.__name__ == "UniqueConstraint"],
        })
    return tables

def svg_text(x, y, text, size=13, underline=False):
    return f'<text x="{x}" y="{y}" text-anchor="middle" font-family="Arial,sans-serif" font-size="{size}" fill="#183b43"' + (
        ' text-decoration="underline"' if underline else '') + f'>{e(str(text))}</text>'

def er_svg():
    tables = schema_info()
    edges = [(table, column, ref) for table in tables for column in table["columns"] for ref in column["references"]]
    entity_rows = (len(tables) + 1) // 2
    height = 110 + entity_rows * 420 + len(edges) * 150
    parts = [f'<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="{height}" viewBox="0 0 1400 {height}">',
             '<rect width="100%" height="100%" fill="#fff"/>',
             svg_text(700, 32, "SampleMind — Chen entity–relationship model", 24),
             svg_text(700, 57, "Rectangles = entities · ellipses = attributes · underlined = key · diamonds = relationships", 14),
             svg_text(700, 80, "Foreign-key columns appear in the relational schema. Relationship panels below map every foreign key.", 13)]
    for index, table in enumerate(tables):
        x = 350 + (index % 2) * 700
        y = 260 + (index // 2) * 420
        columns = [column for column in table["columns"] if not column["references"] or column["primary"]]
        count = max(len(columns), 1)
        from math import cos, sin, pi
        for position, column in enumerate(columns):
            angle = 2 * pi * position / count
            ax, ay = x + 242 * cos(angle), y + 160 * sin(angle)
            parts.append(f'<line x1="{x}" y1="{y}" x2="{ax}" y2="{ay}" stroke="#8ea9a4"/>')
            parts.append(f'<ellipse cx="{ax}" cy="{ay}" rx="103" ry="19" fill="#f2f8f5" stroke="#5e9084"/>')
            parts.append(svg_text(ax, ay + 4, column["name"], 11, column["primary"]))
        parts.append(f'<rect x="{x-100}" y="{y-25}" width="200" height="50" fill="#e1efe9" stroke="#285f56" stroke-width="2"/>')
        parts.append(svg_text(x, y + 5, table["name"], 15))
    y = 120 + entity_rows * 420
    parts.append(svg_text(700, y - 25, "Relationship panels — each repeated entity denotes the same entity above", 19))
    for table, column, reference in edges:
        parent, key = reference.split(".")
        one = (len(table["keys"]) == 1 and column["primary"]) or [column["name"]] in table["unique"]
        label = column["name"].removesuffix("_id").replace("_", " ")
        parts.append(f'<rect x="70" y="{y}" width="260" height="48" fill="#e1efe9" stroke="#285f56"/>')
        parts.append(svg_text(200, y + 29, parent, 15))
        parts.append(f'<rect x="1070" y="{y}" width="260" height="48" fill="#e1efe9" stroke="#285f56"/>')
        parts.append(svg_text(1200, y + 29, table["name"], 15))
        parts.append(f'<polygon points="540,{y+24} 700,{y-12} 860,{y+24} 700,{y+60}" fill="#edf4fa" stroke="#426b91"/>')
        parts.append(svg_text(700, y + 28, label, 12))
        parts.append(f'<line x1="330" y1="{y+24}" x2="540" y2="{y+24}" stroke="#557c74"/>')
        parts.append(f'<line x1="860" y1="{y+24}" x2="1070" y2="{y+24}" stroke="#557c74"/>')
        if not column["nullable"]:
            parts.append(f'<line x1="870" y1="{y+29}" x2="1070" y2="{y+29}" stroke="#557c74"/>')
        parts.append(svg_text(420, y + 13, "1", 15))
        parts.append(svg_text(970, y + 13, "1" if one else "N", 15))
        parts.append(svg_text(700, y + 88, f'{table["name"]}.{column["name"]} → {reference} · ' +
                              ("optional" if column["nullable"] else "total child participation"), 12))
        y += 150
    parts.append("</svg>")
    return "".join(parts)

def dfd_svg():
    parts = ['<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1120" viewBox="0 0 1200 1120">',
             '<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3z" fill="#426b91"/></marker></defs>',
             '<rect width="100%" height="100%" fill="white"/>',
             svg_text(600, 35, "SampleMind data flow — context and level 1", 23)]
    def entity(x,y,label):
        parts.append(f'<rect x="{x}" y="{y}" width="170" height="55" fill="#f3f6f4" stroke="#285f56"/>')
        parts.append(svg_text(x+85,y+32,label,14))
    def process(x,y,label):
        parts.append(f'<rect x="{x}" y="{y}" width="200" height="64" rx="25" fill="#e4f2ed" stroke="#285f56"/>')
        parts.append(svg_text(x+100,y+37,label,13))
    def flow(x1,y1,x2,y2,label):
        parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#426b91" marker-end="url(#arrow)"/>')
        parts.append(svg_text((x1+x2)/2,(y1+y2)/2-9,label,11))
    def store(x,y,label):
        parts.append(f'<path d="M{x+230},{y} H{x} V{y+50} H{x+230}" fill="none" stroke="#285f56" stroke-width="2"/>')
        parts.append(svg_text(x+115,y+29,label,12))
    parts.append(svg_text(600,78,"Context diagram",18))
    entity(40,135,"Lab user")
    process(490,130,"0 · SampleMind")
    entity(990,135,"Gemini service")
    flow(210,148,490,148,"credentials, records, queries")
    flow(490,182,210,182,"results, reports, explanations")
    flow(690,147,990,147,"explicit chat + report text")
    flow(990,183,690,183,"assistant response")
    parts.append(svg_text(600,290,"Level 1 — requests and responses are decomposed below",18))
    entity(35,500,"Lab user")
    process(350,340,"1 · Authenticate / authorize")
    process(350,485,"2 · Manage lab records")
    process(350,635,"3 · Query / explain cohort")
    process(350,795,"4 · Reports and AI chat")
    store(870,340,"D1 · Users")
    store(870,485,"D2 · SQL lab records + audit")
    store(870,635,"D3 · TinyDB evidence / receipts")
    entity(885,800,"Gemini service")
    flow(200,514,350,372,"credentials")
    flow(550,365,870,365,"account lookup")
    flow(870,385,550,385,"account and role")
    flow(200,526,350,517,"record changes")
    flow(550,507,870,507,"validated writes")
    flow(870,529,550,529,"saved records")
    flow(200,545,350,667,"query / specimen")
    flow(550,657,870,537,"SQL reads")
    flow(870,548,550,680,"result and evidence")
    flow(200,556,350,827,"report / chat request")
    flow(550,806,870,553,"summary reads")
    flow(550,830,870,666,"receipt / evidence")
    flow(350,393,200,565,"session / role result")
    flow(350,542,200,581,"saved record / assignment")
    flow(350,693,200,598,"cohort result / explanation")
    flow(350,851,200,615,"download / assistant text")
    flow(550,847,885,831,"explicit chat context")
    flow(885,851,550,861,"AI text")
    parts.append(svg_text(600,1010,"Responses return to the requesting user. Authorization precedes each protected process.",13))
    parts.append(svg_text(600,1040,"D2 expands to specimen, storage, assays, lineage, experiments, results, incidents and audit tables.",13))
    parts.append("</svg>")
    return "".join(parts)

def table_schema(table):
    rows = "".join("<tr><td>"+e(column["name"])+"</td><td>"+e(column["type"])+"</td><td>"+
        ("PK " if column["primary"] else "")+("optional" if column["nullable"] else "required")+
        "</td><td>"+e(", ".join(column["references"]))+"</td></tr>" for column in table["columns"])
    return f'<h3>{e(table["name"])}</h3><table><thead><tr><th>Attribute</th><th>Type</th><th>Key / nullability</th><th>References</th></tr></thead><tbody>{rows}</tbody></table>'

def generated(section, variant="default"):
    from pathlib import Path
    assets = Path(__file__).with_name("coursework_assets")
    if section == "er" and variant == "full" and (assets / "er-full.svg").exists():
        return (assets / "er-full.svg").read_bytes(), "image/svg+xml", "SampleMind-full-ER.svg"
    if section in ("er", "dfd") and variant == "default" and (assets / f"{section}.svg").exists():
        return (assets / f"{section}.svg").read_bytes(), "image/svg+xml", f"SampleMind-{section}.svg"
    if variant == "pdf" and (assets / f"{section}.pdf").exists():
        return (assets / f"{section}.pdf").read_bytes(), "application/pdf", f"SampleMind-{section}.pdf"
    title = SECTIONS[section]
    if section == "er" and variant != "notes":
        return er_svg().encode(), "image/svg+xml", "SampleMind-Chen-ER.svg"
    if section == "dfd" and variant != "notes":
        return dfd_svg().encode(), "image/svg+xml", "SampleMind-DFD.svg"
    tables = schema_info()
    if section == "requirements":
        body = """
<h2>Objective and scope</h2><p>Manage biological specimens, derivations, storage, assays, experiments, results and incident review. Explain included and excluded assay cohorts from source records.</p>
<h2>Software and hardware</h2><p>Windows with Python 3.12, Node.js 20+, SQLite, TinyDB and a modern browser. A practical classroom baseline is a dual-core processor, 8 GB RAM and 2 GB free storage for dependencies. Internet is required for optional AI and news services. Actual resource use depends on inventory size.</p>
<h2>Functional requirements</h2><ol><li>Authenticate accounts and enforce current server-side roles.</li><li>Register and move specimens, record quantity changes and derive children atomically.</li><li>Prevent lineage cycles and stock overdraw.</li><li>Record assays and evaluate cohort coverage from latest completed evidence.</li><li>Manage experiments, equipment and result review.</li><li>Report incidents, assign staff, accept assignments and exchange messages.</li><li>Run administrator SQL submissions with rollback on errors.</li><li>Generate downloadable summaries and verify their local hash receipts.</li><li>Send selected conversation and report text to a configured AI service.</li><li>Upload, view, download and remove coursework materials.</li></ol>
<h2>Nonfunctional requirements</h2><ul><li>Integrity through keys, constraints and transactional writes.</li><li>Accessible controls, readable tables and reduced-motion support.</li><li>Explicit errors when optional external services fail.</li><li>Keep API keys on the server and exclude credentials from reports.</li><li>Persist existing records across startup and in-place schema migration.</li></ul>
<h2>Data requirements</h2><p>Relational operational data remains authoritative. TinyDB stores variable evidence documents and report receipts. Demonstration inventory and synthetic model labels must be identified as such.</p>
"""
    elif section == "normalization":
        body = """<h2>Worked decomposition</h2>
<p>Illustrative joined input includes repeated specimen type descriptions, storage labels and multiple assays for one specimen.</p>
<div class="flow">Repeated assay list → 1NF: one assay per row → remove partial dependencies → 2NF → separate type and location dependencies → 3NF relations</div>
<p>For an illustrative unnormalized export, assume test_sequence numbers assays within each specimen. For its composite key (sample_id, sample_test_id), sample_id → sample_name, sample_type_id, storage_location_id is a partial dependency. Separate the Sample relation from SampleTest. Then sample_type_id → type_code, type_name and storage_location_id → location_code move to their lookup relations.</p>
<div class="flow">SampleTest(sample_test_id PK, sample_id FK, assay attributes)<br>↓ joins through sample_id<br>Sample(sample_id PK, sample_type_id FK, current_storage_location_id FK, sample attributes)<br>↙ sample_type_id &nbsp;&nbsp;&nbsp; current_storage_location_id ↘<br>SampleType(type attributes) &nbsp;&nbsp;&nbsp; StorageLocation(location attributes)</div>
<h2>Functional dependencies and assumptions</h2><p>Each declared primary key determines its row attributes. Declared unique non-null codes provide alternate candidate keys. Assay type is a measured protocol label and does not determine a result. Historical quantities and statuses describe the corresponding event time. Domain assumptions must be checked before asserting BCNF for every relation; surrogate keys alone do not establish normalization.</p>
<h2>Current relational schemas</h2>""" + "".join(table_schema(table) for table in tables)
    elif section == "tests":
        body = """<h2>Rubric demonstration</h2><p>Demonstrate at least five relevant SQL queries and five NoSQL operations, explaining their inputs and expected outputs. Execute them in Database Lab and SQL Testing.</p>
<h3>SQL</h3><ol><li>LEFT JOIN inventory counts by type.</li><li>Selection of assays by specimen.</li><li>Recursive ancestor traversal.</li><li>Relational division for all required passing assays.</li><li>Open-incident joins and ordered results.</li><li>Transaction update followed by ROLLBACK.</li></ol>
<h3>NoSQL</h3><ol><li>Read custody event aggregates.</li><li>Filter nested subject.type.</li><li>Filter sample_ids membership.</li><li>Filter event action.</li><li>Insert a temperature reading and select excursions.</li><li>Replay committed events and demonstrate duplicate prevention.</li></ol>
<h3>Integrity and access tests</h3><ul><li>Reject a duplicate specimen code and unknown foreign key.</li><li>Reject a lineage cycle and insufficient stock.</li><li>Show concurrent derivation cannot overspend.</li><li>Show staff acceptance and private message access.</li><li>Alter downloaded report text and show verification failure.</li></ul>
<h3>Executable checks</h3><pre>python -m pytest backend/tests/test_integrated_lab.py -q</pre><p>The suite tests REST behavior and persistence. Browser interaction and configured external-provider checks remain separate validations.</p>"""
    elif section == "security":
        body = """<h2>Forms</h2><p>Regular username and password login plus demo account selectors. Specimen registration validates identifiers and stock; derivation records a parent debit and child credit; storage transfer requires an active destination and records a reason. Incident assignments require active staff.</p>
<h2>Server-side access</h2><p>JWT validation loads the current active SQL user on each request. Administrators manage accounts and run SQL Testing. Researchers manage lab records. Technicians report incidents, record readings and respond to their assignments. Reviewers review handling assessments and verify results. Viewers use permitted read routes.</p>
<h2>Validation and transaction boundaries</h2><p>Foreign keys, unique constraints, status checks, stock locks and cycle checks reinforce request validation. Console batches commit together or roll back after an error. Arbitrary schema commands are limited to administrators and can affect application compatibility.</p>
<h2>Secrets, attachments and outputs</h2><p>Gemini credentials remain server-side. Reports omit passwords and keys. A report hash chain provides local integrity receipts. Uploads are restricted in size and media type, given opaque IDs and stored in the project. Removed uploads remain recoverable until the owner chooses permanent cleanup.</p>
<h2>Model provenance</h2><p>The Random Forest exercise uses a reproducible synthetic dataset. Holdout accuracy estimates agreement with generated labels. It provides no laboratory validation estimate.</p>"""
    elif section in ("er", "dfd"):
        from .coursework_content import diagram_notes
        body = diagram_notes(section, tables, table_schema)
    else:
        raise ValueError("Synopsis must be supplied by the student.")
    if section in ("requirements", "normalization", "tests", "security"):
        from .coursework_content import section_body
        body = section_body(section, tables, table_schema)
    document = f"""<!doctype html><html lang="en"><meta charset="utf-8"><title>{e(title)}</title>
<style>body{{font:16px/1.55 Arial,sans-serif;max-width:1050px;margin:30px auto;padding:20px;color:#193b43}}h1,h2{{color:#286c61}}table{{border-collapse:collapse;width:100%;font-size:13px;margin-bottom:24px}}th,td{{border:1px solid #ccdcd6;padding:7px;text-align:left}}th,.flow{{background:#e9f3ee}}.flow{{padding:20px;line-height:2}}pre{{white-space:pre-wrap}}@media print{{h2,h3{{break-after:avoid}}tr{{break-inside:avoid}}}}</style>
<h1>SampleMind — {e(title)}</h1><p>RVCE · Database Management Systems · CD252IA</p>{body}</html>"""
    return document.encode(), "text/html; charset=utf-8", f"SampleMind-{section}.html"
