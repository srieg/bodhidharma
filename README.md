# Bodhidharma

**An Interactive Knowledge Graph for Buddhist Philosophical Concepts Across Traditions**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Texts](https://img.shields.io/badge/Texts-11%2C156-orange.svg)](#data-sources)
[![Languages](https://img.shields.io/badge/Languages-Sanskrit%20%7C%20Pali%20%7C%20Tibetan%20%7C%20Chinese-green.svg)](#multilingual-support)
[![Concepts](https://img.shields.io/badge/Concepts-413-purple.svg)](#features)

---

Bodhidharma maps the relational structure of Buddhist philosophy across Theravada, Mahayana, and Vajrayana traditions. Built on a corpus of 11,156 texts (681,543 chunks, 4.6 GB), it extracts 413 philosophical concepts and 472 cross-references into a navigable, force-directed graph --- giving researchers a single interface to trace how ideas like dependent origination, emptiness, and buddha-nature connect, diverge, and transform across canonical and commentarial literature.

**[Live Demo](https://srieg.github.io/bodhidharma/)**

---

## Why This Exists

Buddhist philosophical concepts do not exist in isolation. *Pratityasamutpada* connects to *sunyata* connects to *tathagatagarbha* --- across languages, centuries, and traditions that developed largely independently of one another. A scholar working on Nagarjuna's *Mulamadhyamakakarika* encounters terms that echo in the Pali Nikayas and reappear, transformed, in Tibetan *dbu ma* commentaries and Chinese *Sanlun* treatises.

No existing tool lets a researcher visually navigate these relationships across the full breadth of the Buddhist canon. The alternatives are scattered: individual text databases ([SuttaCentral](https://suttacentral.net), [CBETA](https://www.cbeta.org), [84000](https://84000.co)), dictionary lookup tools, and the researcher's own mental model built over years of study.

Bodhidharma provides what has been missing: a single, interactive interface where you can see how concepts relate across all three major traditions, with original-language terms preserved, source texts accessible inline, and the entire graph explorable in 22 languages. It is a map of the territory that Buddhist studies has been charting for over a century.

---

## Features

### Knowledge Graph Visualization

- **Force-directed graph** renders all 413 concepts and 472 cross-references as an interactive network
- **2D mode** with visible labels and fisheye proximity zoom for detailed local exploration
- **3D mode** for spatial navigation through the full concept space
- **Fly mode** (3D) --- WASD keyboard navigation lets you move through the graph as a navigable environment
- **Category color-coding** distinguishes doctrinal domains at a glance

### Multilingual Support

- **Original-language terms** for every concept: Sanskrit, Pali, Tibetan (Wylie), and Chinese characters --- always visible, never translated away
- **22-language translation** via Google Translate for all English content, including source document text
- Researchers can work in their native language while original scholarly terminology remains intact

### Source Text Integration

- **Concept-to-text linking** --- click any concept node to see which texts in the corpus reference it
- **Inline reading** --- read source passages directly within the interface without switching tools
- **Corpus scale** --- 11,156 texts spanning the Pali Canon, Mahayana sutras, Vajrayana tantras, and commentarial literature

### Exploration Tools

- **Concept wiki pages** --- deep-dive into any concept with definition, multilingual terms, all connections, and bibliography
- **Thread navigation** --- build exploration paths through connected concepts, creating a traceable research trail
- **Category filtering** --- isolate concepts by domain: meditation, doctrine, cosmology, ethics, soteriology, epistemology, and more
- **Fuzzy search** across concept names and all original-language terms (Sanskrit, Pali, Tibetan, Chinese)

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `/` | Open search |
| `?` | Show help |
| `3` | Toggle 3D mode |
| `T` | Translate |
| `L` | Toggle legend |

---

## For Researchers

### Cross-Tradition Analysis

Trace how the same concept operates across traditions. See how *sunyata* (emptiness) connects differently in Madhyamaka (as the ultimate nature of all phenomena), Yogacara (as the emptiness of subject-object duality), and Theravada Abhidhamma (as one of the three marks of existence). The graph makes these structural differences visible rather than implicit.

### Corpus Navigation

Move fluidly from concept to source text to related concept. Starting from a node like "dependent origination," you can reach the specific Pali sutta passages, Nagarjuna's verses, and Tsongkhapa's commentaries that discuss it --- then follow cross-references to connected concepts like "emptiness" or "the two truths" --- all without leaving the interface.

### Multilingual Research

Every concept preserves its terms in the original languages of transmission. When examining *bodhicitta*, you see simultaneously: the Sanskrit *bodhicitta*, the Pali *bodhicitta*, the Tibetan *byang chub kyi sems*, and the Chinese characters. This makes Bodhidharma useful for philological work and cross-linguistic comparison.

### Network Analysis

The graph structure reveals properties that linear reading cannot. Identify highly-connected hub concepts that serve as doctrinal keystones. Find unexpected bridges between domains --- how a cosmological concept connects to a soteriological one through an ethical intermediate. Discover which concepts are structurally central to a tradition and which are peripheral.

### Translation Support

Activate translation into any of 22 languages to work in your native language. All English-language definitions, descriptions, and source text translations are rendered in the target language, while original Sanskrit, Pali, Tibetan, and Chinese terms are preserved untranslated --- maintaining scholarly precision alongside accessibility.

---

## Getting Started

Bodhidharma is a single HTML file with no build step and no dependencies to install.

```bash
# Clone the repository
git clone https://github.com/srieg/bodhidharma.git
cd bodhidharma

# Open directly in your browser
open index.html
```

Or visit the **[live demo on GitHub Pages](https://srieg.github.io/bodhidharma/)**.

### Source Text Integration (Optional)

To enable inline reading of source texts from the corpus, start the local text API:

```bash
# Requires Bun (https://bun.sh)
bun install
bun text-api.ts
```

This starts a local API on port 3821 that serves source text passages on demand. The knowledge graph will automatically detect and connect to it. Without the text API, all graph features work normally --- you simply will not have inline source text access.

### Building the Corpus (Optional)

The RAG pipeline can ingest and embed texts from supported sources. See the CLI for available commands:

```bash
bun cli.ts --help
```

---

## Architecture

### Knowledge Graph (Frontend)

- **Single-file HTML application** --- all 413 concepts and their relationships are embedded inline
- **[D3.js](https://d3js.org/)** powers the 2D force-directed layout with fisheye distortion
- **[3d-force-graph](https://github.com/vasturiano/3d-force-graph)** provides the 3D WebGL visualization
- **Google Translate Element** handles 22-language translation client-side
- **WCAG 2.1 AA compliant** --- skip links, focus management, keyboard navigation, reduced motion support

### RAG System (Backend)

- **MCP Server** (`mcp-server.ts`) --- Model Context Protocol server exposing 7 tools for semantic search, concept lookup, text retrieval, and comparative analysis
- **Text API** (`text-api.ts`) --- lightweight HTTP server on port 3821 serving source text passages to the knowledge graph
- **CLI** (`cli.ts`) --- pipeline for importing, chunking, embedding, and indexing Buddhist texts
- **Vector database** --- SQLite with embeddings via nomic-embed-text (LM Studio)

---

## Data Sources

### Corpus

The underlying corpus comprises **11,156 texts** organized into **681,543 chunks** totaling **4.6 GB** of Buddhist literature:

- **Pali Canon** --- Vinaya, Sutta, and Abhidhamma Pitakas, sourced primarily via [SuttaCentral](https://suttacentral.net)
- **Mahayana Sutras** --- Prajnaparamita literature, Avatamsaka, Lankavatara, Vimalakirti, Lotus Sutra, and others
- **Vajrayana Texts** --- Selected tantras and sadhanas
- **Commentarial Literature** --- Major Indian, Tibetan, and Chinese commentaries including works by Nagarjuna, Vasubandhu, Buddhaghosa, Tsongkhapa, and Zhiyi
- **Modern Scholarship** --- Selected secondary sources and translations

### Concept Extraction

The 413 concepts and 472 cross-references were extracted from the corpus through a combination of automated analysis and manual curation, identifying philosophical terms that appear across multiple texts and traditions. Each concept is annotated with:

- English definition
- Original-language terms (Sanskrit, Pali, Tibetan, Chinese) where attested
- Doctrinal category classification
- Cross-references to related concepts
- Source text citations

---

## Contributing

Contributions are welcome, particularly from scholars with domain expertise in Buddhist philosophy.

### Ways to Contribute

- **Add or improve concept definitions** --- corrections, nuances, or additional context
- **Add multilingual terms** --- fill in missing Sanskrit, Pali, Tibetan, or Chinese terms for existing concepts
- **Propose new concepts** --- suggest philosophical terms that should be included in the graph
- **Add cross-references** --- identify connections between concepts that are not yet mapped
- **Expand source text coverage** --- contribute additional text references for existing concepts
- **Report issues** --- inaccuracies, broken links, or UI problems

Please open an issue to discuss proposed changes before submitting a pull request, especially for additions that involve scholarly interpretation.

---

## License

MIT License. See [LICENSE](LICENSE) for details.

---

## Acknowledgments

This project would not be possible without the extraordinary work of these organizations and communities:

### Text Sources

- **[SuttaCentral](https://suttacentral.net)** --- Pali Canon texts and translations, made freely available under open licenses. SuttaCentral is the most comprehensive collection of early Buddhist texts, providing parallel texts in over 40 languages.
- **[84000: Translating the Words of the Buddha](https://84000.co)** --- Tibetan Buddhist canon translations. 84000 is a global non-profit working to translate the Tibetan Buddhist canon into modern languages.
- **[CBETA (Chinese Buddhist Electronic Text Association)](https://www.cbeta.org)** --- The Chinese Buddhist canon in digital form. CBETA has been digitizing Chinese Buddhist texts since 1998, making the Taisho Tripitaka and other collections freely available.
- **[GRETIL (Goettingen Register of Electronic Texts in Indian Languages)](https://gretil.sub.uni-goettingen.de)** --- Sanskrit and Prakrit source texts from the University of Goettingen's digital library of Indian language texts.
- **[BuddhaNexus](https://buddhanexus.net)** --- Cross-lingual parallel text matching for Buddhist canonical literature, enabling identification of textual parallels across Sanskrit, Pali, Tibetan, and Chinese sources.
- **[Access to Insight](https://www.accesstoinsight.org)** --- A longstanding resource for Theravada Buddhist texts in English translation.

### Libraries

- **[D3.js](https://d3js.org/)** --- Data visualization library by Mike Bostock
- **[3d-force-graph](https://github.com/vasturiano/3d-force-graph)** --- 3D graph visualization by Vasco Asturiano
- **[Model Context Protocol](https://modelcontextprotocol.io)** --- Open protocol for AI tool integration by Anthropic

### Related Work

This project draws on a growing body of work at the intersection of digital humanities and Buddhist studies, including efforts in computational analysis of Pali and Sanskrit corpora, network modeling of philosophical systems, and multilingual digital editions of canonical texts. Bodhidharma aims to complement these efforts by providing an accessible, visual entry point into the relational structure of Buddhist thought.

---

Built with curiosity and care by [Sam Riegel](https://github.com/srieg), with [Claude](https://claude.ai) as collaborator.
