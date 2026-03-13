/**
 * Bodhidharma Text API — Lightweight HTTP server for concept-to-text queries.
 *
 * Serves two endpoints consumed by the knowledge graph:
 *   GET /api/concept-texts?id=N&limit=15   — Top texts containing a concept
 *   GET /api/thread-texts?ids=N,N,N&limit=15 — Texts where ALL concepts co-occur
 *
 * Usage:
 *   bun text-api.ts              # Starts on port 3821
 *   bun text-api.ts --port 4000  # Custom port
 */
import { Database } from 'bun:sqlite';
import { existsSync } from 'fs';
import { join } from 'path';

const DATA_DIR = join(import.meta.dir, 'data');
const DB_PATH = join(DATA_DIR, 'dharma.db');
const DEFAULT_PORT = 3821;

// ─── Parse CLI args ──────────────────────────────────────────────────────────
const portArg = process.argv.find((_, i, a) => a[i - 1] === '--port');
const PORT = portArg ? parseInt(portArg, 10) : DEFAULT_PORT;

if (!existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`);
  process.exit(1);
}

const db = new Database(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

// ─── Precompute concept→text mapping for fast lookups ────────────────────────
// This avoids joining 2.5M concept_occurrences rows on every request.
console.log('Building concept→text index (one-time)...');
const t0 = performance.now();
db.exec(`
  CREATE TABLE IF NOT EXISTS concept_text_counts (
    concept_id INTEGER NOT NULL,
    text_id INTEGER NOT NULL,
    occ_count INTEGER NOT NULL,
    PRIMARY KEY (concept_id, text_id)
  ) WITHOUT ROWID
`);
const existingRows = db.prepare('SELECT COUNT(*) as n FROM concept_text_counts').get() as {n: number};
if (existingRows.n === 0) {
  db.exec(`
    INSERT INTO concept_text_counts (concept_id, text_id, occ_count)
    SELECT co.concept_id, ch.text_id, COUNT(*)
    FROM concept_occurrences co
    JOIN chunks ch ON ch.id = co.chunk_id
    GROUP BY co.concept_id, ch.text_id
  `);
  db.exec('CREATE INDEX IF NOT EXISTS idx_ctc_concept ON concept_text_counts(concept_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_ctc_text ON concept_text_counts(text_id)');
}
const elapsed = ((performance.now() - t0) / 1000).toFixed(1);
const ctcCount = (db.prepare('SELECT COUNT(*) as n FROM concept_text_counts').get() as {n: number}).n;
console.log(`  concept_text_counts: ${ctcCount.toLocaleString()} rows (${elapsed}s)`);

// ─── Prepared Statements (using precomputed table) ───────────────────────────

// Tradition-balanced query: uses ROW_NUMBER() window function to rank texts
// within each tradition, then interleaves traditions to ensure representation.
// Without this, Mahayana texts (which average 117 chunks/text vs 8.2 for Theravada)
// dominate the top results by raw occurrence count, making the Bibliography appear
// to contain only Chinese sources.
const conceptTextsBalancedStmt = db.prepare(`
  SELECT id, title_en, tradition, text_type, collection, original_lang,
         source_url, occurrence_count
  FROM (
    SELECT
      t.id,
      t.title_en,
      t.tradition,
      t.text_type,
      t.collection,
      t.original_lang,
      t.source_url,
      ctc.occ_count as occurrence_count,
      ROW_NUMBER() OVER (
        PARTITION BY t.tradition
        ORDER BY ctc.occ_count DESC
      ) as tradition_rank
    FROM concept_text_counts ctc
    JOIN texts t ON t.id = ctc.text_id
    WHERE ctc.concept_id = ?
  )
  ORDER BY tradition_rank ASC, occurrence_count DESC
  LIMIT ?
`);

// Unbalanced fallback (original behavior, available via ?balanced=false)
const conceptTextsUnbalancedStmt = db.prepare(`
  SELECT
    t.id,
    t.title_en,
    t.tradition,
    t.text_type,
    t.collection,
    t.original_lang,
    t.source_url,
    ctc.occ_count as occurrence_count
  FROM concept_text_counts ctc
  JOIN texts t ON t.id = ctc.text_id
  WHERE ctc.concept_id = ?
  ORDER BY ctc.occ_count DESC
  LIMIT ?
`);

const conceptTextsCountStmt = db.prepare(`
  SELECT COUNT(*) as total FROM concept_text_counts WHERE concept_id = ?
`);

const conceptTextsCountByTraditionStmt = db.prepare(`
  SELECT t.tradition, COUNT(*) as count
  FROM concept_text_counts ctc
  JOIN texts t ON t.id = ctc.text_id
  WHERE ctc.concept_id = ?
  GROUP BY t.tradition
`);

// Thread intersection: texts where ALL given concepts appear.
function threadTextsQuery(conceptIds: number[], limit: number, balanced = true) {
  const placeholders = conceptIds.map(() => '?').join(',');
  const countStmt = db.prepare(`
    SELECT COUNT(*) as total FROM (
      SELECT text_id
      FROM concept_text_counts
      WHERE concept_id IN (${placeholders})
      GROUP BY text_id
      HAVING COUNT(DISTINCT concept_id) = ?
    )
  `);
  const total = (countStmt.get(...conceptIds, conceptIds.length) as {total: number}).total;

  if (balanced) {
    // Tradition-balanced: rank within each tradition, then interleave
    const stmt = db.prepare(`
      SELECT id, title_en, tradition, text_type, collection, original_lang,
             source_url, total_occurrences
      FROM (
        SELECT
          t.id,
          t.title_en,
          t.tradition,
          t.text_type,
          t.collection,
          t.original_lang,
          t.source_url,
          SUM(ctc.occ_count) as total_occurrences,
          ROW_NUMBER() OVER (
            PARTITION BY t.tradition
            ORDER BY SUM(ctc.occ_count) DESC
          ) as tradition_rank
        FROM concept_text_counts ctc
        JOIN texts t ON t.id = ctc.text_id
        WHERE ctc.concept_id IN (${placeholders})
        AND ctc.text_id IN (
          SELECT text_id
          FROM concept_text_counts
          WHERE concept_id IN (${placeholders})
          GROUP BY text_id
          HAVING COUNT(DISTINCT concept_id) = ?
        )
        GROUP BY t.id
      )
      ORDER BY tradition_rank ASC, total_occurrences DESC
      LIMIT ?
    `);
    const rows = stmt.all(...conceptIds, ...conceptIds, conceptIds.length, limit);
    return { total, rows };
  }

  // Unbalanced (original behavior)
  const stmt = db.prepare(`
    SELECT
      t.id,
      t.title_en,
      t.tradition,
      t.text_type,
      t.collection,
      t.original_lang,
      t.source_url,
      SUM(ctc.occ_count) as total_occurrences
    FROM concept_text_counts ctc
    JOIN texts t ON t.id = ctc.text_id
    WHERE ctc.concept_id IN (${placeholders})
    AND ctc.text_id IN (
      SELECT text_id
      FROM concept_text_counts
      WHERE concept_id IN (${placeholders})
      GROUP BY text_id
      HAVING COUNT(DISTINCT concept_id) = ?
    )
    GROUP BY t.id
    ORDER BY total_occurrences DESC
    LIMIT ?
  `);
  const rows = stmt.all(...conceptIds, ...conceptIds, conceptIds.length, limit);
  return { total, rows };
}

// ─── Text content query (chunks for a given text + concept) ─────────────────

const textChunksStmt = db.prepare(`
  SELECT c.id, c.section, c.verse_range, c.structural_type, c.word_count,
         c.content_en, c.content_original, c.original_lang
  FROM chunks c
  JOIN concept_occurrences co ON co.chunk_id = c.id
  WHERE c.text_id = ? AND co.concept_id = ?
  ORDER BY c.chunk_index
  LIMIT 20
`);

const textInfoStmt = db.prepare(`
  SELECT id, title_en, title_original, tradition, school, collection,
         text_type, original_lang, author_original, translator, source_url
  FROM texts WHERE id = ?
`);

const textAllChunksStmt = db.prepare(`
  SELECT id, section, verse_range, structural_type, word_count,
         content_en, content_original, original_lang
  FROM chunks
  WHERE text_id = ?
  ORDER BY chunk_index
  LIMIT 50
`);

// ─── Prepared Statements for DharmaMitra cross-reference queries ─────────────

const parallelAlignmentsByRefStmt = db.prepare(`
  SELECT id, source_lang, target_lang, source_text, target_text,
         alignment_score, source_ref, target_ref, created_at
  FROM parallel_alignments
  WHERE source_ref LIKE ?||':%' OR target_ref LIKE ?||':%'
  LIMIT ?
`);

const textualMatchesByRefStmt = db.prepare(`
  SELECT id, source_segment, target_segment, source_collection, target_collection,
         match_score, match_type, source_ref, target_ref, created_at
  FROM textual_matches
  WHERE source_ref LIKE ?||':%' OR target_ref LIKE ?||':%'
  LIMIT ?
`);

// Lazy-opened dictionary database connection (cached at module level)
const DICT_DB_PATH = join(DATA_DIR, 'dharma-dict.db');
let dictDb: Database | null = null;

function getDictDb(): Database | null {
  if (dictDb) return dictDb;
  try {
    if (!existsSync(DICT_DB_PATH)) return null;
    dictDb = new Database(DICT_DB_PATH);
    dictDb.exec('PRAGMA journal_mode = WAL');
    return dictDb;
  } catch {
    return null;
  }
}

/**
 * Extract the BuddhaNextus text key from a source_url.
 * e.g. 'https://buddhanexus.net/sanskrit/K01abhisdhu' -> 'K01abhisdhu'
 * Returns null for non-buddhanexus URLs or missing URLs.
 */
function extractBuddhaNextusKey(sourceUrl: string | null | undefined): string | null {
  if (!sourceUrl || !sourceUrl.includes('buddhanexus.net')) return null;
  const segments = sourceUrl.split('/');
  const key = segments[segments.length - 1];
  return key || null;
}

// ─── CORS Headers ────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: CORS });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

// ─── Server ──────────────────────────────────────────────────────────────────
const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);

    // CORS preflight
    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // GET /api/concept-texts?id=N&limit=15&balanced=true
    // balanced=true (default): Interleaves traditions so Theravada, Vajrayana, and
    // general texts appear alongside Mahayana. Without this, Mahayana texts dominate
    // because their higher chunk counts inflate occurrence_count.
    if (url.pathname === '/api/concept-texts') {
      const id = parseInt(url.searchParams.get('id') ?? '', 10);
      if (isNaN(id)) return errorResponse('Missing or invalid "id" parameter');
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '15', 10), 50);
      const balanced = url.searchParams.get('balanced') !== 'false';
      const stmt = balanced ? conceptTextsBalancedStmt : conceptTextsUnbalancedStmt;
      const rows = stmt.all(id, limit);
      const total = (conceptTextsCountStmt.get(id) as {total: number}).total;
      const traditions = (conceptTextsCountByTraditionStmt.all(id) as {tradition: string, count: number}[])
        .reduce((acc, r) => { acc[r.tradition] = r.count; return acc; }, {} as Record<string, number>);
      return jsonResponse({ concept_id: id, total, balanced, traditions, texts: rows });
    }

    // GET /api/thread-texts?ids=1,2,3&limit=15
    if (url.pathname === '/api/thread-texts') {
      const idsParam = url.searchParams.get('ids') ?? '';
      const ids = idsParam.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      if (ids.length === 0) return errorResponse('Missing or invalid "ids" parameter');
      if (ids.length > 20) return errorResponse('Too many concept IDs (max 20)');
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '15', 10), 50);
      const { total, rows } = threadTextsQuery(ids, limit);
      return jsonResponse({ concept_ids: ids, total, texts: rows });
    }

    // GET /api/text-content?text_id=N&concept_id=N — Relevant chunks from a text
    if (url.pathname === '/api/text-content') {
      const textId = parseInt(url.searchParams.get('text_id') ?? '', 10);
      if (isNaN(textId)) return errorResponse('Missing or invalid "text_id" parameter');
      const conceptId = url.searchParams.get('concept_id');
      const info = textInfoStmt.get(textId);
      if (!info) return errorResponse('Text not found', 404);

      let chunks;
      if (conceptId && !isNaN(parseInt(conceptId, 10))) {
        chunks = textChunksStmt.all(textId, parseInt(conceptId, 10));
        // If no concept-specific chunks, fall back to all chunks
        if ((chunks as any[]).length === 0) {
          chunks = textAllChunksStmt.all(textId);
        }
      } else {
        chunks = textAllChunksStmt.all(textId);
      }
      return jsonResponse({ text: info, chunks });
    }

    // GET /api/parallel-alignments?text_id=N&limit=20  or  ?ref=PREFIX&limit=20
    if (url.pathname === '/api/parallel-alignments') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
      const refParam = url.searchParams.get('ref');
      let refKey: string | null = refParam ?? null;
      let textId: number | undefined;

      if (!refKey) {
        const tid = parseInt(url.searchParams.get('text_id') ?? '', 10);
        if (isNaN(tid)) return errorResponse('Missing "text_id" or "ref" parameter');
        textId = tid;
        const info = textInfoStmt.get(tid) as { source_url: string } | undefined;
        if (!info) return errorResponse('Text not found', 404);
        refKey = extractBuddhaNextusKey(info.source_url);
        if (!refKey) return jsonResponse({ text_id: tid, ref_key: null, alignments: [] });
      }

      const alignments = parallelAlignmentsByRefStmt.all(refKey, refKey, limit);
      return jsonResponse({ text_id: textId ?? null, ref_key: refKey, alignments });
    }

    // GET /api/dictionary?term=X&limit=20
    if (url.pathname === '/api/dictionary') {
      const term = url.searchParams.get('term');
      if (!term) return errorResponse('Missing "term" parameter');
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);

      const ddb = getDictDb();
      if (!ddb) return jsonResponse({ term, entries: [], error: 'Dictionary database not available' });

      try {
        // Quote the term for FTS5 safety: wrap in double quotes to treat as literal phrase
        const safeTerm = '"' + term.replace(/"/g, '""') + '"';
        const entries = ddb.prepare(`
          SELECT de.id, de.headword, de.headword_lang, de.definition, de.definition_lang,
                 de.dictionary_name, de.pos, de.created_at
          FROM dictionary_fts df
          JOIN dictionary_entries de ON de.id = df.rowid
          WHERE dictionary_fts MATCH ?
          LIMIT ?
        `).all(safeTerm, limit);
        return jsonResponse({ term, entries });
      } catch (e: any) {
        return jsonResponse({ term, entries: [], error: e?.message ?? 'FTS query failed' });
      }
    }

    // GET /api/textual-matches?text_id=N&limit=20  or  ?ref=PREFIX&limit=20
    if (url.pathname === '/api/textual-matches') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20', 10), 100);
      const refParam = url.searchParams.get('ref');
      let refKey: string | null = refParam ?? null;
      let textId: number | undefined;

      if (!refKey) {
        const tid = parseInt(url.searchParams.get('text_id') ?? '', 10);
        if (isNaN(tid)) return errorResponse('Missing "text_id" or "ref" parameter');
        textId = tid;
        const info = textInfoStmt.get(tid) as { source_url: string } | undefined;
        if (!info) return errorResponse('Text not found', 404);
        refKey = extractBuddhaNextusKey(info.source_url);
        if (!refKey) return jsonResponse({ text_id: tid, ref_key: null, matches: [] });
      }

      const matches = textualMatchesByRefStmt.all(refKey, refKey, limit);
      return jsonResponse({ text_id: textId ?? null, ref_key: refKey, matches });
    }

    // GET /api/dharmamitra-stats — Counts for DharmaMitra data layers
    if (url.pathname === '/api/dharmamitra-stats') {
      const pa = db.prepare('SELECT COUNT(*) as n FROM parallel_alignments').get() as {n: number};
      const tm = db.prepare('SELECT COUNT(*) as n FROM textual_matches').get() as {n: number};
      let dictCount = 0;
      try {
        const ddb = getDictDb();
        if (ddb) {
          const de = ddb.prepare('SELECT COUNT(*) as n FROM dictionary_entries').get() as {n: number};
          dictCount = de.n;
        }
      } catch { /* dict db may not exist */ }
      return jsonResponse({
        parallel_alignments: pa.n,
        dictionary_entries: dictCount,
        textual_matches: tm.n,
      });
    }

    // GET /api/health
    if (url.pathname === '/api/health') {
      return jsonResponse({ status: 'ok', port: PORT, db: DB_PATH });
    }

    return errorResponse('Not found', 404);
  },
});

console.log(`Bodhidharma Text API running on http://localhost:${PORT}`);
console.log(`  GET /api/concept-texts?id=N&limit=15`);
console.log(`  GET /api/thread-texts?ids=N,N,N&limit=15`);
console.log(`  GET /api/text-content?text_id=N&concept_id=N`);
console.log(`  GET /api/parallel-alignments?text_id=N&limit=20`);
console.log(`  GET /api/dictionary?term=X&limit=20`);
console.log(`  GET /api/textual-matches?text_id=N&limit=20`);
console.log(`  GET /api/health`);
