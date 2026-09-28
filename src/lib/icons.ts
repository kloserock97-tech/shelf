// Build-time icons: Lucide 1.48 (ISC), rendered to inline SVG. SF Symbols are not licensed for the web.
import * as lucide from 'lucide-static';
import { cleanSvg } from './svg';

const set = lucide as unknown as Record<string, string>;

export const icon = (name: string, stroke?: number) => {
  const svg = set[name];
  if (!svg) throw new Error(`Unknown Lucide icon: ${name}`);
  return cleanSvg(svg, stroke);
};
