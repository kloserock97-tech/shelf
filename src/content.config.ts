import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { TYPE_IDS } from './lib/taxonomy';

// One item = one folder: items/<slug>/item.md (public) or private/<slug>/item.md (this machine only).
const items = defineCollection({
  loader: glob({
    pattern: '{items,private}/*/item.md',
    base: '.',
    generateId: ({ entry }) => entry.replace(/\\/g, '/').split('/')[1]
  }),
  schema: z.object({
    title: z.string(),
    type: z.enum(TYPE_IDS),
    status: z.enum(['stable', 'draft']).default('draft'),
    summary: z.string(),
    tech: z.array(z.string()).default([]),
    tags: z.array(z.coerce.string()).default([]),
    added: z.coerce.date(),
    updated: z.coerce.date().optional(),
    origin: z.enum(['own', 'adapted', 'third-party']).default('own'),
    source: z.string().optional(),
    repo: z.string().optional(),
    priorArt: z.string().optional(),
    license: z.string().default('PolyForm-Noncommercial-1.0.0'),
    registry: z.string().optional(),
    depends: z.array(z.string()).default([]),
    demo: z
      .object({
        path: z.string().optional(),
        url: z.string().optional(),
        background: z.enum(['auto', 'light', 'dark']).default('auto'),
        grid: z.boolean().default(false)
      })
      .default({ background: 'auto', grid: false }),
    poster: z.string().optional(),
    loop: z.string().optional(),
    variants: z
      .array(z.object({ id: z.string(), label: z.string(), files: z.array(z.string()).optional() }))
      .default([]),
    collections: z.array(z.string()).default([]),
    related: z.array(z.string()).default([])
  })
});

export const collections = { items };
