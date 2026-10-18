# Additional dictionary data: license and attribution

## Exact distribution boundary

The new selected dictionary data is supplied under Creative Commons Attribution-ShareAlike 4.0 International (CC BY-SA 4.0): https://creativecommons.org/licenses/by-sa/4.0/ . The license applies to the new tables in `lib/presets-en-broad.ts`, `lib/presets-ja-broad.ts`, and `lib/presets-broad-scopes.ts`, and to the corresponding selected data in `approved-pairs.json` when that research file is distributed. Retain this notice, the original source notices below, the license link, and the description of changes when sharing these tables or adaptations. The TypeScript type/import wrappers are software, not a change to the data's terms.

The application's existing software license remains MIT. Newly written `lib/presets-broad-guards.ts` and the import/append integration changes in `lib/presets.ts` are also MIT software. Existing dictionaries keep their existing notices. This notice does not relicense the whole application. A compiled bundle contains components with different terms; it must not be described as entirely MIT with the data notices omitted.

## What was used and what is shipped

wordfreq 3.1.1 was used offline to prioritize source words, followed by independent semantic/scope review and original development checks. The shipped runtime tables contain source strings, replacement strings, style membership, and source-scope labels. They contain no wordfreq frequency values, numerical ranks, frequency database, or wordfreq package dependency. The selected collection was nevertheless influenced by that data, so CC BY-SA 4.0 is used conservatively for this new data collection. This is not a legal claim that merely consulting a frequency value necessarily creates an adaptation, or that every use of every individual word is restricted.

No Universal Dependencies corpus text, personal input, private evaluation text, model credential, or runtime NLP dictionary is included. Separate research diagnostics may contain rankings and must not be copied into an application without their own provenance/terms review.

## Source attribution and changes

- Princeton WordNet 3.1, Princeton University: https://wordnet.princeton.edu/ . Original copyright, permission, and disclaimer notices are retained in `public/licenses/Princeton-WordNet-LICENSE.txt` and `public/licenses/WORDNET-LICENSE.txt`.
- Japanese WordNet, National Institute of Information and Communications Technology (NICT): https://bond-lab.github.io/wnja/ . Its original notice is retained in `public/licenses/Japanese-WordNet-LICENSE.txt`.
- wordfreq 3.1.1, Robyn Speer: https://github.com/rspeer/wordfreq . Its software is Apache 2.0, distinct from the included data's CC BY-SA 4.0 terms. Retain `public/licenses/wordfreq-NOTICE.md` and `public/licenses/wordfreq-LICENSE.txt`. The original notice also credits Google Books Ngrams, Leeds Internet Corpus, Wikipedia, ParaCrawl, OPUS OpenSubtitles 2018/OpenSubtitles, and SUBTLEX datasets by Marc Brysbaert and colleagues. SUBTLEX remains freely available data. These source notices are retained without claiming that the complete upstream datasets are bundled here.

Changes for this project: directional synonym extraction; independently AI-reviewed semantic and grammatical scope; explicit style limits; rejection of known counterexamples and spelling-only alternatives; source-first deduplication; finite-form generation where individually reviewed; and source-only protective scope labels. No upstream source endorses this app. Reviews are AI judgments, not human ground truth or a guarantee of interchangeability in every context.

Creative Commons distinguishes a collection from an adaptation; exact legal classification depends on the material and applicable law. The explicit per-file separation is intended to preserve notices without claiming that all independent software becomes CC-licensed: https://creativecommons.org/faq/#if-i-create-a-collection-that-includes-a-work-offered-under-a-cc-license-which-licenses-may-i-choose-for-the-collection . This document is an implementation/provenance record, not legal advice.
