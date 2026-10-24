// Builds the Planner tab into one ES module + one stylesheet that Improve loads on demand:
//   ../js/planner/planner.js  and  ../js/planner/planner.css
// Every CSS rule is scoped under .planner-root so it can't affect Improve's other tabs.
import { defineConfig, type Plugin } from 'vite';

const SCOPE = '.planner-root';

/** PostCSS plugin: prefix every selector with .planner-root (and map :root/html/body onto it). */
function scopeCss() {
  return {
    postcssPlugin: 'planner-scope',
    Rule(rule: { selector: string; parent?: { type: string; name?: string }; scoped?: boolean }) {
      if (rule.scoped) return;
      if (rule.parent?.type === 'atrule' && /keyframes$/.test(rule.parent.name ?? '')) return;
      rule.selector = rule.selector
        .split(',')
        .map((s) => {
          const sel = s.trim();
          if (/^(:root|html|body)(\s*,|$)/.test(sel) || sel === 'html, body') return SCOPE;
          if (/^(html|body)\b/.test(sel)) return sel.replace(/^(html|body)/, SCOPE);
          if (sel.startsWith(':root')) return sel.replace(':root', SCOPE);
          if (sel === '*') return `${SCOPE}, ${SCOPE} *`;
          return `${SCOPE} ${sel}`;
        })
        .join(', ');
      rule.scoped = true;
    },
  };
}
scopeCss.postcss = true;

export default defineConfig({
  base: './',
  esbuild: { jsx: 'automatic', jsxImportSource: 'preact' },
  css: { postcss: { plugins: [scopeCss() as never] } },
  build: {
    outDir: '../js/planner',
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: { entry: 'src/mount.tsx', formats: ['es'], fileName: () => 'planner.js', cssFileName: 'planner' },
    minify: true,
  },
  define: { 'process.env.NODE_ENV': '"production"' },
  test: { include: ['test/**/*.test.ts'] },
} as never);
