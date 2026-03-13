#!/usr/bin/env bun
/**
 * Bodhidharma - Buddhist Philosophy RAG CLI
 *
 * dharma-db pipeline|import|chunk|embed|build|search|concept|keyword|etymology|stats|sources
 */
import { getImporter, getAvailableSources, getSourceStatus } from './src/source-registry';
import {
  initializeDatabase, getDatabase, insertText, insertChunks,
  updateChunkConcepts, seedConcepts, getAllConcepts, getStats, getDatabasePath,
  getParallelAlignmentCount, getTextualMatchCount,
  initializeDictDatabase, getDictionaryEntryCount, getDictionaryNames, getDictDatabasePath,
} from './src/db';
import { chunkText } from './src/chunker';
import { extractAndStoreConceptsForChunk, loadSeedConcepts, clearMatcherCache } from './src/concept-extractor';
import { embedAllChunks, checkLMStudio } from './src/embedder';
import {
  semanticSearch, conceptSearch, keywordSearch, ftsSearch, etymologySearch,
  formatSearchResults, formatConceptResult, formatEtymologyResult,
} from './src/search';
import { populateCrossReferences } from './src/cross-references';
import { rebuildFTS5 } from './src/db';
import { importMitraParallel, isMitraParallelAvailable, getMitraParallelSetupInstructions } from './src/importers/mitra-parallel';
import { importStarDictionaries, isStarDictAvailable, getStarDictSetupInstructions } from './src/importers/stardict';
import { importDvarapandita, isDvarapanditaAvailable, getDvarapanditaSetupInstructions } from './src/importers/dvarapandita';
import type { SourceId, SearchFilters } from './src/types';

const HELP = `
Bodhidharma - Buddhist Philosophy RAG
======================================

Multilingual Buddhist text search across Pali, Sanskrit, Tibetan, Chinese, and English.

Commands:
  sources                              Show available data sources and status
  import <source> [--limit N] [-v]     Import texts from a source
  chunk [--source S] [-v]              Chunk imported texts
  embed [-v]                           Generate embeddings via LM Studio
  build [-v]                           Full import+chunk+concept pipeline for a source
  search "query" [--limit N]           Semantic search (requires LM Studio)
  concept "term"                       Concept lookup (any language)
  keyword "query" [--limit N]          Keyword search (LIKE, no LM Studio needed)
  fts "query" [--limit N]             Full-text search (FTS5, fast + Chinese support)
  etymology "term"                     Trace a term across languages
  cross-refs [-v]                      Populate cross-references between texts
  rebuild-fts                          Rebuild FTS5 full-text search index
  stats                                Database statistics
  pipeline <source> [--limit N] [-v]   Full pipeline: import -> chunk -> concept -> embed

DharmaMitra Imports:
  import-mitra [--limit N] [-v]        Import MITRA parallel corpus (Sanskrit/Chinese/Tibetan)
  import-stardict [--limit N] [-v]     Import StarDict dictionaries (4M+ entries)
  import-dvarapandita [--limit N] [-v] Import textual match data across canons

Filters (for search/keyword/fts):
  --tradition theravada|mahayana|vajrayana|chan_zen
  --type sutra|vinaya|abhidharma|commentary|treatise|poetry
  --period early|classical|medieval|modern
  --source suttacentral|gretil|buddhanexus|lotsawa_house|dsbc|cbeta

Sources:
  suttacentral       Pali Canon (CC0, ~17,500 texts)
  accesstoinsight    Theravada translations (~900 texts)
  gretil             Sanskrit Buddhist texts (CC-BY-NC-SA, ~200 texts)
  buddhanexus        Sanskrit parallel texts (CC0, ~500 texts)
  lotsawa_house      Tibetan translations (educational, ~500 texts)
  dsbc               Digital Sanskrit Buddhist Canon (academic, ~300 texts)
  cbeta              Chinese Buddhist Canon (CC-BY-NC-SA, ~5,400 texts)

Examples:
  dharma-db pipeline suttacentral --limit 500 -v
  dharma-db pipeline cbeta --limit 20 -v
  dharma-db search "what is suffering"
  dharma-db concept "sunyata"
  dharma-db keyword "dependent origination" --tradition theravada
  dharma-db fts "般若波羅蜜" --source cbeta
  dharma-db etymology "dukkha"
  dharma-db cross-refs -v
`;

function parseArgs(args: string[]): {
  command: string;
  positional: string[];
  limit?: number;
  verbose: boolean;
  source?: string;
  tradition?: string;
  type?: string;
  period?: string;
} {
  const command = args[0] || 'help';
  const positional: string[] = [];
  let limit: number | undefined;
  let verbose = false;
  let source: string | undefined;
  let tradition: string | undefined;
  let type: string | undefined;
  let period: string | undefined;

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--verbose' || arg === '-v') { verbose = true; continue; }
    if (arg === '--limit' || arg === '-n') { limit = parseInt(args[++i]); continue; }
    if (arg.startsWith('--limit=')) { limit = parseInt(arg.split('=')[1]); continue; }
    if (arg === '--source') { source = args[++i]; continue; }
    if (arg.startsWith('--source=')) { source = arg.split('=')[1]; continue; }
    if (arg === '--tradition') { tradition = args[++i]; continue; }
    if (arg.startsWith('--tradition=')) { tradition = arg.split('=')[1]; continue; }
    if (arg === '--type') { type = args[++i]; continue; }
    if (arg.startsWith('--type=')) { type = arg.split('=')[1]; continue; }
    if (arg === '--period') { period = args[++i]; continue; }
    if (arg.startsWith('--period=')) { period = arg.split('=')[1]; continue; }
    if (!arg.startsWith('-')) positional.push(arg);
  }

  return { command, positional, limit, verbose, source, tradition, type, period };
}

function buildFilters(parsed: ReturnType<typeof parseArgs>): SearchFilters | undefined {
  if (!parsed.tradition && !parsed.type && !parsed.period && !parsed.source) return undefined;
  return {
    tradition: parsed.tradition as any,
    text_type: parsed.type as any,
    period: parsed.period as any,
    source_id: parsed.source as any,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs(args);
  const { command, positional, limit, verbose } = parsed;

  console.log('');

  switch (command) {
    case 'help':
    case '--help':
    case '-h':
      console.log(HELP);
      break;

    case 'sources': {
      console.log('Bodhidharma - Available Sources');
      console.log('================================\n');
      const statuses = await getSourceStatus();
      for (const s of statuses) {
        const status = s.available ? '✓ Available' : '✗ Not found';
        console.log(`  ${s.source.id.padEnd(20)} ${status}`);
        console.log(`    ${s.source.description}`);
        console.log(`    License: ${s.source.license}`);
        if (s.available) {
          console.log(`    Estimated texts: ${s.estimatedTexts.toLocaleString()}`);
        } else {
          console.log(`    Setup: ${s.source.access_method}`);
        }
        console.log('');
      }
      break;
    }

    case 'import': {
      const sourceId = positional[0] as SourceId;
      if (!sourceId) {
        console.error('Usage: dharma-db import <source> [--limit N] [-v]');
        console.error(`Sources: ${getAvailableSources().join(', ')}`);
        process.exit(1);
      }

      console.log(`Importing from ${sourceId}...`);
      const db = initializeDatabase();

      // Seed concepts first
      const seedData = loadSeedConcepts();
      if (seedData.length > 0) {
        const seeded = seedConcepts(db, seedData);
        if (verbose) console.log(`Seeded ${seeded} concepts`);
      }

      const concepts = getAllConcepts(db);
      const importer = getImporter(sourceId);

      if (!await importer.isAvailable()) {
        console.error(importer.getSetupInstructions());
        db.close();
        process.exit(1);
      }

      let textCount = 0;
      let chunkCount = 0;

      for await (const importedText of importer.import({ limit, verbose })) {
        // Insert text record
        const textId = insertText(db, importedText);

        // Chunk the text
        const chunkInputs = chunkText(importedText, textId);
        if (chunkInputs.length === 0) continue;

        // Insert chunks
        const chunkIds = insertChunks(db, chunkInputs);

        // Extract concepts for each chunk
        for (let i = 0; i < chunkIds.length; i++) {
          const conceptIds = extractAndStoreConceptsForChunk(
            db, chunkIds[i],
            chunkInputs[i].content_en,
            chunkInputs[i].content_original,
            concepts
          );
          if (conceptIds.length > 0) {
            updateChunkConcepts(db, chunkIds[i], conceptIds);
          }
        }

        textCount++;
        chunkCount += chunkIds.length;

        if (verbose && textCount % 100 === 0) {
          console.log(`  ${textCount} texts, ${chunkCount} chunks`);
        }
      }

      db.close();
      console.log(`\nImport complete: ${textCount} texts, ${chunkCount} chunks`);
      break;
    }

    case 'embed': {
      console.log('Generating Embeddings');
      console.log('=====================\n');

      const { available, models } = await checkLMStudio();
      if (!available) {
        console.error('LM Studio not available. Start LM Studio and load nomic-embed-text-v1.5.');
        process.exit(1);
      }
      console.log(`LM Studio connected. Models: ${models.join(', ')}\n`);

      const db = getDatabase();
      const result = await embedAllChunks(db, { verbose });
      db.close();

      console.log(`\nDone! ${result.embedded} new embeddings (${result.total} total chunks)`);
      break;
    }

    case 'search': {
      const query = positional[0];
      if (!query) {
        console.error('Usage: dharma-db search "your query" [--limit N]');
        process.exit(1);
      }

      const filters = buildFilters(parsed);
      const result = await semanticSearch(query, { limit: limit || 5, filters });
      console.log(`Search: "${result.query}" (${result.searchTimeMs}ms)\n`);
      console.log(formatSearchResults(result.results));
      break;
    }

    case 'concept': {
      const term = positional[0];
      if (!term) {
        console.error('Usage: dharma-db concept "term" (any language)');
        process.exit(1);
      }

      const result = conceptSearch(term, { limit: limit || 10 });
      if (!result) {
        console.log(`No concept found for "${term}"`);
      } else {
        console.log(formatConceptResult(result));
      }
      break;
    }

    case 'keyword': {
      const query = positional[0];
      if (!query) {
        console.error('Usage: dharma-db keyword "query" [--limit N]');
        process.exit(1);
      }

      const filters = buildFilters(parsed);
      const result = keywordSearch(query, { limit: limit || 10, filters });
      console.log(`Keyword search: "${result.query}"\n`);
      console.log(formatSearchResults(result.results));
      break;
    }

    case 'etymology': {
      const term = positional[0];
      if (!term) {
        console.error('Usage: dharma-db etymology "term"');
        process.exit(1);
      }

      const result = etymologySearch(term);
      if (!result) {
        console.log(`No etymology found for "${term}"`);
      } else {
        console.log(formatEtymologyResult(result));
      }
      break;
    }

    case 'stats': {
      console.log('Bodhidharma - Database Statistics');
      console.log('==================================\n');

      try {
        const stats = getStats();
        console.log(`Total texts:         ${stats.total_texts.toLocaleString()}`);
        console.log(`Total chunks:        ${stats.total_chunks.toLocaleString()}`);
        console.log(`With embeddings:     ${stats.chunks_with_embeddings.toLocaleString()}`);
        console.log(`Concepts defined:    ${stats.total_concepts.toLocaleString()}`);
        console.log(`Concept occurrences: ${stats.concept_occurrences.toLocaleString()}`);
        console.log(`Cross references:    ${stats.cross_references.toLocaleString()}`);
        console.log(`Database size:       ${stats.db_size_mb} MB`);

        // DharmaMitra integration stats
        const parallelCount = stats.parallel_alignments ?? 0;
        const textualCount = stats.textual_matches ?? 0;
        if (parallelCount > 0 || textualCount > 0) {
          console.log('\nDharmaMitra Integration:');
          console.log(`  Parallel alignments: ${parallelCount.toLocaleString()}`);
          console.log(`  Textual matches:     ${textualCount.toLocaleString()}`);
        }

        // Dictionary stats (separate DB)
        try {
          const dictDb = initializeDictDatabase();
          const dictCount = getDictionaryEntryCount(dictDb);
          if (dictCount > 0) {
            const dictNames = getDictionaryNames(dictDb);
            console.log(`  Dictionary entries:  ${dictCount.toLocaleString()} (${dictNames.length} dictionaries)`);
            console.log(`  Dictionary DB:       ${getDictDatabasePath()}`);
          }
          dictDb.close();
        } catch {
          // Dictionary DB not yet created — skip
        }

        if (Object.keys(stats.sources).length > 0) {
          console.log('\nBy Source:');
          for (const [src, data] of Object.entries(stats.sources)) {
            console.log(`  ${src.padEnd(20)} ${data.texts} texts, ${data.chunks} chunks`);
          }
        }

        if (Object.keys(stats.traditions).length > 0) {
          console.log('\nBy Tradition:');
          for (const [trad, count] of Object.entries(stats.traditions)) {
            console.log(`  ${trad.padEnd(20)} ${count} texts`);
          }
        }

        if (Object.keys(stats.languages).length > 0) {
          console.log('\nBy Language:');
          for (const [lang, count] of Object.entries(stats.languages)) {
            console.log(`  ${lang.padEnd(20)} ${count} texts`);
          }
        }

        if (stats.chunks_with_embeddings > 0 && stats.total_chunks > 0) {
          const coverage = (stats.chunks_with_embeddings / stats.total_chunks * 100).toFixed(1);
          console.log(`\nEmbedding coverage: ${coverage}%`);
        }
      } catch {
        console.log('Database not found. Run a pipeline first:');
        console.log('  dharma-db pipeline suttacentral --limit 100 -v');
      }
      break;
    }

    case 'pipeline': {
      const sourceId = positional[0] as SourceId;
      if (!sourceId) {
        console.error('Usage: dharma-db pipeline <source> [--limit N] [-v]');
        console.error(`Sources: ${getAvailableSources().join(', ')}`);
        process.exit(1);
      }

      console.log('Bodhidharma - Full Pipeline');
      console.log('===========================\n');

      // Step 1: Import + Chunk + Concepts
      console.log(`Step 1/2: Import + chunk + concepts from ${sourceId}...\n`);

      const db = initializeDatabase();

      // Seed concepts
      const seedData = loadSeedConcepts();
      if (seedData.length > 0) {
        const seeded = seedConcepts(db, seedData);
        console.log(`Seeded ${seeded} concepts`);
      }
      clearMatcherCache();
      const concepts = getAllConcepts(db);

      const importer = getImporter(sourceId);
      if (!await importer.isAvailable()) {
        console.error(importer.getSetupInstructions());
        db.close();
        process.exit(1);
      }

      let textCount = 0;
      let chunkCount = 0;

      for await (const importedText of importer.import({ limit, verbose })) {
        const textId = insertText(db, importedText);
        const chunkInputs = chunkText(importedText, textId);
        if (chunkInputs.length === 0) continue;

        const chunkIds = insertChunks(db, chunkInputs);

        for (let i = 0; i < chunkIds.length; i++) {
          const conceptIds = extractAndStoreConceptsForChunk(
            db, chunkIds[i],
            chunkInputs[i].content_en,
            chunkInputs[i].content_original,
            concepts
          );
          if (conceptIds.length > 0) {
            updateChunkConcepts(db, chunkIds[i], conceptIds);
          }
        }

        textCount++;
        chunkCount += chunkIds.length;

        if (verbose && textCount % 100 === 0) {
          console.log(`  ${textCount} texts, ${chunkCount} chunks`);
        }
      }

      console.log(`\nImported ${textCount} texts, ${chunkCount} chunks\n`);

      // Step 2: Embed
      console.log('Step 2/2: Generating embeddings...\n');
      const { available } = await checkLMStudio();
      if (!available) {
        console.log('LM Studio not available - skipping embeddings.');
        console.log('Start LM Studio and run: dharma-db embed\n');
      } else {
        await embedAllChunks(db, { verbose });
      }

      db.close();

      // Show final stats
      console.log('\n===========================');
      console.log('Pipeline Complete!');
      console.log('===========================\n');

      const stats = getStats();
      console.log(`Texts:             ${stats.total_texts.toLocaleString()}`);
      console.log(`Chunks:            ${stats.total_chunks.toLocaleString()}`);
      console.log(`With embeddings:   ${stats.chunks_with_embeddings.toLocaleString()}`);
      console.log(`Concepts matched:  ${stats.concept_occurrences.toLocaleString()}`);
      console.log(`Database size:     ${stats.db_size_mb} MB`);
      console.log(`Database path:     ${getDatabasePath()}`);

      if (stats.chunks_with_embeddings > 0) {
        console.log('\nReady for search:');
        console.log('  dharma-db search "what is suffering"');
        console.log('  dharma-db concept "sunyata"');
      } else {
        console.log('\nKeyword search available now:');
        console.log('  dharma-db keyword "dependent origination"');
      }
      break;
    }

    case 'fts': {
      const query = positional[0];
      if (!query) {
        console.error('Usage: dharma-db fts "query" [--limit N]');
        process.exit(1);
      }

      const filters = buildFilters(parsed);
      const result = ftsSearch(query, { limit: limit || 10, filters });
      console.log(`FTS search: "${result.query}"\n`);
      console.log(formatSearchResults(result.results));
      break;
    }

    case 'cross-refs': {
      console.log('Populating Cross-References');
      console.log('===========================\n');

      const db = getDatabase();
      const count = populateCrossReferences(db, verbose);
      db.close();

      console.log(`\nAdded ${count} cross-references`);
      break;
    }

    case 'rebuild-fts': {
      console.log('Rebuilding FTS5 Index');
      console.log('=====================\n');

      const db = initializeDatabase();
      const count = rebuildFTS5(db);
      db.close();

      console.log(`Indexed ${count} chunks for full-text search`);
      break;
    }

    case 'import-mitra': {
      console.log('Importing MITRA Parallel Corpus');
      console.log('================================\n');

      if (!isMitraParallelAvailable()) {
        console.error(getMitraParallelSetupInstructions());
        process.exit(1);
      }

      const db = initializeDatabase();
      const count = await importMitraParallel(db, { verbose, limit });
      db.close();

      console.log(`\nImported ${count.toLocaleString()} parallel alignments`);
      break;
    }

    case 'import-stardict': {
      console.log('Importing StarDict Dictionaries');
      console.log('================================\n');

      if (!isStarDictAvailable()) {
        console.error(getStarDictSetupInstructions());
        process.exit(1);
      }

      const dictDb = initializeDictDatabase();
      const count = await importStarDictionaries(dictDb, { verbose, limit });
      dictDb.close();

      console.log(`\nImported ${count.toLocaleString()} dictionary entries`);
      break;
    }

    case 'import-dvarapandita': {
      console.log('Importing Dvarapandita Textual Matches');
      console.log('=======================================\n');

      if (!isDvarapanditaAvailable()) {
        console.error(getDvarapanditaSetupInstructions());
        process.exit(1);
      }

      const db = initializeDatabase();
      const count = await importDvarapandita(db, { verbose, limit });
      db.close();

      console.log(`\nImported ${count.toLocaleString()} textual matches`);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      console.log('Run "dharma-db help" for usage.');
      process.exit(1);
  }
}

main().catch(error => {
  console.error('Error:', error.message);
  process.exit(1);
});
