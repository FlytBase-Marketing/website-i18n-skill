# 06: CMS content and blogs (Bucket 2)

## Document-level vs field-level

```
Does the type have its own URL?
├── yes ──► DOCUMENT-LEVEL: one document per locale, linked to the source
│           (blog post, case study, CMS landing page, glossary term, FAQ, webinar, event)
└── no ───► Is it referenced by other documents?
            ├── yes ──► FIELD-LEVEL: one document, each translatable field holds per-locale values,
            │           read with a fallback to source (author, category, tag, testimonial, speaker)
            └── no ───► SINGLE-LOCALE: record why in the schema
                        (press items in their original language, partner logos, global settings;
                         header and footer copy belongs in Bucket 1 messages)
```

**Why the split matters:**

- **Document-level** gives each locale its own publish state, dates, SEO and
  drafts. You can publish French without blocking German.
- **Field-level** keeps references intact. A blog post points at one author,
  not nine.
- **Field-level for long rich text** bloats documents and blocks per-locale
  drafts.
- **Document-level for referenced entities** breaks every reference.

## Platform mapping

| CMS | Document-level | Field-level | Gotchas |
|---|---|---|---|
| **Sanity** | `@sanity/document-internationalization`: a `language` field, plus a `translation.metadata` doc linking the variants. Variant `_id` = `<sourceId>-<locale>` (truncate and hash past the 128-char ID limit) | `sanity-plugin-internationalized-array`. Read with `coalesce(field[language == $locale][0].value, field[_key == $locale][0].value, field[language == "en"][0].value, field[_key == "en"][0].value)` (newer plugin versions store the locale in `language`, older data in `_key`) | Newer plugin versions store the locale in a `language` property and the `_key` is random. Reading by `_key` breaks the moment the Studio re-saves. Audit and backfill. Fetch metadata, sitemap and JSON-LD with stega off |
| **Contentful** | Usually field-level by design (each field has locales). Emulate document-level with an entry per locale, or a `slug` per locale plus a "translated" flag | Built in: `locale` param on the Content Delivery API | **The fallback chain makes missing fields silently return the fallback locale.** Do not derive "translation exists" from a non-empty field. Use an explicit per-locale `published`/`translated` flag or compare to the source |
| **Strapi v5** | i18n is built in: per-locale documents sharing a `documentId`, fetched with `?locale=fr`, plus `localizations` | Non-localized fields are shared across locales | Enable i18n per content type. Each locale publishes independently |
| **Markdown/MDX in repo** | `content/blog/{locale}/{slug}.mdx` (or `{slug}.{locale}.mdx`) | n/a. Authors and categories in a data file with per-locale keys | Link variants with frontmatter `translationKey`. Track `sourceHash` for staleness. Localized slugs need the map built from `translationKey` |
| **WordPress** | WPML or Polylang (a post per language, linked) | Strings via WPML String Translation | Check that hreflang is emitted server-side and that the language switcher links to equivalents |
| **Webflow** | Localization feature (per-locale subdirectories, hreflang built in) | Per-locale CMS fields | Check the locale slugs, `x-default`, and that machine-translated locales are reviewed |

## Fan-out on publish

The routine path is a webhook on publish of a **source-locale, non-draft**
document of a translatable type. It does this:

1. **Skip conditions:** non-source locale, a draft, a type not in
   `TRANSLATABLE`, or nothing changed.
2. For each target locale, in parallel:
   - Create the variant if it is missing (seeded with the source slug).
   - **Fill only:** translate source fields where the variant's field is
     empty. Never overwrite a non-empty variant field, so reviewer edits
     survive.
   - **Inherit non-translatable fields** fill-only: images, references,
     dates, booleans, enums. The reference project first shipped variants
     with null cover images, authors and categories, so localized pages lost
     their images and tags.
   - Stamp `translationStatus = { state: 'auto', sourceRev: <source _rev> }`.
   - Link the variant in the translation metadata.
3. Revalidate each variant's path, listing pages and the sitemap child.
4. **Run the work after the response** (`after()`, `waitUntil`, or a queue).
   The webhook must return fast, and a failure must not block publishing.

**One implementation.** The webhook and the manual repair script call the
same fan-out module. If they diverge, "what happens on publish" and "what the
repair does" produce different variants.

**Field map** (`TRANSLATABLE`): per type, list `strings`, `arrays`
(string lists), `blocks` (rich text) and `objects` (`seo: [title,
description]`). A type in the map but not registered as localized in the CMS
plugin should be skipped and logged, not half-translated.

### Webhooks cannot self-heal

A delivery lost after the CMS exhausts its retries is never revisited. Add
both of these:

- **A drift report**, weekly and read-only. It lists every source document
  whose variants are missing, unpublished, or on a different slug than the
  source. It exits non-zero on drift.
- **A repair run** (manual dispatch) using the same fan-out module.
- **An accepted-untranslated list** for types with no localized URL (for
  example, videos rendered only inside a translated event page). They are
  reported but not counted, so the check does not go permanently red.

Do not nightly-sweep every document "just in case." On the reference
project, a nightly sweep would have made about 166,000 CMS requests a month,
versus about 200 for the webhook, for identical translation spend.

### Slugs

- Seed the variant slug from the source on creation (mirrored policy), or
  translate and slugify it (localized policy). Keep paths ASCII.
- **Slug sync is opt-in** (`--sync-slugs`). The dry run prints the pending
  renames, so the redirect list is known before anything is written.
- Every rename ships with a redirect for that locale's old URL.

## Detail pages (blog post, case study)

- **Static params:** the (locale, slug) pairs that exist, read from the CMS.
- **Loader:** query by `slug` and `language == $locale`. If nothing comes
  back, 404. Do not fall back to the source at the localized URL (see
  02 Fallback).
- **The query also projects the translation cluster:**
  ```groq
  "translations": *[_type == "translation.metadata" && references(^._id)][0]
    .translations[]{ "locale": coalesce(language, _key), "slug": value->slug.current }
  ```
  Drop entries whose `slug` is null (draft-only variant). Pass the result as
  `available` to the alternates builder, and use the same data in the
  switcher and the sitemap.
- **Metadata:** localized `seo.title` and `seo.description` (falling back to
  the localized title, never to English), `og:locale`, localized OG image alt.
- **JSON-LD:** `Article` with `inLanguage`, localized headline, the variant's
  dates, author URL in the locale.

## Blog-specific details

| Topic | Rule |
|---|---|
| Listing pages (`/fr/blog`, category, tag, author, page 2+) | Query `language == $locale`. Do not mix English posts into the French list. If you deliberately show untranslated posts, label them and link to the source URL, never to a fake `/fr/...` |
| Pagination | Each page self-canonical. Same locale on every page. Same page size across locales to avoid empty pages |
| Related posts and "read next" | Filter to the locale. Fall back to fewer items, not to English URLs |
| Authors, categories, tags | Field-level. Names, bios and descriptions use the coalesce fallback. Archive pages exist per locale only when they list at least one post |
| Dates | `Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone })` on the server. Variant `publishedAt` may equal the source; `dateModified` is the variant's own |
| Reading time | Words per minute for space-separated scripts. Characters per minute (~400-600) for ja and zh. Compute per locale |
| RSS/Atom | One feed per locale (`/fr/blog/rss.xml`) with `<language>fr</language>`. Linked with `<link rel="alternate" type="application/rss+xml" hreflang="fr">` |
| Search | A separate index per locale (Algolia index per locale, Pagefind per-language bundles). Query the active locale |
| Comments, newsletter | Capture the locale. Send emails in the subscriber's locale |
| Table of contents and anchors | Generate heading IDs from the localized heading, or keep stable IDs from the source. Never link `#english-anchor` on a French page |
| Images in body | Inherit the image. **Translate the alt text** (it lives in the rich text or image object) |
| Embedded CTAs and forms | Labels from Bucket 1 messages. Never hardcoded in rich text |
| FAQ blocks | Translate the questions and answers. FAQPage JSON-LD comes from the localized data |

## Staleness and review

- A variant stores `sourceRev` (CMS revision) or `sourceHash` (Markdown).
- `stale = variant.sourceRev != source._rev`, computed at query time and shown
  as an editor queue (a CMS dashboard or a weekly report).
- Promoting a variant `auto` to `reviewed` freezes `sourceRev`. A later
  source edit makes it stale again.
- Field-level types have no per-locale status. Their translation runs
  per-field: find fields missing a value for the locale, translate from the
  source value, append.

## Editor rules (put these in the project doc)

- Always write in the source locale first. A document created directly in
  French has no source parent and is orphaned.
- Edit translations in the CMS (per-locale tab or field switcher), never by
  re-running a fill-only script and expecting an overwrite.
- A UI label (button, nav item) belongs in messages, not in a CMS field.
