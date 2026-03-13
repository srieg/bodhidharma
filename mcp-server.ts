#!/usr/bin/env bun
/**
 * Bodhidharma - Buddhist Philosophy MCP Server
 *
 * 10 tools for Buddhist text search, concept exploration, and cross-tradition analysis.
 * Requires dharma.db built via the CLI pipeline.
 */
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from '@modelcontextprotocol/sdk/types.js';
import {
  semanticSearch, conceptSearch, keywordSearch, etymologySearch, compareTexts,
  formatSearchResults, formatConceptResult, formatEtymologyResult,
} from './src/search';
import {
  getStats, getDatabase, getChunksByText, getTextById,
  searchParallelAlignments, searchParallelByRef,
  searchTextualMatches,
  getDictDatabase, lookupDictionary, searchDictionaryFTS, getDictionaryNames,
} from './src/db';
import { checkLMStudio } from './src/embedder';
import type { SearchFilters } from './src/types';

const server = new Server(
  { name: 'buddhist-rag', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// ─── Tool Definitions ────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'dharma_search',
      description:
        'Semantic search across Buddhist texts (Pali Canon, Theravada, Mahayana, Vajrayana). ' +
        'Returns relevant passages with tradition, school, and concept metadata. ' +
        'Requires LM Studio with nomic-embed-text. Falls back to keyword search if unavailable. ' +
        'Examples: "what is suffering", "nature of emptiness", "dependent origination", "bodhisattva path".',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query about Buddhist philosophy' },
          limit: { type: 'number', description: 'Max results (default 5, max 10)', default: 5 },
          tradition: { type: 'string', description: 'Filter: theravada|mahayana|vajrayana|chan_zen' },
          text_type: { type: 'string', description: 'Filter: sutra|vinaya|abhidharma|commentary|treatise|poetry' },
          period: { type: 'string', description: 'Filter: early|classical|medieval|modern' },
          balanced: { type: 'boolean', description: 'Use tradition-balanced stratified sampling (default true). Ensures results from all three major traditions.', default: true },
        },
        required: ['query'],
      },
    },
    {
      name: 'dharma_concept',
      description:
        'Look up a Buddhist concept by term in any language (English, Sanskrit, Pali, Tibetan, Chinese). ' +
        'Returns multilingual equivalents, definition, category, and relevant passages. ' +
        'Examples: "sunyata", "dukkha", "paticcasamuppada", "emptiness", "bodhicitta".',
      inputSchema: {
        type: 'object' as const,
        properties: {
          term: { type: 'string', description: 'Buddhist term in any language' },
          limit: { type: 'number', description: 'Max passages to return (default 5)', default: 5 },
        },
        required: ['term'],
      },
    },
    {
      name: 'dharma_keyword',
      description:
        'Keyword search across Buddhist texts. Works without LM Studio. ' +
        'Searches both English and original language content. ' +
        'Use for exact phrase matching or when semantic search is unavailable.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Keywords to search for' },
          limit: { type: 'number', description: 'Max results (default 10)', default: 10 },
          tradition: { type: 'string', description: 'Filter by tradition' },
          text_type: { type: 'string', description: 'Filter by text type' },
        },
        required: ['query'],
      },
    },
    {
      name: 'dharma_text',
      description:
        'Retrieve a specific Buddhist text by its database ID. ' +
        'Returns full metadata and all chunks for the text.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          text_id: { type: 'number', description: 'Database text ID' },
        },
        required: ['text_id'],
      },
    },
    {
      name: 'dharma_compare',
      description:
        'Compare how different texts or traditions treat a topic. ' +
        'Provide a topic and two or more text IDs to compare their treatment.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          topic: { type: 'string', description: 'The topic to compare across texts' },
          text_ids: {
            type: 'array',
            items: { type: 'number' },
            description: 'Array of text IDs to compare',
          },
          limit: { type: 'number', description: 'Max chunks per text (default 3)', default: 3 },
        },
        required: ['topic', 'text_ids'],
      },
    },
    {
      name: 'dharma_etymology',
      description:
        'Trace a Buddhist term across Sanskrit, Pali, Tibetan, Chinese, and English. ' +
        'Returns multilingual equivalents, definition, usage frequency, and example passages. ' +
        'Examples: "dukkha", "nirvana", "karma", "dharma", "prajna".',
      inputSchema: {
        type: 'object' as const,
        properties: {
          term: { type: 'string', description: 'Buddhist term to trace' },
        },
        required: ['term'],
      },
    },
    {
      name: 'dharma_stats',
      description: 'Get statistics about the Bodhidharma Buddhist text database.',
      inputSchema: {
        type: 'object' as const,
        properties: {},
      },
    },
    {
      name: 'dharma_parallel',
      description:
        'Search parallel text alignments from the DharmaMitra MITRA-parallel corpus. ' +
        'Contains 1.74M sentence-aligned pairs across Sanskrit, Chinese, and Tibetan. ' +
        'Search by text content, source reference, or filter by language pair. ' +
        'Examples: search for a Sanskrit verse to find its Chinese/Tibetan parallels.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Text to search for in parallel alignments' },
          source_ref: { type: 'string', description: 'Source reference ID to look up (e.g., "DN1", "T08n0235")' },
          source_lang: { type: 'string', description: 'Filter by source language: sanskrit|chinese|tibetan|pali' },
          target_lang: { type: 'string', description: 'Filter by target language: sanskrit|chinese|tibetan|pali' },
          limit: { type: 'number', description: 'Max results (default 10, max 50)', default: 10 },
        },
      },
    },
    {
      name: 'dharma_dictionary',
      description:
        'Look up Buddhist terms in the DharmaMitra StarDict dictionaries. ' +
        'Contains 4M+ entries across multiple Sanskrit-Tibetan, Pali-English, and other dictionaries. ' +
        'Returns definitions, cross-dictionary matches, and linguistic information. ' +
        'Examples: "dharma", "sunyata", "bodhicitta", any Sanskrit/Tibetan/Pali term.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          term: { type: 'string', description: 'Term to look up (any script/language)' },
          headword_lang: { type: 'string', description: 'Filter by headword language' },
          definition_lang: { type: 'string', description: 'Filter by definition language' },
          limit: { type: 'number', description: 'Max results (default 10, max 50)', default: 10 },
        },
        required: ['term'],
      },
    },
    {
      name: 'dharma_textual_matches',
      description:
        'Search textual matches from the DharmaMitra corpus (174K+ intertextual parallels). ' +
        'Finds similar, parallel, or quoted passages across Buddhist collections. ' +
        'Search by text content, filter by collection or match type. ' +
        'Examples: search for a passage to find its parallels in other collections.',
      inputSchema: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Text to search for in textual matches' },
          collection: { type: 'string', description: 'Filter by source or target collection name' },
          match_type: { type: 'string', description: 'Filter by match type: parallel|similar|quotation' },
          limit: { type: 'number', description: 'Max results (default 10, max 50)', default: 10 },
        },
        required: ['query'],
      },
    },
  ],
}));

// ─── Tool Handlers ───────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request: CallToolRequest) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'dharma_search': {
        const query = args?.query as string;
        if (!query) return error('query parameter is required');

        const limit = Math.min((args?.limit as number) || 5, 10);
        // balanced defaults to true unless explicitly set to false
        const balanced = args?.balanced !== false;
        const filters: SearchFilters = {};
        if (args?.tradition) filters.tradition = args.tradition as any;
        if (args?.text_type) filters.text_type = args.text_type as any;
        if (args?.period) filters.period = args.period as any;

        const { available } = await checkLMStudio();
        if (!available) {
          // Fallback to keyword
          const result = keywordSearch(query, { limit, filters: Object.keys(filters).length > 0 ? filters : undefined });
          return text(
            '(Note: LM Studio unavailable - using keyword fallback)\n\n' +
            `Search: "${result.query}"\n\n` +
            formatSearchResults(result.results)
          );
        }

        const result = await semanticSearch(query, {
          limit,
          balanced,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        });
        const modeLabel = result.balanced ? ' [balanced]' : '';
        return text(
          `Search: "${result.query}"${modeLabel} (${result.searchTimeMs}ms)\n` +
          `Found ${result.results.length} results\n\n` +
          formatSearchResults(result.results)
        );
      }

      case 'dharma_concept': {
        const term = args?.term as string;
        if (!term) return error('term parameter is required');

        const limit = Math.min((args?.limit as number) || 5, 20);
        const result = conceptSearch(term, { limit });

        if (!result) {
          return text(`No concept found for "${term}". Try a different spelling or language.`);
        }

        return text(formatConceptResult(result));
      }

      case 'dharma_keyword': {
        const query = args?.query as string;
        if (!query) return error('query parameter is required');

        const limit = Math.min((args?.limit as number) || 10, 20);
        const filters: SearchFilters = {};
        if (args?.tradition) filters.tradition = args.tradition as any;
        if (args?.text_type) filters.text_type = args.text_type as any;

        const result = keywordSearch(query, {
          limit,
          filters: Object.keys(filters).length > 0 ? filters : undefined,
        });
        return text(
          `Keyword search: "${result.query}"\n` +
          `Found ${result.results.length} results\n\n` +
          formatSearchResults(result.results)
        );
      }

      case 'dharma_text': {
        const textId = args?.text_id as number;
        if (!textId) return error('text_id parameter is required');

        const db = getDatabase();
        const textRecord = getTextById(db, textId);
        if (!textRecord) {
          db.close();
          return text(`Text ID ${textId} not found.`);
        }

        const chunks = getChunksByText(db, textId);
        db.close();

        const lines = [
          `## ${textRecord.title_en}`,
          textRecord.title_original ? `*${textRecord.title_original}*` : null,
          '',
          `| Field | Value |`,
          `|-------|-------|`,
          `| Source | ${textRecord.source_id} |`,
          `| Tradition | ${textRecord.tradition} |`,
          `| School | ${textRecord.school} |`,
          `| Type | ${textRecord.text_type} |`,
          `| Period | ${textRecord.period} |`,
          `| Language | ${textRecord.original_lang} |`,
          textRecord.translator ? `| Translator | ${textRecord.translator} |` : null,
          `| Chunks | ${chunks.length} |`,
          `| Words | ${textRecord.word_count.toLocaleString()} |`,
          `| License | ${textRecord.license} |`,
          `| URL | ${textRecord.source_url} |`,
          '',
          `### Content (${chunks.length} chunks)`,
          '',
          ...chunks.map((c, i) => [
            `**Chunk ${i + 1}/${chunks.length}**${c.section ? ` — ${c.section}` : ''}`,
            c.content_en.substring(0, 500) + (c.content_en.length > 500 ? '...' : ''),
            '',
          ]).flat(),
        ].filter(Boolean);

        return text(lines.join('\n'));
      }

      case 'dharma_compare': {
        const topic = args?.topic as string;
        const textIds = args?.text_ids as number[];
        if (!topic || !textIds || textIds.length < 2) {
          return error('topic and at least 2 text_ids are required');
        }

        const limit = (args?.limit as number) || 3;
        const result = await compareTexts(topic, textIds, { limit });

        const lines = [
          `## Comparison: "${result.topic}"`,
          '',
        ];

        for (const t of result.texts) {
          lines.push(`### ${t.text.title_en} (${t.text.tradition})`);
          if (t.relevant_chunks.length === 0) {
            lines.push('No passages found for this topic in this text.');
          } else {
            lines.push(formatSearchResults(t.relevant_chunks));
          }
          lines.push('');
        }

        return text(lines.join('\n'));
      }

      case 'dharma_etymology': {
        const term = args?.term as string;
        if (!term) return error('term parameter is required');

        const result = etymologySearch(term);
        if (!result) {
          return text(`No etymology found for "${term}".`);
        }

        return text(formatEtymologyResult(result));
      }

      case 'dharma_stats': {
        try {
          const stats = getStats();
          const lines = [
            'Bodhidharma Database Statistics:',
            `- Total texts: ${stats.total_texts.toLocaleString()}`,
            `- Total chunks: ${stats.total_chunks.toLocaleString()}`,
            `- With embeddings: ${stats.chunks_with_embeddings.toLocaleString()}`,
            `- Concepts defined: ${stats.total_concepts.toLocaleString()}`,
            `- Concept occurrences: ${stats.concept_occurrences.toLocaleString()}`,
            `- Cross references: ${stats.cross_references.toLocaleString()}`,
            `- Parallel alignments: ${stats.parallel_alignments.toLocaleString()}`,
            `- Dictionary entries: ${stats.dictionary_entries.toLocaleString()}`,
            `- Textual matches: ${stats.textual_matches.toLocaleString()}`,
            `- Database size: ${stats.db_size_mb} MB`,
          ];

          if (Object.keys(stats.sources).length > 0) {
            lines.push('\nBy Source:');
            for (const [src, data] of Object.entries(stats.sources)) {
              lines.push(`  ${src}: ${data.texts} texts, ${data.chunks} chunks`);
            }
          }

          if (Object.keys(stats.traditions).length > 0) {
            lines.push('\nBy Tradition:');
            for (const [t, c] of Object.entries(stats.traditions)) {
              lines.push(`  ${t}: ${c} texts`);
            }
          }

          if (stats.chunks_with_embeddings > 0 && stats.total_chunks > 0) {
            const coverage = (stats.chunks_with_embeddings / stats.total_chunks * 100).toFixed(1);
            lines.push(`\nEmbedding coverage: ${coverage}%`);
          }

          return text(lines.join('\n'));
        } catch {
          return error('Database not found. Run the pipeline first.');
        }
      }

      case 'dharma_parallel': {
        const query = args?.query as string | undefined;
        const sourceRef = args?.source_ref as string | undefined;
        if (!query && !sourceRef) return error('Either query or source_ref is required');

        const limit = Math.min((args?.limit as number) || 10, 50);
        const db = getDatabase();

        let results;
        if (sourceRef) {
          results = searchParallelByRef(db, sourceRef, limit);
        } else {
          results = searchParallelAlignments(db, query!, {
            source_lang: args?.source_lang as string | undefined,
            target_lang: args?.target_lang as string | undefined,
            limit,
          });
        }
        db.close();

        if (results.length === 0) {
          return text('No parallel alignments found. Ensure the MITRA-parallel corpus has been imported.');
        }

        const lines = [`## Parallel Alignments (${results.length} results)\n`];
        for (const r of results) {
          lines.push(`**${r.source_lang} → ${r.target_lang}**`);
          if (r.source_ref || r.target_ref) {
            lines.push(`Refs: ${r.source_ref || '—'} ↔ ${r.target_ref || '—'}`);
          }
          if (r.alignment_score !== null) {
            lines.push(`Score: ${r.alignment_score.toFixed(3)}`);
          }
          lines.push(`> ${r.source_text.substring(0, 200)}${r.source_text.length > 200 ? '...' : ''}`);
          lines.push(`> ${r.target_text.substring(0, 200)}${r.target_text.length > 200 ? '...' : ''}`);
          lines.push('');
        }

        return text(lines.join('\n'));
      }

      case 'dharma_dictionary': {
        const term = args?.term as string;
        if (!term) return error('term parameter is required');

        const limit = Math.min((args?.limit as number) || 10, 50);

        try {
          const dictDb = getDictDatabase();
          const results = lookupDictionary(dictDb, term, {
            headword_lang: args?.headword_lang as string | undefined,
            definition_lang: args?.definition_lang as string | undefined,
            limit,
          });

          if (results.length === 0) {
            // Try FTS fallback
            const ftsResults = searchDictionaryFTS(dictDb, term, limit);
            dictDb.close();

            if (ftsResults.length === 0) {
              return text(`No dictionary entries found for "${term}". Ensure StarDict dictionaries have been imported.`);
            }

            const lines = [`## Dictionary: "${term}" (${ftsResults.length} FTS results)\n`];
            for (const e of ftsResults) {
              lines.push(`**${e.headword}** (${e.headword_lang} → ${e.definition_lang})`);
              lines.push(`*${e.dictionary_name}*`);
              lines.push(e.definition.substring(0, 300) + (e.definition.length > 300 ? '...' : ''));
              lines.push('');
            }
            return text(lines.join('\n'));
          }

          dictDb.close();

          const lines = [`## Dictionary: "${term}" (${results.length} results)\n`];
          for (const e of results) {
            lines.push(`**${e.headword}** (${e.headword_lang} → ${e.definition_lang})`);
            lines.push(`*${e.dictionary_name}*`);
            if (e.pos) lines.push(`Part of speech: ${e.pos}`);
            lines.push(e.definition.substring(0, 500) + (e.definition.length > 500 ? '...' : ''));
            lines.push('');
          }

          return text(lines.join('\n'));
        } catch {
          return error('Dictionary database not available. Import StarDict dictionaries first.');
        }
      }

      case 'dharma_textual_matches': {
        const query = args?.query as string;
        if (!query) return error('query parameter is required');

        const limit = Math.min((args?.limit as number) || 10, 50);
        const db = getDatabase();

        const results = searchTextualMatches(db, query, {
          collection: args?.collection as string | undefined,
          match_type: args?.match_type as string | undefined,
          limit,
        });
        db.close();

        if (results.length === 0) {
          return text('No textual matches found. Ensure the DharmaMitra textual matches have been imported.');
        }

        const lines = [`## Textual Matches (${results.length} results)\n`];
        for (const r of results) {
          lines.push(`**${r.match_type}**`);
          if (r.source_collection || r.target_collection) {
            lines.push(`Collections: ${r.source_collection || '—'} ↔ ${r.target_collection || '—'}`);
          }
          if (r.source_ref || r.target_ref) {
            lines.push(`Refs: ${r.source_ref || '—'} ↔ ${r.target_ref || '—'}`);
          }
          if (r.match_score !== null) {
            lines.push(`Score: ${r.match_score.toFixed(3)}`);
          }
          lines.push(`> ${r.source_segment.substring(0, 200)}${r.source_segment.length > 200 ? '...' : ''}`);
          lines.push(`> ${r.target_segment.substring(0, 200)}${r.target_segment.length > 200 ? '...' : ''}`);
          lines.push('');
        }

        return text(lines.join('\n'));
      }

      default:
        return error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    return error((err as Error).message);
  }
});

// ─── Helpers ─────────────────────────────────────────────

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

function error(message: string) {
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
}

// ─── Start Server ────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Bodhidharma MCP Server running');
}

main().catch(console.error);
